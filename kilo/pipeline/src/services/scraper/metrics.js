'use strict';

/**
 * Scraper Prometheus Metrics.
 * Tracks web scraping operations for Prometheus/Grafana monitoring.
 * 
 * @module services/scraper/metrics
 */

const client = require('prom-client');
const logger = require('../logger');

// Create a Registry for scraper metrics (can be merged with main register)
const register = new client.Registry();

// Add default labels
register.setDefaultLabels({
    app: 'kilo-pipeline',
    service: 'scraper'
});

// --- Scraper Metrics ---

/**
 * Total scrape jobs started
 */
const scrapeJobStarted = new client.Counter({
    name: 'kilo_scrape_job_started_total',
    help: 'Total number of scrape jobs started',
    registers: [register]
});

/**
 * Total scrape jobs completed
 */
const scrapeJobCompleted = new client.Counter({
    name: 'kilo_scrape_job_completed_total',
    help: 'Total number of scrape jobs completed',
    labelNames: ['status'],
    registers: [register]
});

/**
 * Total pages crawled
 */
const pagesCrawled = new client.Counter({
    name: 'kilo_scrape_pages_crawled_total',
    help: 'Total number of pages crawled',
    labelNames: ['status'],
    registers: [register]
});

/**
 * Total products/pages extracted
 */
const itemsExtracted = new client.Counter({
    name: 'kilo_scrape_items_extracted_total',
    help: 'Total number of items (products, categories) extracted',
    labelNames: ['type'],
    registers: [register]
});

/**
 * Current active scrape jobs
 */
const activeJobs = new client.Gauge({
    name: 'kilo_scrape_active_jobs',
    help: 'Number of currently running scrape jobs',
    registers: [register]
});

/**
 * Crawl4AI request duration in seconds
 */
const crawlDuration = new client.Histogram({
    name: 'kilo_scrape_crawl_duration_seconds',
    help: 'Duration of Crawl4AI requests in seconds',
    labelNames: ['status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
    registers: [register]
});

/**
 * Crawl4AI errors
 */
const crawlErrors = new client.Counter({
    name: 'kilo_scrape_crawl_errors_total',
    help: 'Total number of Crawl4AI errors',
    labelNames: ['error_type'],
    registers: [register]
});

/**
 * Storage operations (store/search)
 */
const storageOperations = new client.Counter({
    name: 'kilo_scrape_storage_operations_total',
    help: 'Total number of storage operations',
    labelNames: ['operation', 'status'],
    registers: [register]
});

/**
 * Qdrant vector count for scraped content
 */
const vectorCount = new client.Gauge({
    name: 'kilo_scrape_vector_count',
    help: 'Number of vectors in the scraped content collection',
    registers: [register]
});

/**
 * Bytes downloaded
 */
const bytesDownloaded = new client.Counter({
    name: 'kilo_scrape_bytes_downloaded_total',
    help: 'Total bytes downloaded during scraping',
    registers: [register]
});

/**
 * Record job start
 */
function recordJobStarted() {
    scrapeJobStarted.inc();
    activeJobs.inc();
}

/**
 * Record job completion
 * @param {string} status - 'completed', 'failed', 'cancelled'
 */
function recordJobCompleted(status) {
    scrapeJobCompleted.inc({ status });
    activeJobs.dec();
}

/**
 * Record pages crawled
 * @param {number} count - Number of pages
 * @param {string} status - 'success' or 'failed'
 */
function recordPagesCrawled(count, status) {
    pagesCrawled.inc({ status }, count);
}

/**
 * Record items extracted
 * @param {string} type - 'product', 'category'
 * @param {number} count - Number of items
 */
function recordItemsExtracted(type, count) {
    itemsExtracted.inc({ type }, count);
}

/**
 * Record crawl duration
 * @param {number} durationMs - Duration in milliseconds
 * @param {string} status - 'success' or 'error'
 */
function recordCrawlDuration(durationMs, status) {
    crawlDuration.observe({ status }, durationMs / 1000);
}

/**
 * Record crawl error
 * @param {string} errorType - Type of error
 */
function recordCrawlError(errorType) {
    crawlErrors.inc({ error_type: errorType });
}

/**
 * Record storage operation
 * @param {string} operation - 'store', 'search', 'delete'
 * @param {string} status - 'success', 'error'
 */
function recordStorageOperation(operation, status) {
    storageOperations.inc({ operation, status });
}

/**
 * Update vector count gauge
 * @param {number} count - Current vector count
 */
function updateVectorCount(count) {
    vectorCount.set(count);
}

/**
 * Record bytes downloaded
 * @param {number} bytes - Number of bytes
 */
function recordBytesDownloaded(bytes) {
    bytesDownloaded.inc(bytes);
}

/**
 * Get all scraper metrics as JSON for non-Prometheus use
 * @returns {object} Metrics summary
 */
async function getMetricsSummary() {
    return {
        jobs: {
            started: scrapeJobStarted.value,
            completed: scrapeJobCompleted.values,
            active: activeJobs.value
        },
        pages: {
            crawled: pagesCrawled.values
        },
        items: {
            extracted: itemsExtracted.values
        },
        storage: {
            vectorCount: vectorCount.value,
            operations: storageOperations.values
        }
    };
}

module.exports = {
    register,
    // Counters
    scrapeJobStarted,
    scrapeJobCompleted,
    pagesCrawled,
    itemsExtracted,
    crawlErrors,
    storageOperations,
    bytesDownloaded,
    // Gauges
    activeJobs,
    vectorCount,
    // Histograms
    crawlDuration,
    // Functions
    recordJobStarted,
    recordJobCompleted,
    recordPagesCrawled,
    recordItemsExtracted,
    recordCrawlDuration,
    recordCrawlError,
    recordStorageOperation,
    updateVectorCount,
    recordBytesDownloaded,
    getMetricsSummary
};
