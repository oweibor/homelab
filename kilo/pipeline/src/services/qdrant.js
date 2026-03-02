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
 * @param {object} [filter] - Qdrant filter conditions
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
async function search(collection, vector, limit, scoreThreshold, filter) {
    return withRetry(async () => {
        const searchParams = {
            vector: Array.from(vector),
            limit,
            with_payload: true,
        };
        if (scoreThreshold !== undefined) {
            searchParams.score_threshold = scoreThreshold;
        }
        if (filter) {
            searchParams.filter = filter;
        }
        const result = await client.search(collection, searchParams);
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

/**
 * Get collection info.
 * @param {string} collection - Collection name
 * @returns {Promise<object>}
 */
async function getCollection(collection) {
    return withRetry(async () => {
        return await client.getCollection(collection);
    });
}

/**
 * Create a collection.
 * @param {string} collection - Collection name
 * @param {object} params - Collection parameters
 * @returns {Promise<void>}
 */
async function createCollection(collection, params) {
    return withRetry(async () => {
        await client.createCollection(collection, {
            vectors: params.vectors || { size: params.vectorSize || 384, distance: 'Cosine' },
            ...params,
        });
        logger.debug('Qdrant collection created', { collection });
    });
}

/**
 * Create a payload index.
 * @param {string} collection - Collection name
 * @param {string} field - Field name
 * @param {string} fieldType - Field type (keyword, integer, etc.)
 * @returns {Promise<void>}
 */
async function createIndex(collection, field, fieldType) {
    return withRetry(async () => {
        await client.createPayloadIndex(collection, {
            field_name: field,
            field_type: fieldType,
        });
        logger.debug('Qdrant index created', { collection, field, fieldType });
    });
}

/**
 * Scroll through collection points.
 * @param {string} collection - Collection name
 * @param {object} options - Scroll options (filter, limit, with_payload)
 * @returns {Promise<{points: Array, nextPage: ?number}>}
 */
async function scroll(collection, options = {}) {
    return withRetry(async () => {
        const result = await client.scroll(collection, {
            with_payload: options.with_payload !== false,
            limit: options.limit || 100,
            filter: options.filter,
        });
        return result;
    });
}

/**
 * Delete points from a collection.
 * @param {string} collection - Collection name
 * @param {object} options - Delete options (filter)
 * @returns {Promise<{deleted: number}>}
 */
async function deletePoints(collection, options = {}) {
    return withRetry(async () => {
        const result = await client.delete(collection, {
            wait: true,
            filter: options.filter,
        });
        logger.debug('Qdrant points deleted', { collection, deleted: result.deleted });
        return { deleted: result.deleted || 0 };
    });
}

module.exports = {
    initialize,
    search,
    upsert,
    isHealthy,
    listCollections,
    getCollection,
    createCollection,
    createIndex,
    scroll,
    delete: deletePoints,
};
