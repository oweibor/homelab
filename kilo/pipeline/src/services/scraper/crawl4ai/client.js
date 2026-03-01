'use strict';

/**
 * Crawl4AI API Client.
 * Wrapper for interacting with Crawl4AI service.
 * 
 * @module services/scraper/crawl4ai/client
 */

const logger = require('../logger');
const scraperConfig = require('../config');

// Lazy-load cheerio to avoid issues if not installed
let cheerio;
const getCheerio = () => {
    if (!cheerio) {
        try {
            cheerio = require('cheerio');
        } catch (e) {
            logger.warn('Cheerio not available, using fallback extraction');
            return null;
        }
    }
    return cheerio;
};

/**
 * Crawl4AI client class for making requests to the Crawl4AI service.
 */
class Crawl4AIClient {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || scraperConfig.crawl4ai.baseUrl;
        this.apiToken = options.apiToken || scraperConfig.crawl4ai.apiToken;
        this.timeout = options.timeout || scraperConfig.crawl4ai.timeout;
    }

    /**
     * Make an HTTP request to Crawl4AI.
     * @param {string} endpoint - API endpoint
     * @param {object} options - Request options
     * @returns {Promise<object>} Response data
     */
    async _request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.apiToken) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Crawl4AI API error: ${response.status} - ${error}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Crawl4AI request timeout after ${this.timeout}ms`);
            }
            throw error;
        }
    }

    /**
     * Crawl a single URL.
     * @param {string} url - Target URL
     * @param {object} options - Crawl options
     * @returns {Promise<object>} Crawl result
     */
    async crawl(url, options = {}) {
        const {
            antiBotMode = scraperConfig.antiBot.mode,
            format = scraperConfig.extraction.defaultFormat,
            includeImages = scraperConfig.extraction.includeImages,
            removeSelectors = scraperConfig.extraction.removeSelectors,
            waitForSelector = scraperConfig.extraction.waitForSelector,
            waitForNetworkIdle = scraperConfig.extraction.waitForNetworkIdle,
        } = options;

        const payload = {
            urls: [url],
            anti_bot: antiBotMode,
            output_format: format,
            include_images: includeImages,
            remove_selectors: removeSelectors,
            wait_for_selector: waitForSelector,
            wait_for_network_idle: waitForNetworkIdle,
            // Magic mode specific
            ...(antiBotMode === 'magic' && {
                magic_config: scraperConfig.antiBot.magicConfig,
            }),
            // Stealth mode specific
            ...(antiBotMode === 'stealth' && {
                stealth_config: scraperConfig.antiBot.stealthConfig,
            }),
        };

        logger.debug('Crawling URL', { url, antiBotMode, format });

        try {
            const result = await this._request('/crawl', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            return {
                success: true,
                url,
                content: result.results?.[0]?.markdown || result.results?.[0]?.html || '',
                html: result.results?.[0]?.html || '',
                links: result.results?.[0]?.links || [],
                images: result.results?.[0]?.images || [],
                metadata: result.results?.[0]?.metadata || {},
            };
        } catch (error) {
            logger.error('Crawl failed', { url, error: error.message });
            return {
                success: false,
                url,
                error: error.message,
            };
        }
    }

    /**
     * Crawl multiple URLs in batch.
     * @param {string[]} urls - Array of URLs to crawl
     * @param {object} options - Crawl options
     * @returns {Promise<object[]>} Array of crawl results
     */
    async crawlBatch(urls, options = {}) {
        const {
            concurrency = scraperConfig.crawl4ai.maxConcurrent,
            ...crawlOptions
        } = options;

        logger.info('Starting batch crawl', { urlCount: urls.length, concurrency });

        const results = [];
        const batches = [];
        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            batches.push(batch);
        }

        for (const batch of batches) {
            const batchResults = await Promise.all(batch.map(url => this.crawl(url, crawlOptions)));
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Extract structured data using CSS/XPath selectors.
     * @param {string} url - Target URL
     * @param {object} selectors - Key-value pairs of field name to CSS selector
     * @param {object} options - Additional crawl options
     * @returns {Promise<object>} Extracted data
     */
    async extract(url, selectors, options = {}) {
        const crawlResult = await this.crawl(url, {
            ...options,
            format: 'html',
        });

        if (!crawlResult.success) {
            return { success: false, url, error: crawlResult.error };
        }

        const $ = getCheerio();
        const extracted = {};

        if ($) {
            // Use cheerio for proper HTML parsing
            const $html = $.load(crawlResult.html);
            for (const [field, selector] of Object.entries(selectors)) {
                try {
                    const element = $html(selector);
                    extracted[field] = element.length > 0 ? element.text().trim() : null;
                } catch (e) {
                    extracted[field] = null;
                }
            }
        } else {
            // Fallback to basic regex (not recommended for production)
            logger.warn('Using fallback extraction - install cheerio for better results');
            for (const [field, selector] of Object.entries(selectors)) {
                try {
                    // Basic regex-based extraction (simplified fallback)
                    const match = new RegExp(`<[^>]+${selector.replace(/[^a-zA-Z0-9]/g, '.*')}[^>]*>([^<]*)`, 'i')
                        .exec(crawlResult.html);
                    extracted[field] = match ? match[1].trim() : null;
                } catch (e) {
                    extracted[field] = null;
                }
            }
        }

        return {
            success: true,
            url,
            data: extracted,
            raw_html: crawlResult.html,
        };
    }

    /**
     * Check Crawl4AI service health.
     * @returns {Promise<boolean>} Health status
     */
    async healthCheck() {
        try {
            const result = await this._request('/health', { method: 'GET' });
            return result.status === 'ok' || result.success;
        } catch {
            return false;
        }
    }

    /**
     * Get service status.
     * @returns {Promise<object>} Service status
     */
    async getStatus() {
        try {
            return await this._request('/status', { method: 'GET' });
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }
}

module.exports = Crawl4AIClient;
