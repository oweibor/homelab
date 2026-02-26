'use strict';

/**
 * kilo-pipeline configuration.
 * Validates required environment variables and exports a frozen config object.
 * Fails fast on missing OPENCLAW_TOKEN (security requirement).
 *
 * @module config
 */

/** @type {string} */
const TRUST_MODE = process.env.TRUST_MODE || 'supervised';
if (!['supervised', 'graduated', 'autonomous'].includes(TRUST_MODE)) {
    console.error(`[CONFIG] Invalid TRUST_MODE="${TRUST_MODE}". Must be supervised|graduated|autonomous.`);
    process.exit(1);
}

/** @type {string} */
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN;
if (!OPENCLAW_TOKEN) {
    console.error('[CONFIG] OPENCLAW_TOKEN is required. Set it in .env or docker-compose environment.');
    process.exit(1);
}

/** @type {Readonly<object>} */
const config = Object.freeze({
    /** Pipeline HTTP port */
    PORT: parseInt(process.env.KILO_PIPELINE_PORT, 10) || 3100,

    /** Trust mode: supervised | graduated | autonomous */
    TRUST_MODE,

    /** Qdrant vector DB endpoint */
    QDRANT_HOST: process.env.QDRANT_HOST || 'http://qdrant:6333',

    /** Bearer token for OpenClaw auth */
    OPENCLAW_TOKEN,

    /** Docker socket proxy endpoint for sandbox spawning */
    DOCKER_HOST: process.env.DOCKER_HOST || 'tcp://kilo-proxy:2375',

    /** Ollama inference endpoint */
    OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://ollama:11434',

    /** Checkpoint base path on host volume */
    CHECKPOINT_DIR: '/var/kilo/checkpoints',

    /** Failure ledger path */
    FAILURE_LEDGER_DIR: '/var/kilo/failure_ledger',

    /** .kilo project directory (mounted from repo) */
    KILO_PROJECT_DIR: '/app/.kilo',

    /** MiniLM model cache dir */
    MODEL_CACHE_DIR: '/app/models',

    /** Sandbox memory limit */
    SANDBOX_MEM_LIMIT: '2g',

    /** Sandbox image */
    SANDBOX_IMAGE: 'node:20-slim',

    /** Memory retrieval timeout (ms) */
    MEMORY_TIMEOUT_MS: 90_000,

    /** Health check downstream timeout (ms) */
    HEALTH_CHECK_TIMEOUT_MS: 2_000,

    /** Watcher reconciliation interval (cron) */
    RECONCILIATION_CRON: '*/5 * * * *',

    /** Circuit breaker threshold — tighter for 3B model */
    CIRCUIT_BREAKER_THRESHOLD: 0.15,
});

module.exports = config;
