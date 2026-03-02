'use strict';

/**
 * Checkpoint Store for LangGraph State Persistence.
 * 
 * Enables resumable crawls by saving state periodically.
 * 
 * @module services/scraper/langgraph/checkpoint
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../logger');

/**
 * File-based checkpoint store.
 * Saves checkpoints to filesystem for persistence.
 */
class FileCheckpointStore {
    constructor(options = {}) {
        this.basePath = options.basePath || process.env.CHECKPOINT_DIR || '/var/kilo/checkpoints';
        this.logger = logger;
    }

    /**
     * Ensure checkpoint directory exists.
     */
    async _ensureDir() {
        try {
            await fs.mkdir(this.basePath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Get checkpoint file path for a job.
     * @param {string} jobId - Job ID
     * @returns {string} File path
     */
    _getFilePath(jobId) {
        return path.join(this.basePath, `scrape-${jobId}.json`);
    }

    /**
     * Save checkpoint.
     * @param {string} jobId - Job ID
     * @param {object} state - State to save
     */
    async save(jobId, state) {
        await this._ensureDir();

        const filePath = this._getFilePath(jobId);

        const data = {
            job_id: jobId,
            saved_at: new Date().toISOString(),
            state,
        };

        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

        this.logger.debug('Checkpoint saved', { jobId, path: filePath });
    }

    /**
     * Load checkpoint.
     * @param {string} jobId - Job ID
     * @returns {Promise<object|null>} Checkpoint data or null
     */
    async load(jobId) {
        const filePath = this._getFilePath(jobId);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);

            this.logger.debug('Checkpoint loaded', { jobId });

            return parsed.state;
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }

            this.logger.error('Failed to load checkpoint', { jobId, error: error.message });
            throw error;
        }
    }

    /**
     * Delete checkpoint.
     * @param {string} jobId - Job ID
     */
    async delete(jobId) {
        const filePath = this._getFilePath(jobId);

        try {
            await fs.unlink(filePath);
            this.logger.debug('Checkpoint deleted', { jobId });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * List all checkpoints.
     * @returns {Promise<string[]>} List of job IDs
     */
    async list() {
        await this._ensureDir();

        try {
            const files = await fs.readdir(this.basePath);

            return files
                .filter(f => f.startsWith('scrape-') && f.endsWith('.json'))
                .map(f => f.replace('scrape-', '').replace('.json', ''));
        } catch (error) {
            this.logger.error('Failed to list checkpoints', { error: error.message });
            return [];
        }
    }

    /**
     * Get checkpoint metadata without loading full state.
     * @param {string} jobId - Job ID
     * @returns {Promise<object|null>} Metadata or null
     */
    async getMetadata(jobId) {
        const filePath = this._getFilePath(jobId);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(data);

            return {
                job_id: parsed.job_id,
                saved_at: parsed.saved_at,
                page_number: parsed.state?.page_number,
                pages_crawled: parsed.state?.visited_urls?.length,
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }

            return null;
        }
    }
}

/**
 * Memory-based checkpoint store (for testing).
 */
class MemoryCheckpointStore {
    constructor() {
        this.checkpoints = new Map();
    }

    async save(jobId, state) {
        this.checkpoints.set(jobId, {
            job_id: jobId,
            saved_at: new Date().toISOString(),
            state,
        });
    }

    async load(jobId) {
        const checkpoint = this.checkpoints.get(jobId);
        return checkpoint ? checkpoint.state : null;
    }

    async delete(jobId) {
        this.checkpoints.delete(jobId);
    }

    async list() {
        return Array.from(this.checkpoints.keys());
    }
}

module.exports = {
    FileCheckpointStore,
    MemoryCheckpointStore,
};
