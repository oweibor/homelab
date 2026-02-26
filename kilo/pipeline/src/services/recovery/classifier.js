'use strict';

/**
 * Stage 3: Error Classifier.
 * Categorizes canonical errors as SIMPLE or COMPLEX to determine the recovery path.
 *
 * @module services/recovery/classifier
 */

/**
 * List of error types that are generally considered simple/syntactic.
 * These do not require deep RAG or Web Search context to fix.
 */
const SIMPLE_ERRORS = new Set([
    'SyntaxError',
    'IndentationError',
    'NameError',
    'AttributeError',
    'KeyError',
    'IndexError',
    'ReferenceError',
    'TypeError', // Often simple arg mismatch, though occasionally complex
]);

/**
 * Classify a canonical error object.
 *
 * @param {object} canonicalError - Output from Stage 1 (canonicalize)
 * @returns {string} "SIMPLE" or "COMPLEX"
 */
function classify(canonicalError) {
    const { error_type } = canonicalError;

    if (SIMPLE_ERRORS.has(error_type)) {
        return 'SIMPLE';
    }

    // Fallback defaults to complex for unknown types or deep logic errors
    return 'COMPLEX';
}

module.exports = { classify, SIMPLE_ERRORS };
