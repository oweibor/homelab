'use strict';

const client = require('prom-client');
const logger = require('./logger');

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'kilo-pipeline'
});

// Create default metrics (cpu, memory, etc.)
client.collectDefaultMetrics({ register });

// --- Custom Metrics ---

// Lazy-loaded scraper metrics to avoid startup failures
let _scraperMetrics = null;
let _scraperMetricsError = false;
function getScraperMetrics() {
    if (_scraperMetricsError) {
        return null;  // Already failed, don't retry
    }
    if (!_scraperMetrics) {
        try {
            _scraperMetrics = require('./scraper/metrics');
        } catch (e) {
            // Scraper metrics module not available - mark as failed to avoid retries
            _scraperMetricsError = true;
            return null;
        }
    }
    return _scraperMetrics;
}

// Task counts by terminal state
const taskCount = new client.Counter({
    name: 'kilo_task_count_total',
    help: 'Total number of tasks processed by the pipeline',
    labelNames: ['status'],
    registers: [register]
});

// Gate failure counts
const gateFailureCount = new client.Counter({
    name: 'kilo_gate_failure_count_total',
    help: 'Total number of gate rejections',
    labelNames: ['gate', 'tier'],
    registers: [register]
});

// Quarantine depth (number of items currently in quarantine)
const quarantineDepth = new client.Gauge({
    name: 'kilo_quarantine_depth',
    help: 'Current number of items in the quarantine directories',
    labelNames: ['type'],
    registers: [register]
});

// Circuit breaker state (0=closed, 1=open, 2=half_open)
const circuitState = new client.Gauge({
    name: 'kilo_circuit_breaker_state',
    help: 'Current state of the Ollama circuit breaker (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
    registers: [register]
});

// Qdrant collection sizes
const qdrantCollectionSize = new client.Gauge({
    name: 'kilo_qdrant_collection_size',
    help: 'Number of points in each Qdrant collection',
    labelNames: ['collection'],
    registers: [register]
});

/**
 * Update quarantine depth by scanning directories.
 * This can be called periodically or on specific events.
 */
async function updateQuarantineMetrics() {
    const fs = require('fs');
    const path = require('path');
    const quarantinePath = '/var/kilo/quarantine';

    const types = ['decisions', 'invariants', 'tasks'];
    for (const type of types) {
        const dir = path.join(quarantinePath, type);
        try {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                quarantineDepth.set({ type }, files.length);
            }
        } catch (err) {
            logger.error('Failed to update quarantine metrics', { type, error: err.message });
        }
    }
}

module.exports = {
    register,
    taskCount,
    gateFailureCount,
    quarantineDepth,
    circuitState,
    qdrantCollectionSize,
    updateQuarantineMetrics,
    // Lazy-loaded scraper metrics getter with safety wrapper
    get scraperMetrics() {
        try {
            return getScraperMetrics();
        } catch (e) {
            return null;
        }
    }
};
