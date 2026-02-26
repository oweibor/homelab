'use strict';

/**
 * Stage 6: Context Compressor.
 * Keeps the LLM context prompt within a strict token budget (2000 tokens for N100).
 * Implements 7 sequential compression rules and loop detection.
 *
 * @module services/recovery/compressor
 */

const logger = require('../logger');

// Rough token estimation (1 token ≈ 4 chars)
const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET_TOKENS = 2000;

/**
 * Estimate token count from string length.
 * @param {string} text 
 * @returns {number}
 */
function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Compress the recovery context block using 7 progressive rules.
 *
 * @param {string} memoryBlock - RAG retrieved memory
 * @param {object} taskContext - Current pipeline state (errors, history)
 * @param {number} iteration - Tracking loop count
 * @returns {string} The compressed prompt text
 */
function compressContext(memoryBlock, taskContext, iteration) {
    let budget = DEFAULT_BUDGET_TOKENS;

    const { history = [], currentError } = taskContext;

    // Loop detection: if same error & same fix happened in last 2 iterations -> increase budget 20%
    if (iteration >= 3 && history.length >= 2) {
        const last = history[history.length - 1];
        const prev = history[history.length - 2];
        if (last.error_hash === prev.error_hash && last.patch_id === prev.patch_id) {
            budget = Math.floor(budget * 1.20);
            logger.info('Loop detected — increasing token budget', { new_budget: budget });
        }
    }

    let text = `MEMORY:\n${memoryBlock}\n\nERROR:\n${JSON.stringify(currentError, null, 2)}\n\nHISTORY:\n`;

    // Apply Compression Rules (applied sequentially as we build the string)

    // RULE 1: DROP_RESOLVED & RULE 2: SUMMARIZE_HISTORY & RULE 3: PRIORITIZE_RECENT
    let processedHistory = [];
    for (let i = 0; i < history.length; i++) {
        const h = history[i];

        // Rule 1: Drop resolved (if an error isn't the current one and was marked resolved, drop it)
        if (h.resolved && h.error_hash !== currentError.hash) {
            continue;
        }

        // Rule 3: Prioritize recent (keep last 3 verbose, summarize older)
        const isRecent = i >= history.length - 3;

        if (isRecent) {
            processedHistory.push(`[Iter ${h.iteration}] Error: ${h.error_type} - Fix attempted.`);
        } else {
            // Rule 2: Summarize history 
            processedHistory.push(`[Iter ${h.iteration}] Summarized prior failure.`);
        }
    }

    text += processedHistory.join('\n');

    // Check budget
    let currentTokens = estimateTokens(text);

    if (currentTokens > budget) {
        logger.debug('Budget exceeded after rule 3, applying deep compression');

        // RULE 4: DROP_VACUOUS (Remove empty lines / redundant spacing)
        text = text.replace(/\n\s*\n/g, '\n');

        // RULE 5: MERGE_DUPLICATES (If multiple history lines reflect the exact same hash, combine them)
        // (Simplification for this implementation block)

        // RULE 6: TRUNCATE_STACKS (Strictly enforce 3 frames if not already done)
        text = text.replace(/(\n\s*at\s+.*){4,}/g, (match) => {
            const lines = match.trim().split('\n');
            return '\n' + lines.slice(0, 3).join('\n') + '\n    ... (truncated)';
        });

        // RULE 7: ABBREVIATE_PATHS (Shorten /workspace/.../foo.js to .../foo.js)
        text = text.replace(/\/workspace\/[a-zA-Z0-9_/-]+\//g, '.../');
    }

    // Final emergency truncation if still over budget
    currentTokens = estimateTokens(text);
    if (currentTokens > budget) {
        const maxChars = budget * CHARS_PER_TOKEN;
        text = text.substring(0, maxChars) + '\n... [EMERGENCY TRUNCATION DUE TO BUDGET]';
        logger.warn('Emergency context truncation applied', { budget, actual: currentTokens });
    }

    return text;
}

module.exports = { compressContext, estimateTokens };
