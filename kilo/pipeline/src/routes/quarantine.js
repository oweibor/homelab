'use strict';

/**
 * Task 5.9: Quarantine API.
 * GET /quarantine -> Lists active quarantined items (e.g. failed Sem Invariants).
 * POST /quarantine/:id/override -> Promote or Dismiss quarantined items.
 * 
 * @module routes/quarantine
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');
const promotionEngine = require('../services/promotion/engine');
const auth = require('../middleware/auth');

const router = express.Router();

// A generic function to find a JSON file across the various quarantine sub-directories
function findQuarantineItem(baseDir, id) {
    const subdirs = ['tasks', 'invariants', 'decisions'];
    for (const sub of subdirs) {
        // Many files might be written as {id}_{taskId}.json, so we regex match the start
        const dir = path.join(baseDir, sub);
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            const match = files.find(f => f.startsWith(id));
            if (match) {
                return path.join(dir, match);
            }
        }
    }
    return null;
}

/**
 * GET /quarantine
 */
router.get('/', (req, res) => {
    const quarantineBase = '/var/kilo/quarantine';
    let allItems = [];

    if (!fs.existsSync(quarantineBase)) {
        return res.json([]);
    }

    try {
        const subdirs = ['tasks', 'invariants', 'decisions'];
        for (const sub of subdirs) {
            const d = path.join(quarantineBase, sub);
            if (fs.existsSync(d)) {
                fs.readdirSync(d).filter(f => f.endsWith('.json')).forEach(file => {
                    const content = JSON.parse(fs.readFileSync(path.join(d, file), 'utf8'));
                    allItems.push({ ...content, quarantine_type: sub });
                });
            }
        }
        res.json(allItems);
    } catch (err) {
        logger.error('Failed to read quarantine', { error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * POST /quarantine/:id/override
 */
router.post('/:id/override', auth, async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // 'promote' or 'dismiss'
    const workspacePath = req.body.workspace || '/var/kilo/workspace_stub';
    const quarantineBase = '/var/kilo/quarantine';

    const itemPath = findQuarantineItem(quarantineBase, id);

    if (!itemPath) {
        return res.status(404).json({ error: 'Quarantine item not found' });
    }

    try {
        const item = JSON.parse(fs.readFileSync(itemPath, 'utf8'));

        if (action === 'promote') {
            const success = await promotionEngine.promoteItem(item, workspacePath);
            if (success) {
                fs.unlinkSync(itemPath);
                return res.json({ status: 'overridden_promoted' });
            }
            return res.status(500).json({ error: 'Failed' });
        } else if (action === 'dismiss') {
            const dismissedDir = path.join(quarantineBase, 'dismissed');
            fs.mkdirSync(dismissedDir, { recursive: true });

            fs.writeFileSync(path.join(dismissedDir, path.basename(itemPath)), JSON.stringify(item));
            fs.unlinkSync(itemPath);

            return res.json({ status: 'dismissed' });
        } else {
            return res.status(400).json({ error: 'Action must be promote or dismiss' });
        }

    } catch (err) {
        logger.error('Quarantine override error', { id, error: err.message });
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
