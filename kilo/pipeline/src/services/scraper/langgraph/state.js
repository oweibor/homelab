'use strict';

/**
 * LangGraph-style State Management for Web Scraping.
 * 
 * Implements a state machine following LangGraph patterns:
 * - State: The current snapshot of the crawl
 * - Nodes: Functions that transform state
 * - Edges: Conditional transitions between nodes
 * 
 * @module services/scraper/langgraph/state
 */

/**
 * Create initial scrape state.
 * @param {object} options - Initial options
 * @returns {object} Initial state
 */
function createInitialState(options) {
    const {
        target_url,
        job_id,
        extraction_type = 'product',
        max_pages = 100,
        anti_bot = 'magic',
        checkpoint_interval = 10,
    } = options;

    return {
        // Metadata
        job_id,
        extraction_type,

        // URL tracking
        current_url: target_url,
        visited_urls: [],
        failed_urls: [],  // Array for proper JSON serialization

        // Pagination state
        page_number: 1,
        max_pages,
        has_next_page: true,
        next_page_selector: null,

        // Extraction results
        categories: [],
        products: [],
        extracted_count: 0,

        // Error handling
        consecutive_failures: 0,
        total_failures: 0,
        error_log: [],

        // Configuration
        anti_bot_mode: anti_bot,
        checkpoint_interval,

        // Timing
        started_at: new Date().toISOString(),
        last_checkpoint: Date.now(),
    };
}

/**
 * Create a serializable state (for checkpointing).
 * @param {object} state - Current state
 * @returns {object} Serializable state
 */
function serializeState(state) {
    // Map is already serializable as array-like structure
    return { ...state };
}

/**
 * Restore state from checkpoint.
 * @param {object} checkpoint - Checkpoint data
 * @returns {object} Restored state
 */
function deserializeState(checkpoint) {
    return { ...checkpoint };
}

/**
 * Node: Fetch a page using Crawl4AI.
 * @param {object} state - Current state
 * @param {object} context - Context with Crawl4AI client
 * @returns {Promise<object>} Updated state
 */
async function fetchPageNode(state, context) {
    const { crawl4ai, logger } = context;
    const { current_url, anti_bot_mode } = state;

    logger.debug('Fetching page', { url: current_url, page: state.page_number });

    try {
        const result = await crawl4ai.crawl(current_url, {
            antiBotMode: anti_bot_mode,
            format: 'markdown',
        });

        if (result.success) {
            return {
                ...state,
                visited_urls: [...state.visited_urls, current_url],
                last_fetch_result: result,
                consecutive_failures: 0,
                fetch_error: null,  // Clear any previous error state
            };
        } else {
            // Handle fetch failure
            const errorEntry = {
                url: current_url,
                error: result.error,
                timestamp: new Date().toISOString(),
                type: 'FETCH_ERROR',
            };

            return {
                ...state,
                visited_urls: [...state.visited_urls, current_url],
                last_fetch_result: null,
                fetch_error: result.error,
                consecutive_failures: state.consecutive_failures + 1,
                total_failures: state.total_failures + 1,
                error_log: [...state.error_log.slice(-99), errorEntry],
            };
        }
    } catch (error) {
        const errorEntry = {
            url: current_url,
            error: error.message,
            timestamp: new Date().toISOString(),
            type: 'EXCEPTION',
        };

        return {
            ...state,
            visited_urls: [...state.visited_urls, current_url],
            last_fetch_result: null,
            fetch_error: error.message,
            consecutive_failures: state.consecutive_failures + 1,
            total_failures: state.total_failures + 1,
            error_log: [...state.error_log.slice(-99), errorEntry],
        };
    }
}

/**
 * Node: Extract categories from page content.
 * @param {object} state - Current state
 * @param {object} context - Context
 * @returns {Promise<object>} Updated state
 */
async function extractCategoriesNode(state, context) {
    const { logger } = context;
    const { last_fetch_result, extraction_type } = state;

    if (extraction_type !== 'category' && extraction_type !== 'multi') {
        return state; // Skip if not extracting categories
    }

    if (!last_fetch_result?.links) {
        return state;
    }

    // Extract category links (simple pattern matching)
    const categoryPatterns = ['category', 'department', 'section', '/c/', '/categories/'];
    const newCategories = last_fetch_result.links.filter(link => {
        const href = (link.href || '').toLowerCase();
        const text = (link.text || '').toLowerCase();
        return categoryPatterns.some(p => href.includes(p) || text.includes(p));
    });

    const uniqueCategories = newCategories.filter(
        c => !state.categories.some(existing => existing.href === c.href)
    );

    logger.debug('Extracted categories', { count: uniqueCategories.length });

    return {
        ...state,
        categories: [...state.categories, ...uniqueCategories],
    };
}

/**
 * Node: Extract products from page content.
 * Enhanced to support JSON-LD and Schema.org for variable products.
 * @param {object} state - Current state
 * @param {object} context - Context
 * @returns {Promise<object>} Updated state
 */
async function extractProductsNode(state, context) {
    const { logger } = context;
    const { last_fetch_result, extraction_type } = state;

    if (extraction_type !== 'product' && extraction_type !== 'multi') {
        return state;
    }

    if (!last_fetch_result) {
        return state;
    }

    const foundProducts = [];

    // 1. Extract from JSON-LD (Schema.org) - Best for variable products
    if (last_fetch_result.html) {
        try {
            const cheerio = require('cheerio');
            const $ = cheerio.load(last_fetch_result.html);
            $('script[type="application/ld+json"]').each((i, el) => {
                try {
                    const json = JSON.parse($(el).html());
                    const productsChunks = Array.isArray(json) ? json : [json];

                    for (const item of productsChunks) {
                        if (item['@type'] === 'Product' || item['@type'] === 'schema:Product') {
                            const product = {
                                name: item.name,
                                description: item.description,
                                sku: item.sku,
                                brand: item.brand?.name || item.brand,
                                url: item.url || state.current_url,
                                source: 'json-ld',
                                variants: []
                            };

                            // Multi-variant support (Offers)
                            const offers = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : []);
                            for (const offer of offers) {
                                if (offer['@type'] === 'Offer' || offer['@type'] === 'schema:Offer') {
                                    product.variants.push({
                                        price: offer.price,
                                        currency: offer.priceCurrency,
                                        availability: offer.availability,
                                        sku: offer.sku || product.sku
                                    });
                                }
                            }

                            foundProducts.push(product);
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for specific snippets
                }
            });
        } catch (error) {
            logger.warn('JSON-LD extraction failed', { error: error.message });
        }
    }

    // 2. Extract product links (Fallback/Discovery)
    if (last_fetch_result.links) {
        const productPatterns = ['product', 'item', '/p/', '/products/', 'pdp'];
        const linkProducts = last_fetch_result.links
            .filter(link => {
                const href = (link.href || '').toLowerCase();
                const text = (link.text || '').toLowerCase();
                return productPatterns.some(p => href.includes(p) || text.includes(p));
            })
            .map(link => ({
                name: link.text,
                url: link.href,
                source: 'link'
            }));

        foundProducts.push(...linkProducts);
    }

    // Deduplicate and filter new products
    const uniqueProducts = foundProducts.filter(
        p => !state.products.some(existing => existing.url === p.url || (existing.sku && existing.sku === p.sku))
    );

    logger.debug('Extracted products', {
        count: uniqueProducts.length,
        jsonLdCount: uniqueProducts.filter(p => p.source === 'json-ld').length
    });

    return {
        ...state,
        products: [...state.products, ...uniqueProducts],
        extracted_count: state.extracted_count + uniqueProducts.length,
    };
}

/**
 * Node: Check pagination and determine next URL.
 * @param {object} state - Current state
 * @param {object} context - Context
 * @returns {Promise<object>} Updated state
 */
async function checkPaginationNode(state, context) {
    const { logger } = context;
    const { last_fetch_result, page_number, max_pages } = state;

    // Check if we've reached max pages
    if (page_number >= max_pages) {
        logger.info('Reached max pages limit', { page: page_number, max: max_pages });
        return {
            ...state,
            has_next_page: false,
            termination_reason: 'max_pages_reached',
        };
    }

    // Check for next page link
    const nextPagePatterns = ['next', 'page', 'p=', 'page=', '?page'];
    let nextUrl = null;

    if (last_fetch_result?.links) {
        for (const link of last_fetch_result.links) {
            const href = (link.href || '').toLowerCase();
            const text = (link.text || '').toLowerCase();

            if (nextPagePatterns.some(p => href.includes(p) || text.includes(p))) {
                nextUrl = link.href;
                break;
            }
        }
    }

    if (nextUrl) {
        logger.debug('Found next page', { url: nextUrl, page: page_number + 1 });
        return {
            ...state,
            has_next_page: true,
            current_url: nextUrl,
            page_number: page_number + 1,
        };
    }

    logger.info('No next page found', { page: page_number });

    return {
        ...state,
        has_next_page: false,
        termination_reason: 'no_next_page',
    };
}

/**
 * Node: Handle errors and determine retry strategy.
 * @param {object} state - Current state
 * @param {object} context - Context with config
 * @returns {Promise<object>} Updated state
 */
async function handleErrorNode(state, context) {
    const { config, logger } = context;
    const { maxRetries, maxConsecutiveFailures, backoffBaseMs } = config.langgraph;

    const { consecutive_failures, fetch_error, current_url } = state;

    if (consecutive_failures === 0 || !fetch_error) {
        return {
            ...state,
            action: 'continue',
            next_node: 'check_pagination',
        };
    }

    // Classify the error
    const errorType = classifyError(fetch_error);

    // Check if we should retry
    const shouldRetry = (
        errorType === 'retryable' &&
        consecutive_failures < maxRetries
    );

    if (shouldRetry) {
        const backoffMs = backoffBaseMs * Math.pow(2, consecutive_failures - 1);

        logger.warn('Retrying failed page', {
            url: current_url,
            attempt: consecutive_failures,
            backoff: backoffMs,
        });

        return {
            ...state,
            action: 'retry',
            next_node: 'fetch_page',
            backoff_ms: backoffMs,
        };
    }

    // Too many failures - check if we should pause or skip
    if (consecutive_failures >= maxConsecutiveFailures) {
        logger.error('Too many consecutive failures', {
            failures: consecutive_failures,
            url: current_url,
        });

        // Record in failed URLs and continue
        const failedUrls = [...state.failed_urls, {
            url: current_url,
            error: fetch_error,
            error_type: errorType,
            attempts: consecutive_failures,
            timestamp: new Date().toISOString(),
        }];

        return {
            ...state,
            failed_urls: failedUrls,
            action: 'pause_and_continue',
            next_node: 'fetch_page',
            pause_ms: 30000, // 30 second pause
            consecutive_failures: 0, // Reset for next page
        };
    }

    // Skip this URL and continue
    const failedUrls = [...state.failed_urls, {
        url: current_url,
        error: fetch_error,
        error_type: errorType,
        attempts: consecutive_failures,
        timestamp: new Date().toISOString(),
    }];

    return {
        ...state,
        failed_urls: failedUrls,
        action: 'skip',
        next_node: 'check_pagination',
        consecutive_failures: 0, // Reset for next page
    };
}

/**
 * Classify error type for retry decision.
 * @param {string} error - Error message
 * @returns {string} Error classification
 */
function classifyError(error) {
    const errorLower = (error || '').toLowerCase();

    // Retryable errors
    if (errorLower.includes('timeout') ||
        errorLower.includes('network') ||
        errorLower.includes('econnrefused') ||
        errorLower.includes('rate limit') ||
        errorLower.includes('429') ||
        errorLower.includes('bot') ||
        errorLower.includes('detected')) {
        return 'retryable';
    }

    // Conditional errors
    if (errorLower.includes('parse') ||
        errorLower.includes('500') ||
        errorLower.includes('502') ||
        errorLower.includes('503')) {
        return 'conditional';
    }

    // Non-retryable
    if (errorLower.includes('401') ||
        errorLower.includes('403') ||
        errorLower.includes('404') ||
        errorLower.includes('forbidden') ||
        errorLower.includes('not found')) {
        return 'non_retryable';
    }

    return 'conditional'; // Default to conditional
}

/**
 * Node: Check if checkpoint should be saved.
 * @param {object} state - Current state
 * @returns {object} Updated state
 */
function checkpointNode(state) {
    const { page_number, checkpoint_interval } = state;
    const now = Date.now();

    // Check if it's time for a checkpoint
    if (page_number % checkpoint_interval === 0) {
        return {
            ...state,
            should_checkpoint: true,
            last_checkpoint: now,
        };
    }

    return {
        ...state,
        should_checkpoint: false,
    };
}

module.exports = {
    createInitialState,
    serializeState,
    deserializeState,
    fetchPageNode,
    extractCategoriesNode,
    extractProductsNode,
    checkPaginationNode,
    handleErrorNode,
    checkpointNode,
    classifyError,
};
