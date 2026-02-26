'use strict';

/**
 * Stage 2: Failure Ledger.
 * Persistent storage of error hashes to track occurrence counts, TTLs, and fix attempts.
 * Implements the 4x wall routing for supervised and graduated trust modes.
 *
 * @module services/recovery/ledger
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../logger');
const queue = require('../queue');

const LEDGER_DIR = config.FAILURE_LEDGER_DIR;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Determine TTL in days based on error category.
 * @param {string} errorType
 * @returns {number} Days until stale
 */
function getTTL(errorType) {
    const type = errorType.toLowerCase();

    // Syntax errors (typos, indentation) stay valid longest
    if (type.includes('syntax') || type.includes('indentation')) return 180;

    // Import and version mismatches
    if (type.includes('import') || type.includes('module') || type.includes('version')) return 30;

    // Stack specific (e.g. Flutter lifecycle, Postgres connection)
    if (type.includes('flutter') || type.includes('postgres') || type.includes('db')) return 60;

    // Default runtime
    return 90;
}

/**
 * Retrieve a ledger entry for a given hash.
 * If TTL has expired, sets staleness_flag to true and resets seen_count to 1.
 * @param {string} hash - SHA256 canonical hash
 * @param {object} metadata - Details to populate on creation (type, key, calling_function)
 * @returns {object} Ledger entry
 */
function getLedgerEntry(hash, metadata) {
    if (!fs.existsSync(LEDGER_DIR)) {
        fs.mkdirSync(LEDGER_DIR, { recursive: true });
    }

    const filePath = path.join(LEDGER_DIR, `${hash}.json`);
    const now = new Date().toISOString();

    if (fs.existsSync(filePath)) {
        try {
            const entry = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            const lastSeenStr = entry.last_seen || entry.first_seen || now;
            const msSinceLast = new Date(now).getTime() - new Date(lastSeenStr).getTime();
            const daysSinceLast = msSinceLast / MS_PER_DAY;

            const isStale = daysSinceLast > (entry.ttl_days || getTTL(entry.error_type));

            if (isStale) {
                logger.info('Ledger entry is stale — resetting count', { hash });
                entry.staleness_flag = true;
                entry.seen_count = 1;
            } else {
                entry.staleness_flag = false;
                entry.seen_count += 1;
            }

            entry.last_seen = now;
            // Note: We don't overwrite fix_attempts here, we append later if needed

            return entry;
        } catch (err) {
            logger.error('Failed to parse ledger file (corrupted)', { hash, error: err.message });
            // Fall through to recreation
        }
    }

    // Create new
    const ttl = getTTL(metadata.error_type);
    const newEntry = {
        hash,
        error_type: metadata.error_type,
        canonical_key: metadata.canonical_key,
        calling_function: metadata.calling_function,
        seen_count: 1,
        first_seen: now,
        last_seen: now,
        dependency_versions: metadata.dependency_versions || null,
        staleness_flag: false,
        ttl_days: ttl,
        fix_attempts: [], // Array of { patch_id, score, applied_at, success }
    };

    return newEntry;
}

/**
 * Write a ledger entry to disk.
 * @param {object} entry
 */
function saveLedgerEntry(entry) {
    const filePath = path.join(LEDGER_DIR, `${entry.hash}.json`);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
}

/**
 * Evaluate the 4x Wall (Task 3.3).
 * If seen_count >= 4 and not stale, trigger Trust Mode routing.
 * @param {string} taskId
 * @param {object} entry - The current ledger entry
 * @returns {boolean} True if the pipeline should halt/quarantine, False to continue
 */
function evaluateWall(taskId, entry) {
    if (entry.seen_count < 4 || entry.staleness_flag) {
        return false; // Continue down pipeline
    }

    const { TRUST_MODE } = config;
    const reason = `Error hash ${entry.hash} occurred ${entry.seen_count} times.`;

    logger.warn('4x Wall triggered', { task_id: taskId, hash: entry.hash, trust_mode: TRUST_MODE });

    if (TRUST_MODE === 'supervised') {
        // Block task, requires human intervention via /task/clear
        queue.block(taskId, reason);
        return true; // Halt pipeline
    } else {
        // graduated or autonomous: quarantine the task and fail it so pipeline can grab next task
        const quarantinePath = path.join('/var/kilo/quarantine/tasks', `${entry.hash}.json`);

        // Save minimal representation to quarantine to help manual debugging later
        try {
            fs.mkdirSync(path.dirname(quarantinePath), { recursive: true });
            fs.writeFileSync(quarantinePath, JSON.stringify({
                task_id: taskId,
                reason,
                ledger: entry
            }, null, 2));
        } catch (err) {
            logger.error('Failed to write to quarantine', { task_id: taskId, error: err.message });
        }

        queue.fail(taskId, reason); // Marks complete (failed) so pipeline continues
        return true; // Halt pipeline for this task
    }
}

/**
 * Reset (delete) a ledger file for a specific hash. Allow fresh attempts.
 * @param {string} hash
 * @returns {boolean} true if deleted
 */
function resetLedger(hash) {
    const filePath = path.join(LEDGER_DIR, `${hash}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Ledger reset', { hash });
        return true;
    }
    return false;
}

module.exports = { getLedgerEntry, saveLedgerEntry, evaluateWall, resetLedger, getTTL };
