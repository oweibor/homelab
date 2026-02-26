'use strict';

/**
 * Task 4.4: Ollama Circuit Breaker.
 * Shared singleton across all Ollama callers (Gates, Writers).
 * Protects the N100 hardware from recursive LLM failure loops.
 * 
 * States: CLOSED (normal), OPEN (tripped), HALF_OPEN (probing).
 * Threshold: 15% failure rate over a 10-call sliding window.
 * 
 * @module services/ollama/circuitBreaker
 */

const logger = require('../logger');
const metrics = require('../metrics');

// N100 optimized thresholds (15% instead of 20% due to weaker 3B model)
const WINDOW_SIZE = 10;
const FAILURE_THRESHOLD = 0.15;
const RESET_TIMEOUT_MS = 300 * 1000; // 300 seconds

let state = 'CLOSED';
let resultsWindow = []; // true = success, false = failure
let resetTimer = null;
let probeActive = false;

const STATE_MAP = { 'CLOSED': 0, 'OPEN': 1, 'HALF_OPEN': 2 };

/**
 * Get the current state of the circuit breaker.
 * Exposed for GET /health and routing logic.
 * @returns {string} 'CLOSED' | 'OPEN' | 'HALF_OPEN'
 */
function getState() {
    return state;
}

/**
 * Calculate the current failure rate.
 * @returns {number} 0.0 to 1.0
 */
function getFailureRate() {
    if (resultsWindow.length === 0) return 0;

    const failures = resultsWindow.filter(res => res === false).length;
    return failures / resultsWindow.length;
}

/**
 * Transition state to OPEN.
 */
function tripCircuit() {
    if (state === 'OPEN') return;

    state = 'OPEN';
    const rate = getFailureRate();
    logger.warn('Ollama circuit breaker TRIPPED (OPEN)', {
        failure_rate: rate.toFixed(2),
        window: resultsWindow.length,
        timeout_s: RESET_TIMEOUT_MS / 1000
    });
    metrics.circuitState.set(STATE_MAP['OPEN']);

    // Schedule transition to HALF_OPEN
    if (resetTimer) clearTimeout(resetTimer);

    resetTimer = setTimeout(() => {
        state = 'HALF_OPEN';
        probeActive = false;
        logger.info('Ollama circuit breaker moved to HALF_OPEN (ready for probe)');
        metrics.circuitState.set(STATE_MAP['HALF_OPEN']);
    }, RESET_TIMEOUT_MS);
}

/**
 * Transition state to CLOSED.
 */
function resetCircuit() {
    state = 'CLOSED';
    resultsWindow = []; // Clear the window on full recovery
    probeActive = false;
    if (resetTimer) clearTimeout(resetTimer);
    logger.info('Ollama circuit breaker RESET (CLOSED)');
    metrics.circuitState.set(STATE_MAP['CLOSED']);
}

/**
 * Record a successful Ollama call.
 */
function recordSuccess() {
    if (state === 'HALF_OPEN') {
        // Probe succeeded!
        logger.info('Ollama circuit breaker probe SUCCEEDED');
        resetCircuit();
        return;
    }

    // Normal tracking
    resultsWindow.push(true);
    if (resultsWindow.length > WINDOW_SIZE) {
        resultsWindow.shift();
    }
}

/**
 * Record a failed Ollama call.
 */
function recordFailure() {
    if (state === 'HALF_OPEN') {
        // Probe failed! 
        logger.warn('Ollama circuit breaker probe FAILED');
        tripCircuit();
        return;
    }

    // Normal tracking
    resultsWindow.push(false);
    if (resultsWindow.length > WINDOW_SIZE) {
        resultsWindow.shift();
    }

    const rate = getFailureRate();
    if (resultsWindow.length >= 3 && rate >= FAILURE_THRESHOLD) {
        tripCircuit();
    }
}

/**
 * Check if an Ollama call should be allowed to run.
 * @returns {boolean} True if allowed, False if blocked by circuit.
 */
function isCallAllowed() {
    if (state === 'CLOSED') {
        return true;
    }

    if (state === 'OPEN') {
        return false;
    }

    if (state === 'HALF_OPEN') {
        // Allow exactly ONE probe call to go through
        if (probeActive) {
            return false;
        }
        probeActive = true;
        return true;
    }

    return false;
}

module.exports = {
    getState,
    getFailureRate,
    recordSuccess,
    recordFailure,
    isCallAllowed,

    // Exported for testing only
    _resetState() {
        state = 'CLOSED';
        resultsWindow = [];
        probeActive = false;
        if (resetTimer) clearTimeout(resetTimer);
    }
};
