'use strict';

/**
 * kilo-pipeline configuration.
 * Validates required environment variables and exports a frozen config object.
 * Fails fast on missing OPENCLAW_TOKEN (security requirement).
 *
 * @module config
 */

/** @type {string} */
let HARDWARE_PROFILE = process.env.HARDWARE_PROFILE || 'n100_like';

// Validate hardware profile
const VALID_PROFILES = [
    'n100_like', 'celeron',
    'core_i3', 'core_i5', 'core_i7',
    'amd_low', 'amd_mid', 'amd_high',
    'arm64_rpi5', 'arm64_server',
    'nvidia_small', 'nvidia_medium', 'nvidia_large',
    'apple_silicon'
];

if (!VALID_PROFILES.includes(HARDWARE_PROFILE)) {
    console.warn(`[CONFIG] Unknown HARDWARE_PROFILE="${HARDWARE_PROFILE}". Defaulting to n100_like.`);
    HARDWARE_PROFILE = 'n100_like';
}

/**
 * Hardware-aware circuit breaker threshold.
 * - Low-power (n100_like, celeron, arm64_rpi5): use conservative thresholds
 * - Standard (core_i3, amd_low): standard threshold
 * - Mid-range (core_i5, amd_mid, nvidia_small): higher tolerance
 * - High-performance (core_i7, amd_high, nvidia_medium/large, apple_silicon): maximum tolerance
 * 
 * Note: This threshold matches circuitBreaker.js PROFILE_THRESHOLDS values.
 */

// Direct threshold values matching circuitBreaker.js
const PROFILE_THRESHOLDS = {
    // Low-power Intel
    'n100_like': 0.15,
    'celeron': 0.20,

    // Standard Intel
    'core_i3': 0.25,
    'core_i5': 0.30,
    'core_i7': 0.35,

    // AMD
    'amd_low': 0.15,
    'amd_mid': 0.25,
    'amd_high': 0.35,

    // ARM (Raspberry Pi, ARM servers)
    'arm64_rpi5': 0.20,
    'arm64_server': 0.25,

    // GPU-accelerated (dedicated VRAM)
    'nvidia_small': 0.30,   // 4GB VRAM
    'nvidia_medium': 0.35,  // 8GB VRAM
    'nvidia_large': 0.40,   // 12-24GB VRAM

    // Apple Silicon
    'apple_silicon': 0.35,
};

// Allow override via environment variable
const CIRCUIT_BREAKER_THRESHOLD = parseFloat(process.env.OLLAMA_CIRCUIT_BREAKER_THRESHOLD)
    || PROFILE_THRESHOLDS[HARDWARE_PROFILE]
    || 0.15;

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
    /** Hardware profile: n100_like | celeron | core_i3 | core_i5 | amd_low | amd_mid */
    HARDWARE_PROFILE,

    /** Pipeline HTTP port */
    PORT: parseInt(process.env.KILO_PIPELINE_PORT, 10) || 3100,

    /** Trust mode: supervised | graduated | autonomous */
    TRUST_MODE,

    /** Qdrant vector DB endpoint */
    QDRANT_HOST: process.env.QDRANT_HOST || 'http://qdrant:6333',

    /** Bearer token for OpenClaw auth */
    OPENCLAW_TOKEN,

    /** Docker socket proxy endpoint for sandbox spawning */
    DOCKER_HOST: process.env.DOCKER_HOST || 'tcp://kilo-proxy:2376',

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

    /** Circuit breaker threshold - hardware-aware based on HARDWARE_PROFILE */
    CIRCUIT_BREAKER_THRESHOLD,
});

module.exports = config;
