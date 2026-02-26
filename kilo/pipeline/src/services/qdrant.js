'use strict';

/**
 * Qdrant vector database client with retry logic.
 * Wraps @qdrant/js-client-rest with exponential backoff.
 *
 * @module services/qdrant
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const config = require('../config');
const logger = require('./logger');

/** @type {QdrantClient} */
let client;

/**
 * Initialize the Qdrant client.
 * Parses QDRANT_HOST URL to extract host and port.
 */
function initialize() {
    const url = new URL(config.QDRANT_HOST);
    client = new QdrantClient({
        host: url.hostname,
        port: parseInt(url.port, 10) || 6333,
    });
    logger.info('Qdrant client initialized', { host: config.QDRANT_HOST });
}

/**
 * Retry wrapper with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Max retries (default 3)
 * @param {number} baseDelayMs - Initial delay (default 500ms)
 * @returns {Promise<*>}
 */
async function withRetry(fn, retries = 3, baseDelayMs = 500) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                logger.warn('Qdrant operation failed, retrying', {
                    attempt: attempt + 1,
                    delay_ms: delay,
                    error: err.message,
                });
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

/**
 * Search a collection for similar vectors.
 *
 * @param {string} collection - Collection name
 * @param {Float32Array|number[]} vector - Query vector (384-dim)
 * @param {number} limit - Max results
 * @param {number} [scoreThreshold] - Minimum similarity score
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
async function search(collection, vector, limit, scoreThreshold) {
    return withRetry(async () => {
        const result = await client.search(collection, {
            vector: Array.from(vector),
            limit,
            score_threshold: scoreThreshold,
            with_payload: true,
        });
        return result;
    });
}

/**
 * Upsert points into a collection.
 *
 * @param {string} collection - Collection name
 * @param {Array<{id: string, vector: number[], payload: object}>} points
 * @returns {Promise<void>}
 */
async function upsert(collection, points) {
    return withRetry(async () => {
        await client.upsert(collection, {
            wait: true,
            points: points.map((p) => ({
                id: p.id,
                vector: Array.from(p.vector),
                payload: p.payload,
            })),
        });
        logger.debug('Qdrant upsert complete', {
            collection,
            count: points.length,
        });
    });
}

/**
 * Check if Qdrant is healthy.
 * @returns {Promise<boolean>}
 */
async function isHealthy() {
    try {
        await client.getCollections();
        return true;
    } catch {
        return false;
    }
}

/**
 * List all collections.
 * @returns {Promise<string[]>}
 */
async function listCollections() {
    const result = await client.getCollections();
    return result.collections.map((c) => c.name);
}

module.exports = { initialize, search, upsert, isHealthy, listCollections };
