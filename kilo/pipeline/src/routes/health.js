'use strict';

/**
 * GET /health — Aggregated health endpoint.
 * Checks Qdrant, Ollama, circuit state, and uptime.
 * Never throws — always returns degraded status on failure.
 *
 * @module routes/health
 */

const { Router } = require('express');
const config = require('../config');
const queue = require('../services/queue');
const logger = require('../services/logger');

const router = Router();

const startTime = Date.now();

/**
 * Check if a service is reachable within timeout.
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function checkService(url, timeoutMs) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return res.ok;
    } catch {
        return false;
    }
}

/**
 * GET /health
 * Returns: { status, trust_mode, circuit_state, qdrant, ollama, uptime_seconds, queue_size }
 */
router.get('/health', async (_req, res) => {
    try {
        const timeout = config.HEALTH_CHECK_TIMEOUT_MS;

        // Parallel downstream checks
        const [qdrantOk, ollamaOk] = await Promise.all([
            checkService(`${config.QDRANT_HOST}/healthz`, timeout),
            checkService(`${config.OLLAMA_HOST}/api/tags`, timeout),
        ]);

        const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
        const allOk = qdrantOk && ollamaOk;

        const health = {
            status: allOk ? 'ok' : 'degraded',
            trust_mode: config.TRUST_MODE,
            circuit_state: 'closed', // Phase 4 will make this dynamic
            qdrant: qdrantOk,
            ollama: ollamaOk,
            uptime_seconds: uptimeSeconds,
            queue_size: queue.size,
            current_task: queue.currentTaskId,
        };

        // Always 200 — never 5xx on health endpoint
        return res.status(200).json(health);
    } catch (err) {
        logger.error('Health check error', { error: err.message });
        return res.status(200).json({
            status: 'error',
            trust_mode: config.TRUST_MODE,
            circuit_state: 'unknown',
            qdrant: false,
            ollama: false,
            uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
            queue_size: 0,
            error: err.message,
        });
    }
});

module.exports = router;
