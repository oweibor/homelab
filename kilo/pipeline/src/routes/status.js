'use strict';

/**
 * GET /status/:task_id — Return task state from memory + checkpoint.
 *
 * @module routes/status
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const queue = require('../services/queue');

const router = Router();

/**
 * GET /status/:task_id
 * Returns task state. Falls back to checkpoint file if not in memory.
 */
router.get('/status/:task_id', (req, res) => {
    const { task_id } = req.params;

    // Check in-memory queue first
    const task = queue.get(task_id);

    if (task) {
        return res.json({
            task_id: task.task_id,
            status: task.status,
            current_stage: task.current_stage,
            started_at: task.started_at,
            updated_at: task.updated_at,
            result: task.result,
        });
    }

    // Fall back to checkpoint on disk
    const statePath = path.join(config.CHECKPOINT_DIR, task_id, 'state.json');

    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            return res.json({
                task_id: state.task_id,
                status: state.status,
                current_stage: state.current_stage,
                started_at: state.started_at,
                updated_at: state.updated_at,
                result: state.result,
                source: 'checkpoint',
            });
        } catch {
            return res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to read checkpoint state',
            });
        }
    }

    return res.status(404).json({
        error: 'Not Found',
        message: `Task ${task_id} not found`,
    });
});

module.exports = router;
