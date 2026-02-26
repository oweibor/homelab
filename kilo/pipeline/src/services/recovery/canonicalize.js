'use strict';

/**
 * Stage 1: Error Canonicalization.
 * Strips instance-specific noise from error traces and computes a stable SHA-256 hash.
 * This guarantees the identical semantic error produces the exact same hash identifier.
 *
 * @module services/recovery/canonicalize
 */

const crypto = require('crypto');

/**
 * Clean up an error object/trace to produce a canonical representation.
 *
 * @param {object} errorObj - Raw error context
 * @param {string} errorObj.type - e.g. "TypeError", "SyntaxError"
 * @param {string} errorObj.message - Raw error message
 * @param {string} errorObj.stack - Raw stack trace (optional)
 * @returns {{ hash: string, canonical_key: string, error_type: string, calling_function: string }}
 */
function canonicalize(errorObj) {
    const { type = 'UnknownError', message = '', stack = '' } = errorObj;

    // 1. Clean the error message
    let cleanedMessage = message
        // Strip memory addresses (0x...)
        .replace(/0x[a-fA-F0-9]+/g, '0xADDR')
        // Strip PIDs (e.g. process 12345)
        .replace(/\b(process|pid|worker)[:\s]+\d+\b/gi, '$1 PID')
        // Strip timestamps (ISO format)
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, 'TIMESTAMP')
        // Strip timestamps (YYYY-MM-DD HH:MM:SS)
        .replace(/\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
        // Strip line numbers from message if present (e.g. file.js:12:34)
        .replace(/:\d+:\d+/g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();

    // 2. Process the stack trace
    let cleanedStackLines = [];
    let callingFunction = 'unknown_function';

    if (stack) {
        const lines = stack.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty or whitespace-only lines
            if (!trimmed) continue;

            // Skip the error message itself if it's mirrored in the stack string
            if (trimmed.includes(message) && cleanedStackLines.length === 0) continue;

            // Skip framework fluff
            if (
                trimmed.includes('flutter_tools/') ||
                trimmed.includes('internal/process/') ||
                trimmed.includes('node:internal/')
            ) {
                continue;
            }

            // Extract calling function from the first valid 'at' frame
            if (callingFunction === 'unknown_function' && trimmed.startsWith('at ')) {
                const match = trimmed.match(/at\s+([^\s(]+)/);
                if (match && match[1]) {
                    callingFunction = match[1];
                }
            }

            // Strip line/col numbers and absolute paths to keep it portable
            let cleanedLine = trimmed
                .replace(/:\d+:\d+/g, '') // remove line:col
                .replace(/^[/(].*?\/([^/]+)$/, '$1'); // keep only filename if absolute path

            cleanedStackLines.push(cleanedLine);
        }
    }

    // Keep only the top 3 frames for the hash
    const topFrames = cleanedStackLines.slice(0, 3).join('\n');

    // 3. Construct Canonical Key and Hash
    const canonicalKey = `${type}:${cleanedMessage}:${callingFunction}\n${topFrames}`;
    const hash = crypto.createHash('sha256').update(canonicalKey).digest('hex');

    // 4. Collision Guard logic (handled by caller if a collision is detected)
    // For canonicalize itself, it just returns the derived deterministic output.

    return {
        hash,
        canonical_key: canonicalKey,
        error_type: type,
        calling_function: callingFunction,
    };
}

module.exports = { canonicalize };
