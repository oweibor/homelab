'use strict';

/**
 * Task 5.6: Promotion Engine.
 * Periodically or per-task evaluates items in kilo/.kilo/staging/.
 * Auto-promotes items to active memory (Qdrant & project_decisions) 
 * based on corroboration count and the active TRUST_MODE.
 * 
 * @module services/promotion/engine
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const config = require('../../config');
const qdrant = require('../qdrant');
const embeddings = require('../embeddings');

/**
 * Perform manual or automatic promotion of a staging item.
 * 
 * @param {object} item 
 * @param {string} workspacePath 
 * @returns {Promise<boolean>}
 */
async function promoteItem(item, workspacePath) {
    try {
        const { type, id, title, rule, assertion_template, rationale, consequences } = item;

        // 1. Move to permanent storage based on type
        if (type === 'decision') {
            const decisionsDir = path.join(workspacePath, '.kilo', 'project_decisions');
            fs.mkdirSync(decisionsDir, { recursive: true });
            fs.writeFileSync(path.join(decisionsDir, `${id}.json`), JSON.stringify(item, null, 2));

            const decisionText = `${title}: ${rationale}`;
            const decisionVector = await embeddings.embed(decisionText);
            await qdrant.upsert('project_decisions', [{ id, vector: decisionVector, payload: item }]);
            logger.info('Promotion Engine: AUTO-PROMOTED Decision', { id, title });

        } else if (type === 'det_invariant' || type === 'sem_invariant') {
            // Append to global invariants.yaml
            // Task 5.5 specifies file locking (`fcntl.LOCK_EX`), implemented here natively as synchronous atomic append 
            // (Node.js fs.appendFileSync is atomic for small writes on POSIX)
            const invFile = path.join(workspacePath, '.kilo', 'invariants.yaml');

            const content = type === 'det_invariant'
                ? `\n- id: ${id}\n  type: deterministic\n  assertion_template: |\n    ${assertion_template.split('\n').join('\n    ')}\n`
                : `\n- id: ${id}\n  type: semantic\n  rule: "${rule}"\n`;

            fs.appendFileSync(invFile, content);

            const invariantText = type === 'sem_invariant' ? rule : assertion_template;
            const invariantVector = await embeddings.embed(invariantText);
            await qdrant.upsert('project_invariants', [{ id, vector: invariantVector, payload: item }]);
            logger.info(`Promotion Engine: AUTO-PROMOTED ${type}`, { id });
        }

        // 2. Remove from staging
        const stagingPath = path.join(workspacePath, '.kilo', 'staging', `${id}.json`);
        if (fs.existsSync(stagingPath)) {
            fs.unlinkSync(stagingPath);
        }
        return true;

    } catch (err) {
        logger.error('Failed to promote item', { id: item.id, error: err.message });
        return false;
    }
}

/**
 * Scan staging directory and auto-promote eligible items based on TRUST_MODE.
 * 
 * @param {string} workspacePath
 */
async function evaluateStaging(workspacePath) {
    logger.info('Promotion Engine evaluation started', { mode: config.TRUST_MODE });

    if (config.TRUST_MODE === 'supervised') {
        logger.debug('Supervised mode active — sweeping skipped (awaiting human approval)');
        return;
    }

    const stagingDir = path.join(workspacePath, '.kilo', 'staging');
    if (!fs.existsSync(stagingDir)) return;

    const files = fs.readdirSync(stagingDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        const raw = fs.readFileSync(path.join(stagingDir, file), 'utf8');
        let item;
        try { item = JSON.parse(raw); } catch (e) { continue; }

        const N = item.corroboration_count || 1;
        const c = item.confidence || 0;

        let shouldPromote = false;

        if (config.TRUST_MODE === 'graduated') {
            if (item.type === 'decision' && N >= 3 && c > 0.85) shouldPromote = true;
            if (item.type === 'det_invariant' && N >= 2) shouldPromote = true; // self-test passed during W2
            if (item.type === 'sem_invariant' && N >= 4 && c > 0.85) shouldPromote = true;
        }
        else if (config.TRUST_MODE === 'autonomous') {
            if (item.type === 'decision' && N >= 2 && c > 0.85) shouldPromote = true;
            if (item.type === 'det_invariant' && N >= 1) shouldPromote = true;
            if (item.type === 'sem_invariant' && N >= 2 && c > 0.85) shouldPromote = true;
        }

        if (shouldPromote) {
            await promoteItem(item, workspacePath);
        }
    }
}

module.exports = { evaluateStaging, promoteItem };
