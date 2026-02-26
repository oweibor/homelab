'use strict';

/**
 * inotify file watcher for .kilo/ project directory.
 * Watches for new/changed files and indexes them into Qdrant.
 * Excludes staging/, rejected/, and .git/ directories.
 * Reconciliation cron runs every 5 minutes.
 *
 * @module services/watcher
 */

const chokidar = require('chokidar');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const config = require('../config');
const embeddings = require('./embeddings');
const qdrant = require('./qdrant');
const logger = require('./logger');

/**
 * Map directory names to Qdrant collection names.
 */
const DIR_TO_COLLECTION = {
    decisions: 'project_decisions',
    invariants: 'project_invariants',
    reasoning: 'project_reasoning',
    history: 'project_history',
    context: 'project_context',
};

/** @type {Set<string>} Paths already indexed (dedup) */
const indexedPaths = new Set();

/** @type {chokidar.FSWatcher|null} */
let watcher = null;

/** @type {cron.ScheduledTask|null} */
let reconciliationJob = null;

/** @type {EventEmitter} */
const events = new EventEmitter();

/**
 * Determine the Qdrant collection for a file path.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} Collection name, or null if not indexable
 */
function getCollection(filePath) {
    const relative = path.relative(config.KILO_PROJECT_DIR, filePath);
    const topDir = relative.split(path.sep)[0];
    return DIR_TO_COLLECTION[topDir] || null;
}

/**
 * Index a single file into its corresponding Qdrant collection.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<boolean>} true if indexed, false if skipped
 */
async function indexFile(filePath) {
    // Skip non-files
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return false;
    }

    // Skip empty files and .gitkeep
    const basename = path.basename(filePath);
    if (basename === '.gitkeep') return false;

    const collection = getCollection(filePath);
    if (!collection) {
        logger.debug('Skipping file (no matching collection)', { path: filePath });
        return false;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) return false;

        // Generate embedding
        const vector = await embeddings.embed(content);

        // Create point
        const pointId = uuidv4();
        const relativePath = path.relative(config.KILO_PROJECT_DIR, filePath);

        await qdrant.upsert(collection, [{
            id: pointId,
            vector,
            payload: {
                source_path: relativePath,
                title: basename,
                content,
                indexed_at: new Date().toISOString(),
                file_size: Buffer.byteLength(content, 'utf8'),
            },
        }]);

        indexedPaths.add(filePath);

        logger.info('File indexed', {
            path: relativePath,
            collection,
            point_id: pointId,
        });

        // Emit indexed event (used by memory retrieval race prevention)
        events.emit('indexed', { path: filePath, collection, pointId });

        return true;
    } catch (err) {
        logger.error('Failed to index file', {
            path: filePath,
            error: err.message,
        });
        return false;
    }
}

/**
 * Start the file watcher.
 * Watches .kilo/ directory, excluding staging/, rejected/, .git/.
 */
function start() {
    const watchDir = config.KILO_PROJECT_DIR;

    logger.info('Starting file watcher', { dir: watchDir });

    watcher = chokidar.watch(watchDir, {
        ignored: [
            '**/staging/**',
            '**/rejected/**',
            '**/.git/**',
            '**/.gitkeep',
            '**/invariants.yaml', // Invariants are file-locked, handled separately
        ],
        persistent: true,
        ignoreInitial: false, // Index existing files on startup
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 200,
        },
    });

    watcher.on('add', (filePath) => {
        logger.debug('Watcher: file added', { path: filePath });
        indexFile(filePath).catch((err) =>
            logger.error('Watcher index error', { path: filePath, error: err.message })
        );
    });

    watcher.on('change', (filePath) => {
        logger.debug('Watcher: file changed', { path: filePath });
        indexFile(filePath).catch((err) =>
            logger.error('Watcher index error', { path: filePath, error: err.message })
        );
    });

    watcher.on('error', (err) => {
        logger.error('Watcher error', { error: err.message });
    });

    watcher.on('ready', () => {
        logger.info('Watcher ready — initial scan complete');
    });

    // Start reconciliation cron
    startReconciliation();
}

/**
 * Reconciliation cron — re-indexes any files missed by the watcher.
 * Runs every 5 minutes.
 */
function startReconciliation() {
    reconciliationJob = cron.schedule(config.RECONCILIATION_CRON, async () => {
        logger.debug('Reconciliation cron started');

        const dirs = Object.keys(DIR_TO_COLLECTION);
        let indexed = 0;

        for (const dir of dirs) {
            const dirPath = path.join(config.KILO_PROJECT_DIR, dir);
            if (!fs.existsSync(dirPath)) continue;

            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                if (!indexedPaths.has(filePath) && file !== '.gitkeep') {
                    const result = await indexFile(filePath);
                    if (result) indexed++;
                }
            }
        }

        if (indexed > 0) {
            logger.info('Reconciliation complete', { newly_indexed: indexed });
        }
    });

    logger.info('Reconciliation cron registered', {
        schedule: config.RECONCILIATION_CRON,
    });
}

/**
 * Stop the watcher and reconciliation cron.
 */
function stop() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    if (reconciliationJob) {
        reconciliationJob.stop();
        reconciliationJob = null;
    }
    logger.info('Watcher stopped');
}

module.exports = { start, stop, indexFile, events };
