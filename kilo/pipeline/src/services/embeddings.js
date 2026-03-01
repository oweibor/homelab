'use strict';

/**
 * MiniLM-L6-v2 embedding wrapper.
 * Uses @xenova/transformers for CPU-only inference.
 * Model auto-downloads on first run, cached to MODEL_CACHE_DIR.
 *
 * Constraint: ~200 MB RAM, CPU-only, quantized.
 *
 * @module services/embeddings
 */

const config = require('../config');
const logger = require('./logger');

/** @type {import('@xenova/transformers').Pipeline|null} */
let pipeline = null;

/** @type {boolean} */
let isLoading = false;

/** @type {Promise<void>|null} */
let loadingPromise = null;

/**
 * Initialize the embedding model.
 * Called once on startup. Subsequent calls are no-ops.
 * @returns {Promise<void>}
 */
async function initialize() {
    if (pipeline) return;
    if (isLoading) return loadingPromise;

    isLoading = true;
    loadingPromise = _loadModel();
    await loadingPromise;
}

/** @private */
async function _loadModel() {
    try {
        logger.info('Loading MiniLM-L6-v2 embedding model...', {
            cache_dir: config.MODEL_CACHE_DIR,
        });

        const startMs = Date.now();

        // Dynamic import — @xenova/transformers is ESM-compatible via CJS interop
        const { pipeline: createPipeline, env } = await import('@xenova/transformers');

        // Configure cache directory and disable remote model fetching after first download
        env.cacheDir = config.MODEL_CACHE_DIR;
        env.allowRemoteModels = true; // Needed for first download; model is cached after

        pipeline = await createPipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2',
            { quantized: true }
        );

        const durationMs = Date.now() - startMs;
        logger.info('Embedding model loaded', { duration_ms: durationMs });
    } catch (err) {
        logger.error('Failed to load embedding model', { error: err.message });
        isLoading = false;
        loadingPromise = null;
        throw err;
    }
}

/**
 * Generate a 384-dimensional embedding for the given text.
 *
 * @param {string} text - Input text to embed
 * @returns {Promise<Float32Array>} 384-dim vector
 * @throws {Error} If model not initialized
 */
async function embed(text) {
    if (!pipeline) {
        throw new Error('Embedding model not initialized. Call initialize() first.');
    }

    const result = await pipeline(text, {
        pooling: 'mean',
        normalize: true,
    });

    // result.data is a Float32Array of shape [1, 384]
    return new Float32Array(result.data);
}

/**
 * Check if the embedding model is ready.
 * @returns {boolean}
 */
function isReady() {
    return pipeline !== null;
}

module.exports = { initialize, embed, isReady };
