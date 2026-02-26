'use strict';

/**
 * Memory retrieval module.
 * Parallel search across all 5 Qdrant collections with per-collection
 * thresholds. Returns a structured MEMORY CONTEXT BLOCK string.
 *
 * @module services/memory
 */

const config = require('../config');
const qdrant = require('./qdrant');
const embeddings = require('./embeddings');
const logger = require('./logger');

/**
 * Collection search configuration.
 * Each entry defines the threshold, limit, and any special handling.
 */
const COLLECTION_CONFIG = {
    project_decisions: {
        threshold: 0.65,
        limit: 5,
        filter: (results) =>
            // Exclude staging/ files from decision results
            results.filter((r) => !r.payload?.source_path?.includes('staging/')),
    },
    project_invariants: {
        threshold: 0, // Include all
        limit: 100,
        filter: null,
    },
    project_reasoning: {
        threshold: 0.70,
        limit: 5,
        // Apply -0.10 confidence penalty
        transform: (results) =>
            results.map((r) => ({
                ...r,
                score: r.score,
                payload: {
                    ...r.payload,
                    confidence: Math.max(0, (r.payload?.confidence || r.score) - 0.10),
                },
            })),
    },
    project_history: {
        threshold: 0.65,
        limit: 3,
        filter: null,
    },
    project_context: {
        threshold: 0, // Include all
        limit: 50,
        filter: null,
        // 4000-token cap — truncate if needed
        truncate: 4000,
    },
};

/**
 * Estimate token count from text (rough: 1 token ≈ 4 chars).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}

/**
 * Retrieve memory context for a task.
 * Searches all 5 collections in parallel with per-collection thresholds.
 *
 * @param {string} taskId - Current task ID
 * @param {string} instruction - Task instruction text
 * @returns {Promise<string>} Formatted MEMORY CONTEXT BLOCK
 */
async function retrieveMemory(taskId, instruction) {
    const startMs = Date.now();

    logger.info('Memory retrieval started', { task_id: taskId });

    // Generate embedding for the instruction
    const queryVector = await embeddings.embed(instruction);

    // Search all collections in parallel with timeout
    const searchPromises = Object.entries(COLLECTION_CONFIG).map(
        async ([collection, cfg]) => {
            try {
                let results = await qdrant.search(
                    collection,
                    queryVector,
                    cfg.limit,
                    cfg.threshold || undefined
                );

                // Apply collection-specific filter
                if (cfg.filter) {
                    results = cfg.filter(results);
                }

                // Apply collection-specific transform
                if (cfg.transform) {
                    results = cfg.transform(results);
                }

                return { collection, results, error: null };
            } catch (err) {
                logger.warn('Memory search failed for collection', {
                    collection,
                    error: err.message,
                });
                return { collection, results: [], error: err.message };
            }
        }
    );

    // Race against timeout
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Memory retrieval timeout')), config.MEMORY_TIMEOUT_MS)
    );

    /** @type {Array<{collection: string, results: object[], error: string|null}>} */
    let searchResults;
    try {
        searchResults = await Promise.race([
            Promise.all(searchPromises),
            timeoutPromise,
        ]);
    } catch (err) {
        logger.error('Memory retrieval timed out', {
            task_id: taskId,
            timeout_ms: config.MEMORY_TIMEOUT_MS,
        });
        searchResults = [];
    }

    // Build MEMORY CONTEXT BLOCK
    const block = formatMemoryBlock(searchResults);

    const durationMs = Date.now() - startMs;
    logger.info('Memory retrieval complete', {
        task_id: taskId,
        duration_ms: durationMs,
        sections: searchResults.length,
        total_results: searchResults.reduce((sum, s) => sum + s.results.length, 0),
    });

    return block;
}

/**
 * Format search results into a structured memory context block.
 *
 * @param {Array<{collection: string, results: object[]}>} searchResults
 * @returns {string}
 */
function formatMemoryBlock(searchResults) {
    const sections = [];

    sections.push('=== MEMORY CONTEXT BLOCK ===');
    sections.push(`Retrieved at: ${new Date().toISOString()}`);
    sections.push('');

    for (const { collection, results, error } of searchResults) {
        const heading = collection
            .replace('project_', '')
            .toUpperCase();

        sections.push(`--- ${heading} (${results.length} results) ---`);

        if (error) {
            sections.push(`  [ERROR: ${error}]`);
            sections.push('');
            continue;
        }

        if (results.length === 0) {
            sections.push('  (no relevant entries)');
            sections.push('');
            continue;
        }

        // Check for context truncation
        const cfg = COLLECTION_CONFIG[collection];
        let content = '';

        for (const result of results) {
            const score = result.score?.toFixed(3) || '—';
            const title = result.payload?.title || result.payload?.source_path || result.id;
            const text = result.payload?.content || result.payload?.text || '';
            const confidence = result.payload?.confidence;

            let entry = `  [${score}] ${title}`;
            if (confidence !== undefined) {
                entry += ` (confidence: ${confidence.toFixed(2)})`;
            }
            entry += `\n    ${text.slice(0, 500)}`;

            content += entry + '\n';
        }

        // Apply token cap if configured
        if (cfg?.truncate && estimateTokens(content) > cfg.truncate) {
            const maxChars = cfg.truncate * 4;
            content = content.slice(0, maxChars) + '\n    [TRUNCATED — exceeded token cap]';
        }

        sections.push(content);
        sections.push('');
    }

    sections.push('=== END MEMORY CONTEXT BLOCK ===');

    return sections.join('\n');
}

module.exports = { retrieveMemory };
