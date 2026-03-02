'use strict';

/**
 * POST /task — Accept a task from OpenClaw.
 * POST /task/clear — Unblock a supervised-mode blocked task.
 *
 * @module routes/task
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const authMiddleware = require('../middleware/auth');
const queue = require('../services/queue');
const logger = require('../services/logger');
const ledger = require('../services/recovery/ledger');

const router = Router();

/**
 * POST /task
 * Accepts: { task_id?, workspace_path, instruction, trust_mode_override? }
 * Returns: 202 { task_id, status: "queued" }
 */
router.post('/task', authMiddleware, (req, res) => {
    const { workspace_path, instruction, trust_mode_override } = req.body;

    // Validate required fields
    if (!workspace_path || !instruction) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'workspace_path and instruction are required',
        });
    }

    // Generate or use provided task_id
    const task_id = req.body.task_id || uuidv4();

    // Determine effective trust mode
    const trust_mode = trust_mode_override || config.TRUST_MODE;
    if (!['supervised', 'graduated', 'autonomous'].includes(trust_mode)) {
        return res.status(400).json({
            error: 'Bad Request',
            message: 'trust_mode_override must be supervised|graduated|autonomous',
        });
    }

    try {
        const result = queue.enqueue({
            task_id,
            workspace_path,
            instruction,
            trust_mode,
        });

        // Create checkpoint directory
        const checkpointDir = path.join(config.CHECKPOINT_DIR, task_id);
        fs.mkdirSync(checkpointDir, { recursive: true });

        // Persist initial state
        const statePath = path.join(checkpointDir, 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(queue.get(task_id), null, 2));

        logger.info('Task accepted', { task_id, workspace_path, trust_mode });

        return res.status(202).json(result);
    } catch (err) {
        if (err.statusCode === 409) {
            return res.status(409).json({
                error: 'Conflict',
                message: err.message,
            });
        }
        logger.error('Failed to enqueue task', { error: err.message });
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * POST /task/clear
 * Accepts: { task_id, action: 'provide_guidance'|'mark_permanent'|'reset_ledger', guidance?: string, hash?: string }
 * Unblocks a supervised-mode blocked task or manipulates the ledger.
 */
router.post('/task/clear', authMiddleware, (req, res) => {
    const { task_id, action, guidance, hash } = req.body;

    if (!task_id) {
        return res.status(400).json({ error: 'Bad Request', message: 'task_id is required' });
    }

    if (!action) {
        // Fallback for phase 2 compatibility if action is omitted
        const unblocked = queue.clearBlock(task_id);
        if (!unblocked) {
            return res.status(404).json({ error: 'Not Found', message: `Task ${task_id} not found or not in blocked state` });
        }
        logger.info('Task unblocked via legacy /task/clear', { task_id });
        return res.status(200).json({ task_id, status: 'queued', message: 'Task unblocked (legacy)' });
    }

    switch (action) {
        case 'provide_guidance': {
            const task = queue.get(task_id);
            if (!task || task.status !== 'blocked') {
                return res.status(404).json({ error: 'Not Found', message: `Task ${task_id} not blocked` });
            }

            // Attach guidance to task object
            if (guidance) {
                task.guidance = task.guidance ? [...task.guidance, guidance] : [guidance];
            }

            queue.clearBlock(task_id);
            logger.info('Task unblocked with guidance', { task_id });
            return res.status(200).json({ task_id, status: 'queued', message: 'Task resumed with guidance' });
        }

        case 'mark_permanent': {
            if (!hash) return res.status(400).json({ error: 'Bad Request', message: 'hash is required' });
            const entry = ledger.getLedgerEntry(hash, { error_type: 'forced_failure', canonical_key: 'manual', calling_function: 'manual' });
            entry.seen_count = 999;
            entry.staleness_flag = false;
            entry.ttl_days = 999; // effectively permanent
            ledger.saveLedgerEntry(entry);

            // Also unblock the queue by failing the task so the pipeline continues
            const task = queue.get(task_id);
            if (task && task.status === 'blocked') {
                queue.update(task_id, { result: { error: 'Marked permanent' } });
                queue.fail(task_id, 'Marked permanent');
            }

            logger.info('Ledger marked permanent', { hash });
            return res.status(200).json({ task_id, message: 'Marked permanent' });
        }

        case 'reset_ledger': {
            if (!hash) return res.status(400).json({ error: 'Bad Request', message: 'hash is required' });
            const success = ledger.resetLedger(hash);

            if (!success) {
                return res.status(404).json({ error: 'Not Found', message: 'Ledger hash not found' });
            }

            // Also resume the task now that the wall is down
            const task = queue.get(task_id);
            if (task && task.status === 'blocked') {
                queue.clearBlock(task_id);
            }

            return res.status(200).json({ task_id, status: 'queued', message: 'Ledger reset and task resumed' });
        }

        default:
            return res.status(400).json({ error: 'Bad Request', message: `Unknown action: ${action}` });
    }
});

module.exports = router;
