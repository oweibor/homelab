'use strict';

/**
 * Task 4.4: Ollama Circuit Breaker.
 * Shared singleton across all Ollama callers (Gates, Writers).
 * Protects the hardware from recursive LLM failure loops.
 * 
 * Hardware-aware: thresholds adjusted based on HARDWARE_PROFILE env var.
 * States: CLOSED (normal), OPEN (tripped), HALF_OPEN (probing).
 * 
 * @module services/ollama/circuitBreaker
 */

const logger = require('../logger');
const metrics = require('../metrics');
const config = require('../config');

// Get hardware profile from shared config
const hardwareProfile = config.HARDWARE_PROFILE || 'n100_like';

// Hardware profile-based thresholds (circuit breaker specific - includes windowSize and resetTimeout)
// Note: The threshold values match config.js PROFILE_THRESHOLDS for consistency
const PROFILE_THRESHOLDS = {
    // Low-power Intel
    'n100_like': { windowSize: 10, failureThreshold: 0.15, resetTimeout: 300000 },
    'celeron': { windowSize: 10, failureThreshold: 0.20, resetTimeout: 300000 },

    // Standard Intel
    'core_i3': { windowSize: 15, failureThreshold: 0.25, resetTimeout: 180000 },
    'core_i5': { windowSize: 20, failureThreshold: 0.30, resetTimeout: 120000 },
    'core_i7': { windowSize: 20, failureThreshold: 0.35, resetTimeout: 120000 },

    // AMD
    'amd_low': { windowSize: 10, failureThreshold: 0.15, resetTimeout: 300000 },
    'amd_mid': { windowSize: 15, failureThreshold: 0.25, resetTimeout: 180000 },
    'amd_high': { windowSize: 20, failureThreshold: 0.35, resetTimeout: 120000 },

    // ARM (Raspberry Pi, ARM servers)
    'arm64_rpi5': { windowSize: 10, failureThreshold: 0.20, resetTimeout: 300000 },
    'arm64_server': { windowSize: 15, failureThreshold: 0.25, resetTimeout: 180000 },

    // GPU-accelerated (dedicated VRAM)
    'nvidia_small': { windowSize: 15, failureThreshold: 0.30, resetTimeout: 180000 },   // 4GB VRAM
    'nvidia_medium': { windowSize: 20, failureThreshold: 0.35, resetTimeout: 120000 },  // 8GB VRAM
    'nvidia_large': { windowSize: 20, failureThreshold: 0.40, resetTimeout: 60000 },   // 12-24GB VRAM

    // Apple Silicon
    'apple_silicon': { windowSize: 20, failureThreshold: 0.35, resetTimeout: 120000 },
};

// Get config for this profile
const cbConfig = PROFILE_THRESHOLDS[hardwareProfile] || PROFILE_THRESHOLDS['n100_like'];

const WINDOW_SIZE = cbConfig.windowSize;
const FAILURE_THRESHOLD = cbConfig.failureThreshold;
const RESET_TIMEOUT_MS = cbConfig.resetTimeout;

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
