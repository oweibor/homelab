'use strict';

/**
 * Qdrant Storage Integration for Scraped Content.
 * 
 * Stores scraped pages as vector embeddings in Qdrant for semantic search.
 * 
 * @module services/scraper/storage
 */

const qdrantClient = require('../qdrant');
const embeddings = require('../embeddings');
const logger = require('../logger');
const scraperConfig = require('./config');
const scraperMetrics = require('./metrics');
const crypto = require('crypto');

/**
 * Storage service for scraped content.
 */
class ScraperStorage {
    constructor() {
        this.collectionName = scraperConfig.qdrant.collectionName;
        this.vectorSize = scraperConfig.qdrant.vectorSize;
    }

    /**
     * Initialize the storage - ensure collection exists.
     */
    async initialize() {
        try {
            const collections = await qdrantClient.getCollections();
            const exists = collections.collections?.some(
                c => c.name === this.collectionName
            );

            if (!exists) {
                logger.info('Creating Qdrant collection for scraped content', {
                    name: this.collectionName,
                    vectorSize: this.vectorSize,
                });

                await qdrantClient.createCollection(this.collectionName, {
                    vectors: {
                        size: this.vectorSize,
                        distance: 'Cosine',
                    },
                    // Add payload fields for filtering
                    fields: [
                        { name: 'url', type: 'keyword' },
                        { name: 'title', type: 'text' },
                        { name: 'content', type: 'text' },
                        { name: 'job_id', type: 'keyword' },
                        { name: 'extracted_at', type: 'datetime' },
                        { name: 'metadata', type: 'json' },
                    ],
                });

                // Create index on url field for fast lookups
                await qdrantClient.createIndex(this.collectionName, 'url', 'keyword');
                await qdrantClient.createIndex(this.collectionName, 'job_id', 'keyword');
            }

            logger.info('Scraper storage initialized', { collection: this.collectionName });
        } catch (error) {
            logger.error('Failed to initialize scraper storage', { error: error.message });
            throw error;
        }
    }

    /**
     * Store a scraped page in Qdrant.
     * @param {object} pageData - Page data to store
     * @returns {Promise<string>} Stored ID
     */
    async storePage(pageData) {
        const {
            url,
            title,
            content,
            job_id,
            metadata = {},
        } = pageData;

        try {
            // Generate embedding for the content
            const vector = await embeddings.embed(content);

            const point = {
                id: this._generateId(url),
                vector,
                payload: {
                    url,
                    title: title || '',
                    content,
                    job_id,
                    extracted_at: new Date().toISOString(),
                    metadata,
                },
            };

            await qdrantClient.upsert(this.collectionName, {
                points: [point],
            });

            // Record metrics
            scraperMetrics.recordStorageOperation('store', 'success');
            scraperMetrics.recordBytesDownloaded(Buffer.byteLength(content, 'utf8'));

            logger.debug('Stored page in Qdrant', { url, job_id });

            return point.id;
        } catch (error) {
            logger.error('Failed to store page', { url, error: error.message });
            throw error;
        }
    }

    /**
     * Store multiple pages in batch.
     * @param {object[]} pages - Array of page data
     * @returns {Promise<string[]>} Array of stored IDs
     */
    async storePages(pages) {
        try {
            // Generate embeddings in batch
            const contents = pages.map(p => p.content);
            const vectors = await embeddings.embedBatch(contents);

            if (!vectors || vectors.length !== pages.length) {
                throw new Error(`Embedding generation failed: expected ${pages.length}, got ${vectors?.length || 0}`);
            }

            const points = pages.map((page, i) => ({
                id: this._generateId(page.url),
                vector: vectors[i],
                payload: {
                    url: page.url,
                    title: page.title || '',
                    content: page.content,
                    job_id: page.job_id,
                    extracted_at: new Date().toISOString(),
                    metadata: page.metadata || {},
                },
            }));

            await qdrantClient.upsert(this.collectionName, { points });

            logger.info('Stored pages in Qdrant', { count: pages.length, job_id: pages[0]?.job_id });

            return points.map(p => p.id);
        } catch (error) {
            logger.error('Failed to store pages batch', { error: error.message });
            throw error;
        }
    }

    /**
     * Search similar content.
     * @param {string} query - Search query
     * @param {object} options - Search options
     * @returns {Promise<object[]>} Search results
     */
    async search(query, options = {}) {
        const {
            job_id,
            limit = 10,
            minScore = 0.5,
        } = options;

        try {
            // Generate query embedding
            const vector = await embeddings.embed(query);

            // Build filter
            const filter = job_id ? { must: [{ key: 'job_id', match: { value: job_id } }] } : undefined;

            const results = await qdrantClient.search(this.collectionName, {
                vector,
                limit,
                score_threshold: minScore,
                filter,
            });

            scraperMetrics.recordStorageOperation('search', 'success');

            return results.map(r => ({
                id: r.id,
                url: r.payload.url,
                title: r.payload.title,
                content: r.payload.content,
                score: r.score,
                job_id: r.payload.job_id,
                metadata: r.payload.metadata,
            }));
        } catch (error) {
            logger.error('Search failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Get all pages for a job.
     * @param {string} jobId - Job ID
     * @returns {Promise<object[]>} Pages
     */
    async getPagesByJob(jobId) {
        try {
            const results = await qdrantClient.scroll(this.collectionName, {
                filter: { must: [{ key: 'job_id', match: { value: jobId } }] },
                limit: 1000,
            });

            return results.points?.map(p => ({
                id: p.id,
                url: p.payload.url,
                title: p.payload.title,
                content: p.payload.content,
                metadata: p.payload.metadata,
            })) || [];
        } catch (error) {
            logger.error('Failed to get pages by job', { jobId, error: error.message });
            throw error;
        }
    }

    /**
     * Delete all pages for a job.
     * @param {string} jobId - Job ID
     * @returns {Promise<number>} Deleted count
     */
    async deleteByJob(jobId) {
        try {
            const result = await qdrantClient.delete(this.collectionName, {
                filter: { must: [{ key: 'job_id', match: { value: jobId } }] },
            });

            logger.info('Deleted job pages from Qdrant', { jobId, deleted: result.deleted || 0 });

            return result.deleted || 0;
        } catch (error) {
            logger.error('Failed to delete job pages', { jobId, error: error.message });
            throw error;
        }
    }

    /**
     * Get collection stats.
     * @returns {Promise<object>} Stats
     */
    async getStats() {
        try {
            const info = await qdrantClient.getCollection(this.collectionName);

            const stats = {
                vectorsCount: info.vectors_count || 0,
                pointsCount: info.points_count || 0,
                status: info.status,
            };

            // Update metrics
            scraperMetrics.updateVectorCount(stats.vectorsCount);
            scraperMetrics.recordStorageOperation('stats', 'success');

            return stats;
        } catch (error) {
            logger.error('Failed to get stats', { error: error.message });
            scraperMetrics.recordStorageOperation('stats', 'error');
            return { vectorsCount: 0, pointsCount: 0, status: 'error' };
        }
    }

    /**
     * Generate a deterministic ID from URL.
     * @param {string} url - URL
     * @returns {string} ID
     */
    _generateId(url) {
        // Use SHA-256 hash for consistent IDs with low collision risk
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        return hash.substring(0, 12);
    }
}

// Export singleton
const scraperStorage = new ScraperStorage();

module.exports = scraperStorage;
module.exports.ScraperStorage = ScraperStorage;
