'use strict';

/**
 * Stage 3a: Search Router.
 * Determines if a COMPLEX error needs RAG, Web Search, or both.
 * Stubbed for Phase 1 oweibo (RAG returns empty, web search is mocked).
 *
 * @module services/recovery/searchRouter
 */

const logger = require('../logger');

/**
 * Default RAG score thresholds per technology stack category.
 * A score above the threshold implies confidence in RAG alone.
 * Below 0.50 implies RAG is useless and Web Search ONLY should be used.
 * In between implies RAG + Web Search combo.
 */
const RAG_THRESHOLDS = {
    flutter: 0.80,
    postgresql: 0.75,
    nextjs: 0.72,
    langchain: 0.70,
    celery: 0.68,
    bullmq: 0.65,
    timeout_cpu: 0.85,
    timeout_net: 0.70,
    timeout_inst: 0.60,
    default: 0.75,
};

/**
 * Detect the likely stack category from the error trace.
 * @param {string} canonicalKey 
 * @returns {string} 
 */
function detectStackCategory(canonicalKey) {
    const key = canonicalKey.toLowerCase();
    for (const stack of Object.keys(RAG_THRESHOLDS)) {
        if (key.includes(stack)) return stack;
    }
    return 'default';
}

/**
 * Stubbed RAG search. (Will be implemented fully in Phase 6).
 * @param {string} query 
 * @returns {Promise<Array>} 
 */
async function performRagSearch(query) {
    logger.debug('RAG search invoked (stubbed)', { query });
    return []; // Empty for Phase 1 oweibo
}

/**
 * Stubbed Web search. (Will integrate with SearXNG/DuckDuckGo in Phase 6).
 * @param {string} query 
 * @returns {Promise<Array>}
 */
async function performWebSearch(query) {
    logger.debug('Web search invoked (stubbed)', { query });
    return [
        {
            title: 'Mocked Web Result for ' + query.slice(0, 20),
            snippet: 'This is a mocked web search snippet indicating a generic solution.',
            url: 'https://example.com/mock-solution'
        }
    ];
}

/**
 * Route the search based on error context and thresholds.
 * @param {object} canonicalError 
 * @param {number} syntheticRagScore - Mock score for the prototype until Phase 6
 * @returns {Promise<{ strategy: string, rag_results: Array, web_results: Array }>}
 */
async function routeSearch(canonicalError, syntheticRagScore = 0.60) {
    const category = detectStackCategory(canonicalError.canonical_key);
    const threshold = RAG_THRESHOLDS[category] || RAG_THRESHOLDS.default;

    const query = `${canonicalError.error_type} ${canonicalError.calling_function}`;

    let strategy = '';
    let rag_results = [];
    let web_results = [];

    logger.info('Routing search for COMPLEX error', { category, threshold, syntheticRagScore });

    if (syntheticRagScore >= threshold) {
        strategy = 'RAG_ONLY';
        rag_results = await performRagSearch(query);
    } else if (syntheticRagScore >= 0.50) {
        strategy = 'RAG_AND_WEB';
        [rag_results, web_results] = await Promise.all([
            performRagSearch(query),
            performWebSearch(query)
        ]);
    } else {
        strategy = 'WEB_ONLY';
        web_results = await performWebSearch(query);
    }

    return {
        strategy,
        rag_results,
        web_results
    };
}

module.exports = { routeSearch, RAG_THRESHOLDS, detectStackCategory };
