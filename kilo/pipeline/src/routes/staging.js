'use strict';

/**
 * Task 5.7 & 5.8: Staging API.
 * GET /staging -> Lists pending ADRs and invariants.
 * POST /staging/:id/approve|reject -> Manual oversight controls.
 * 
 * @module routes/staging
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');
const promotionEngine = require('../services/promotion/engine');
const auth = require('../middleware/auth');

const router = express.Router();

/**
 * GET /staging
 * Returns array of pending staging items.
 */
router.get('/', (req, res) => {
    // We assume the caller knows their workspace or we default to oweibo
    const workspacePath = req.query.workspace || '/var/kilo/workspace_stub';
    const stagingDir = path.join(workspacePath, '.kilo', 'staging');

    if (!fs.existsSync(stagingDir)) {
        return res.json([]);
    }

    try {
        const items = fs.readdirSync(stagingDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const raw = fs.readFileSync(path.join(stagingDir, f), 'utf8');
                return JSON.parse(raw);
            });

        // Sort by corroboration_count desc
        items.sort((a, b) => (b.corroboration_count || 1) - (a.corroboration_count || 1));
        res.json(items);

    } catch (err) {
        logger.error('Failed to read staging directory', { error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * POST /staging/:id/approve
 * Manually promote item to active memory.
 */
router.post('/:id/approve', auth, async (req, res) => {
    const { id } = req.params;
    const workspacePath = req.body.workspace || '/var/kilo/workspace_stub';
    const stagingPath = path.join(workspacePath, '.kilo', 'staging', `${id}.json`);

    if (!fs.existsSync(stagingPath)) {
        return res.status(404).json({ error: 'Staging item not found' });
    }

    try {
        const item = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
        const success = await promotionEngine.promoteItem(item, workspacePath);

        if (success) {
            res.json({ status: 'approved', promoted_to: item.type === 'decision' ? 'project_decisions' : 'project_invariants', qdrant_updated: true });
        } else {
            res.status(500).json({ error: 'Failed to promote item' });
        }
    } catch (err) {
        logger.error('Approve route error', { id, error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * POST /staging/:id/reject
 * Move item from staging to rejected folder.
 */
router.post('/:id/reject', auth, (req, res) => {
    const { id } = req.params;
    const { reason = 'Manual rejection' } = req.body;
    const workspacePath = req.body.workspace || '/var/kilo/workspace_stub';

    const stagingPath = path.join(workspacePath, '.kilo', 'staging', `${id}.json`);
    const rejectedDir = path.join(workspacePath, '.kilo', 'rejected');

    if (!fs.existsSync(stagingPath)) {
        return res.status(404).json({ error: 'Staging item not found' });
    }

    try {
        fs.mkdirSync(rejectedDir, { recursive: true });

        const item = JSON.parse(fs.readFileSync(stagingPath, 'utf8'));
        item.rejected_at = new Date().toISOString();
        item.rejection_reason = reason;

        fs.writeFileSync(path.join(rejectedDir, `${id}.json`), JSON.stringify(item, null, 2));
        fs.unlinkSync(stagingPath); // Delete from staging

        logger.info('Staging item rejected manually', { id, reason });
        res.json({ status: 'rejected', id });

    } catch (err) {
        logger.error('Reject route error', { id, error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
