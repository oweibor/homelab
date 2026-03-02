'use strict';

/**
 * Scraper Service - OpenClaw + LangGraph + Crawl4AI Integration.
 * 
 * This module provides the orchestration layer for web scraping operations.
 * It integrates:
 * - OpenClaw: For triggering/monitoring scrapes via skills
 * - LangGraph: For state machine orchestration (pagination, retries)
 * - Crawl4AI: For actual page fetching and extraction
 * 
 * @module services/scraper
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const Crawl4AIClient = require('./crawl4ai/client');
const config = require('../config');
const scraperConfig = require('./config');
const scraperStorage = require('./storage');
const scraperMetrics = require('./metrics');
const { LangGraphRunner, FileCheckpointStore } = require('./langgraph');
const logger = require('../logger');

/**
 * Scrape job states
 */
const JOB_STATES = {
    PENDING: 'pending',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
};

/**
 * Scraper Service class.
 * Manages scrape jobs and orchestrates LangGraph state machines.
 */
class ScraperService extends EventEmitter {
    constructor() {
        super();
        this.crawl4ai = new Crawl4AIClient();
        this.jobs = new Map();
        this.profile = scraperConfig.getScrapeProfile();
        this.jobRetentionMs = 24 * 60 * 60 * 1000; // Keep jobs for 24 hours

        // Initialize checkpoint store - use main config which has correct CHECKPOINT_DIR
        const checkpointBasePath = config.CHECKPOINT_DIR
            || process.env.CHECKPOINT_DIR
            || '/var/kilo/checkpoints';

        this.checkpointStore = new FileCheckpointStore({
            basePath: checkpointBasePath,
        });

        // Initialize storage (Qdrant collection)
        this._initializeStorage().catch(err => {
            logger.warn('Scraper storage initialization deferred', { error: err.message });
        });

        // Start periodic cleanup of old jobs
        this._startJobCleanup();

        logger.info('Scraper service initialized', {
            profile: config.HARDWARE_PROFILE || 'unknown',
            maxConcurrent: this.profile.max_concurrent,
        });
    }

    /**
     * Periodically clean up old completed jobs to prevent memory leak.
     * @private
     */
    _startJobCleanup() {
        setInterval(() => {
            const now = Date.now();
            let cleaned = 0;

            for (const [jobId, job] of this.jobs.entries()) {
                const jobEndTime = job.completed_at || job.stopped_at;
                if (jobEndTime) {
                    const age = now - new Date(jobEndTime).getTime();
                    if (age > this.jobRetentionMs) {
                        this.jobs.delete(jobId);
                        cleaned++;
                    }
                }
            }

            if (cleaned > 0) {
                logger.debug('Cleaned up old scrape jobs', { count: cleaned });
            }
        }, 60 * 60 * 1000); // Run every hour
    }

    /**
     * Initialize storage - ensure Qdrant collection exists.
     * @private
     */
    async _initializeStorage() {
        try {
            await scraperStorage.initialize();
            logger.info('Scraper storage initialized');
        } catch (error) {
            logger.warn('Scraper storage initialization failed', { error: error.message });
        }
    }

    /**
     * Check if storage is ready for operations.
     * @returns {Promise<boolean>} Storage ready status
     */
    async isStorageReady() {
        try {
            await scraperStorage.getStats();
            return true;
        } catch (error) {
            logger.warn('Storage health check failed', { error: error.message });
            return false;
        }
    }

    /**
     * Start a new scrape job.
     * @param {object} options - Scrape options
     * @returns {Promise<object>} Job info
     */
    async startScrape(options) {
        const {
            target_url,
            extraction_type = 'product',
            pagination = { enabled: true, max_pages: 100 },
            anti_bot = scraperConfig.antiBot.mode,
            output_collection = scraperConfig.qdrant.collectionName,
            priority = 'normal',
        } = options;

        const job_id = `scrape-${uuidv4()}`;

        const job = {
            job_id,
            status: JOB_STATES.RUNNING,
            target_url,
            extraction_type,
            pagination,
            anti_bot,
            output_collection,
            priority,
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            progress: {
                pages_crawled: 0,
                products_extracted: 0,
                categories_found: 0,
                failed_pages: 0,
            },
            current_url: target_url,
            visited_urls: [],
            failed_urls: [],
            consecutive_failures: 0,
        };

        this.jobs.set(job_id, job);

        // Record metrics
        scraperMetrics.recordJobStarted();

        logger.info('Scrape job started', { job_id, target_url });

        // Emit event for OpenClaw integration
        this.emit('job:started', job);

        // Start the scraping process in background
        this._runScrapeJob(job).catch(err => {
            logger.error('Scrape job failed', { job_id, error: err.message });
            job.status = JOB_STATES.FAILED;
            job.error = err.message;
            this.emit('job:failed', job);
        });

        return {
            job_id,
            status: job.status,
            started_at: job.started_at,
            target_url,
        };
    }

    /**
     * Get job status.
     * @param {string} jobId - Job ID
     * @returns {object|null} Job status
     */
    getJobStatus(jobId) {
        const job = this.jobs.get(jobId);
        if (!job) {
            return null;
        }

        return {
            job_id: job.job_id,
            status: job.status,
            progress: job.progress,
            current_url: job.current_url,
            started_at: job.started_at,
            completed_at: job.completed_at,
            error: job.error,
        };
    }

    /**
     * List all jobs.
     * @param {string} status - Optional status filter
     * @returns {object[]} List of jobs
     */
    listJobs(status = null) {
        const jobs = Array.from(this.jobs.values());

        if (status) {
            return jobs.filter(j => j.status === status);
        }

        return jobs;
    }

    /**
     * Stop a running job.
     * @param {string} jobId - Job ID
     * @returns {boolean} Success
     */
    stopJob(jobId) {
        const job = this.jobs.get(jobId);

        if (!job) {
            return false;
        }

        if (job.status !== JOB_STATES.RUNNING) {
            return false;
        }

        job.status = JOB_STATES.CANCELLED;
        job.stopped_at = new Date().toISOString();

        logger.info('Scrape job stopped', { jobId });
        this.emit('job:stopped', job);

        return true;
    }

    /**
     * Internal: Run the scrape job using LangGraph-style state machine.
     * @param {object} job - Job object
     * @private
     */
    async _runScrapeJob(job) {
        // Create LangGraph runner
        const runner = new LangGraphRunner({
            crawl4ai: this.crawl4ai,
            checkpointStore: this.checkpointStore,
            onProgress: (progress) => {
                // Update job progress
                job.progress = {
                    pages_crawled: progress.pages_crawled,
                    products_extracted: progress.products_extracted,
                    categories_found: progress.categories_found,
                    failed_pages: progress.failed_pages,
                };
                job.current_url = progress.current_url;
                this.emit('job:progress', this.getJobStatus(job.job_id));
            },
            onComplete: (finalState) => {
                job.status = JOB_STATES.COMPLETED;
                job.completed_at = new Date().toISOString();
                job.progress = {
                    pages_crawled: finalState.visited_urls.length,
                    products_extracted: finalState.products.length,
                    categories_found: finalState.categories.length,
                    failed_pages: finalState.total_failures,
                    final: true,
                };

                // Record metrics
                scraperMetrics.recordJobCompleted('completed');
                scraperMetrics.recordPagesCrawled(finalState.visited_urls.length, 'success');
                scraperMetrics.recordItemsExtracted('product', finalState.products.length);
                scraperMetrics.recordItemsExtracted('category', finalState.categories.length);

                logger.info('Scrape job completed via LangGraph', {
                    job_id: job.job_id,
                    pages: finalState.visited_urls.length,
                    products: finalState.products.length,
                });
                this.emit('job:completed', job);
            },
            onError: (error) => {
                job.status = JOB_STATES.FAILED;
                job.error = error.message;

                // Record metrics
                scraperMetrics.recordJobCompleted('failed');

                logger.error('Scrape job failed via LangGraph', {
                    job_id: job.job_id,
                    error: error.message,
                });
                this.emit('job:failed', job);
            },
        });

        try {
            // Run the LangGraph
            await runner.run({
                job_id: job.job_id,
                target_url: job.target_url,
                extraction_type: job.extraction_type,
                max_pages: job.pagination?.max_pages || 100,
                anti_bot: job.anti_bot,
            });
        } catch (error) {
            job.status = JOB_STATES.FAILED;
            job.error = error.message;
            this.emit('job:failed', job);
            throw error;
        }
    }

    /**
     * Process a crawled page.
     * @param {object} state - Current state
     * @param {object} result - Crawl result
     * @param {object} job - Job object
     * @private
     */
    async _processPage(state, result, job) {
        if (job.extraction_type === 'category') {
            // Extract category links
            const categoryLinks = this._extractLinks(result.links, ['category', 'department', 'section']);
            state.categories.push(...categoryLinks);
        } else if (job.extraction_type === 'product') {
            // Extract product links
            const productLinks = this._extractLinks(result.links, ['product', 'item', 'pdp']);
            state.products.push(...productLinks);
        } else if (job.extraction_type === 'multi') {
            // Extract both categories and products
            const categoryLinks = this._extractLinks(result.links, ['category', 'department', 'section']);
            const productLinks = this._extractLinks(result.links, ['product', 'item', 'pdp']);

            state.categories.push(...categoryLinks);
            state.products.push(...productLinks);
        }
    }

    /**
     * Check if there's a next page.
     * @param {object} state - Current state
     * @param {object} result - Crawl result
     * @returns {Promise<boolean>} Has next page
     * @private
     */
    async _checkPagination(state, result) {
        // Check for common pagination patterns in links
        const nextPagePatterns = ['next', 'page', 'p=', 'page='];

        for (const link of result.links || []) {
            const href = link.href?.toLowerCase() || '';
            const text = link.text?.toLowerCase() || '';

            for (const pattern of nextPagePatterns) {
                if (href.includes(pattern) || text.includes(pattern)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Extract next page URL from links.
     * @param {Array} links - Array of links
     * @returns {string|null} Next page URL
     * @private
     */
    _extractNextPageUrl(links) {
        const nextPagePatterns = ['next', 'page', 'p=', 'page='];

        for (const link of links || []) {
            const href = link.href?.toLowerCase() || '';
            const text = link.text?.toLowerCase() || '';

            for (const pattern of nextPagePatterns) {
                if (href.includes(pattern) || text.includes(pattern)) {
                    return link.href;
                }
            }
        }

        return null;
    }

    /**
     * Extract links matching patterns.
     * @param {Array} links - Array of links
     * @param {Array} patterns - Patterns to match
     * @returns {Array} Filtered links
     * @private
     */
    _extractLinks(links, patterns) {
        return (links || []).filter(link => {
            const href = link.href?.toLowerCase() || '';
            const text = link.text?.toLowerCase() || '';

            return patterns.some(pattern =>
                href.includes(pattern) || text.includes(pattern)
            );
        });
    }

    /**
     * Sleep for specified milliseconds.
     * @param {number} ms - Milliseconds
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
const scraperService = new ScraperService();

module.exports = scraperService;
module.exports.JOB_STATES = JOB_STATES;
module.exports.ScraperService = ScraperService;
