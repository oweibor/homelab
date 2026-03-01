'use strict';

/**
 * Scrape API Routes.
 * REST API endpoints for the scraper service.
 * 
 * @module routes/scrape
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const scraperService = require('../services/scraper');
const scraperStorage = require('../services/scraper/storage');
const scraperNextcloud = require('../services/scraper/nextcloudWriter');
const auth = require('../middleware/auth');
const logger = require('../services/logger');

const router = express.Router();

// Rate limiter for public health endpoint - 100 requests per minute
const healthRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});

/**
 * POST /scrape/start
 * Start a new scrape job.
 */
router.post('/scrape/start', auth, async (req, res) => {
    try {
        const {
            target_url,
            extraction_type,
            pagination,
            anti_bot,
            output_collection,
            priority,
        } = req.body;

        // Validate required fields
        if (!target_url) {
            return res.status(400).json({
                error: 'target_url is required',
            });
        }

        // Validate URL format
        try {
            new URL(target_url);
        } catch {
            return res.status(400).json({
                error: 'Invalid target_url format',
            });
        }

        const result = await scraperService.startScrape({
            target_url,
            extraction_type,
            pagination,
            anti_bot,
            output_collection,
            priority,
        });

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/status/:jobId
 * Get status of a specific job.
 */
router.get('/scrape/status/:jobId', auth, async (req, res) => {
    try {
        const { jobId } = req.params;

        const status = scraperService.getJobStatus(jobId);

        if (!status) {
            return res.status(404).json({
                error: 'Job not found',
            });
        }

        res.json(status);
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * POST /scrape/stop/:jobId
 * Stop a running job.
 */
router.post('/scrape/stop/:jobId', auth, async (req, res) => {
    try {
        const { jobId } = req.params;

        const success = scraperService.stopJob(jobId);

        if (!success) {
            return res.status(404).json({
                error: 'Job not found or not running',
            });
        }

        res.json({
            job_id: jobId,
            status: 'stopped',
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/jobs
 * List all scrape jobs.
 */
router.get('/scrape/jobs', auth, async (req, res) => {
    try {
        const { status } = req.query;

        const jobs = scraperService.listJobs(status);

        res.json({
            jobs,
            count: jobs.length,
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/results/:jobId
 * Get extracted results for a job.
 */
router.get('/scrape/results/:jobId', auth, async (req, res) => {
    try {
        const { jobId } = req.params;

        const job = scraperService.getJobStatus(jobId);

        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
            });
        }

        // Return results summary (actual content would be in storage)
        res.json({
            job_id: jobId,
            status: job.status,
            progress: job.progress,
            results: {
                categories_found: job.progress?.categories_found || 0,
                products_extracted: job.progress?.products_extracted || 0,
            },
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/health
 * Health check for scraper service.
 * Note: This endpoint is intentionally public - does not expose sensitive config.
 * Rate limited to prevent abuse.
 */
router.get('/scrape/health', healthRateLimiter, async (req, res) => {
    try {
        // Check Crawl4AI connectivity
        const crawl4aiClient = scraperService.crawl4ai;
        const crawl4aiHealthy = crawl4aiClient ? await crawl4aiClient.healthCheck().catch(() => false) : false;

        // Check storage connectivity
        const storageReady = await scraperService.isStorageReady().catch(() => false);

        const allHealthy = crawl4aiHealthy && storageReady;

        res.json({
            status: allHealthy ? 'healthy' : 'degraded',
            services: {
                crawl4ai: crawl4aiHealthy ? 'up' : 'down',
                storage: storageReady ? 'up' : 'down',
            },
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
        });
    }
});

/**
 * POST /scrape/search
 * Search scraped content using vector similarity.
 */
router.post('/scrape/search', auth, async (req, res) => {
    try {
        const { query, job_id, limit = 10, min_score = 0.5 } = req.body;

        if (!query) {
            return res.status(400).json({
                error: 'query is required',
            });
        }

        const results = await scraperStorage.search(query, {
            job_id,
            limit,
            minScore: min_score,
        });

        res.json({
            results,
            count: results.length,
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/storage/stats
 * Get storage statistics.
 */
router.get('/scrape/storage/stats', auth, async (req, res) => {
    try {
        const stats = await scraperStorage.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * DELETE /scrape/storage/:jobId
 * Delete all scraped content for a job.
 */
router.delete('/scrape/storage/:jobId', auth, async (req, res) => {
    try {
        const { jobId } = req.params;

        const deleted = await scraperStorage.deleteByJob(jobId);

        res.json({
            job_id: jobId,
            deleted,
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * POST /scrape/export/:jobId
 * Export scraped data to Nextcloud CSV.
 * 
 * Query params:
 *   - format: Export format (simple, woocommerce, products, categories)
 */
router.post('/scrape/export/:jobId', auth, async (req, res) => {
    try {
        const { jobId } = req.params;
        const { format = 'simple' } = req.query;

        // Check if job exists
        const job = scraperService.getJobStatus(jobId);
        if (!job) {
            return res.status(404).json({
                error: 'Job not found',
            });
        }

        // Get scraped data from storage
        const pages = await scraperStorage.getPagesByJob(jobId);

        if (pages.length === 0) {
            return res.status(404).json({
                error: 'No data found for this job',
            });
        }

        // Check Nextcloud availability
        const nextcloudAvailable = await scraperNextcloud.isAvailable();
        if (!nextcloudAvailable) {
            return res.status(503).json({
                error: 'Nextcloud export not available. Check NEXTCLOUD_DATA_PATH configuration.',
            });
        }

        // Export to Nextcloud
        const result = await scraperNextcloud.exportToNextcloud(jobId, pages, format);

        logger.info('Exported scrape data to Nextcloud', {
            jobId,
            rows: result.rows,
            format
        });

        res.json({
            job_id: jobId,
            exported: result.rows,
            format,
            path: result.path,
            nextcloud_url: result.url,
            message: 'Export complete. File available in Nextcloud Files/Crawls/'
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

/**
 * GET /scrape/export/list
 * List all available exports.
 */
router.get('/scrape/export/list', auth, async (req, res) => {
    try {
        const exports = scraperNextcloud.listExports();
        res.json({
            exports,
            count: exports.length,
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
        });
    }
});

module.exports = router;
