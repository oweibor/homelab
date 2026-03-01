'use strict';

/**
 * Scraper configuration module.
 * Hardware-aware settings for Crawl4AI and LangGraph orchestration.
 * 
 * @module services/scraper/config
 */

const config = require('../../config');

/**
 * Hardware-aware scraper profiles.
 * Follows the same pattern as config.js HARDWARE_PROFILE.
 */
const SCRAPE_PROFILES = {
    // Low-power Intel
    'n100_like': {
        max_concurrent: 2,
        max_pages_per_minute: 10,
        browser_instances: 1,
        memory_limit: '512m',
        timeout_ms: 30000,
    },
    'celeron': {
        max_concurrent: 2,
        max_pages_per_minute: 8,
        browser_instances: 1,
        memory_limit: '512m',
        timeout_ms: 30000,
    },
    // Standard Intel
    'core_i3': {
        max_concurrent: 3,
        max_pages_per_minute: 20,
        browser_instances: 2,
        memory_limit: '1g',
        timeout_ms: 25000,
    },
    'core_i5': {
        max_concurrent: 5,
        max_pages_per_minute: 30,
        browser_instances: 3,
        memory_limit: '2g',
        timeout_ms: 20000,
    },
    'core_i7': {
        max_concurrent: 8,
        max_pages_per_minute: 50,
        browser_instances: 4,
        memory_limit: '3g',
        timeout_ms: 15000,
    },
    // AMD
    'amd_low': {
        max_concurrent: 2,
        max_pages_per_minute: 10,
        browser_instances: 1,
        memory_limit: '512m',
        timeout_ms: 30000,
    },
    'amd_mid': {
        max_concurrent: 5,
        max_pages_per_minute: 30,
        browser_instances: 3,
        memory_limit: '2g',
        timeout_ms: 20000,
    },
    'amd_high': {
        max_concurrent: 8,
        max_pages_per_minute: 50,
        browser_instances: 4,
        memory_limit: '3g',
        timeout_ms: 15000,
    },
    // ARM
    'arm64_rpi5': {
        max_concurrent: 2,
        max_pages_per_minute: 8,
        browser_instances: 1,
        memory_limit: '512m',
        timeout_ms: 30000,
    },
    'arm64_server': {
        max_concurrent: 4,
        max_pages_per_minute: 25,
        browser_instances: 2,
        memory_limit: '1g',
        timeout_ms: 25000,
    },
    // GPU-accelerated
    'nvidia_small': {
        max_concurrent: 8,
        max_pages_per_minute: 50,
        browser_instances: 4,
        memory_limit: '4g',
        timeout_ms: 15000,
    },
    'nvidia_medium': {
        max_concurrent: 12,
        max_pages_per_minute: 80,
        browser_instances: 6,
        memory_limit: '6g',
        timeout_ms: 12000,
    },
    'nvidia_large': {
        max_concurrent: 16,
        max_pages_per_minute: 100,
        browser_instances: 8,
        memory_limit: '8g',
        timeout_ms: 10000,
    },
    // Apple Silicon
    'apple_silicon': {
        max_concurrent: 8,
        max_pages_per_minute: 50,
        browser_instances: 4,
        memory_limit: '4g',
        timeout_ms: 15000,
    },
};

/**
 * Get scraper profile based on hardware profile.
 * @returns {object} Scraper profile settings
 */
function getScrapeProfile() {
    const profile = config.HARDWARE_PROFILE || 'n100_like';
    return SCRAPE_PROFILES[profile] || SCRAPE_PROFILES['n100_like'];
}

/**
 * Crawl4AI API configuration.
 */
const crawl4ai = {
    baseUrl: process.env.CRAWL4AI_URL || 'http://crawl4ai:8000',
    apiToken: process.env.CRAWL4AI_API_TOKEN || '',
    timeout: parseInt(process.env.CRAWL4AI_TIMEOUT, 10) || 30000,
    get maxConcurrent() {
        // Lazy-evaluate to ensure config is loaded
        const envVal = process.env.CRAWL4AI_MAX_CONCURRENT;
        if (envVal !== undefined && envVal !== '') {
            return parseInt(envVal, 10);
        }
        return getScrapeProfile().max_concurrent;
    },
};

/**
 * Anti-bot mode configuration.
 * Modes: standard, magic, stealth
 */
const antiBot = {
    mode: process.env.CRAWL4AI_MODE || 'magic',
    magicConfig: {
        simulate_human_clicks: true,
        random_mouse_movements: true,
        scroll_behavior: 'natural',
        human_delay_ms: {
            min: 500,
            max: 2000,
        },
    },
    stealthConfig: {
        random_user_agent: true,
        viewport_randomization: true,
        webgl_vendor_randomization: true,
    },
    proxy: {
        enabled: process.env.CRAWL4AI_PROXY_ENABLED === 'true',
        list: (process.env.CRAWL4AI_PROXY_LIST || '').split(',').filter(Boolean),
    },
};

/**
 * Extraction schema options.
 */
const extraction = {
    defaultFormat: 'markdown', // markdown, html, json
    includeImages: false,
    removeSelectors: ['script', 'style', 'nav', 'footer', '.advertisement'],
    waitForSelector: null,
    waitForNetworkIdle: true,
};

/**
 * LangGraph state machine configuration.
 */
const langgraph = {
    checkpointInterval: 10, // Save checkpoint every N pages
    maxRetries: 3,
    maxConsecutiveFailures: 5,
    backoffBaseMs: 1000,
    errorClassification: {
        retryable: ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT', 'BOT_DETECTED', 'CONNECTION_ERROR'],
        conditional: ['PARSE_ERROR'],
        nonRetryable: ['AUTH_REQUIRED', 'NOT_FOUND', 'FORBIDDEN', 'SERVER_ERROR'],
    },
};

/**
 * Qdrant collection for scraped content.
 */
const qdrant = {
    collectionName: process.env.SCRAPE_QDRANT_COLLECTION || 'scraped_content',
    vectorSize: 384, // Matches MiniLM embedding size
};

module.exports = {
    SCRAPE_PROFILES,
    getScrapeProfile,
    crawl4ai,
    antiBot,
    extraction,
    langgraph,
    qdrant,
};
