'use strict';

/**
 * Task 4.9: Workspace Snapshot Capture.
 * Archives the current workspace state to /var/kilo/known_good/
 * after a FULLY_COMPLETED task. Used for deterministic invariant self-tests.
 * 
 * @module services/workspace/snapshot
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const logger = require('../logger');

const execAsync = util.promisify(exec);

/**
 * Create a tar archive of the current workspace representing a "known good" state.
 * 
 * @param {string} taskId 
 * @param {string} workspacePath - Path to the project workspace
 * @returns {Promise<boolean>}
 */
async function captureSnapshot(taskId, workspacePath) {
    try {
        // Generate a hash suffix based on the workspace path to avoid collisions
        const hash = Buffer.from(workspacePath).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
        const snapshotDir = `/var/kilo/known_good/${hash}`;

        fs.mkdirSync(snapshotDir, { recursive: true });

        logger.info('Capturing known_good/ snapshot', { task_id: taskId, workspace: workspacePath });

        // 1. Create a git archive of the current tracked files
        const archivePath = path.join(snapshotDir, 'snapshot.tar.gz');
        await execAsync(`git archive --format=tar.gz -o ${archivePath} HEAD`, { cwd: workspacePath });

        // 2. Capture a dependencies manifest (package.json + versions) 
        // This allows diffing library updates without traversing node_modules
        if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
            const pkg = require(path.join(workspacePath, 'package.json'));
            const manifestPath = path.join(snapshotDir, 'deps_manifest.json');

            fs.writeFileSync(manifestPath, JSON.stringify({
                dependencies: pkg.dependencies || {},
                devDependencies: pkg.devDependencies || {},
                timestamp: new Date().toISOString()
            }, null, 2));
        }

        logger.debug('Snapshot captured successfully', { archive: archivePath });
        return true;

    } catch (err) {
        logger.error('Failed to capture workspace snapshot', { task_id: taskId, error: err.message });
        return false;
    }
}

module.exports = { captureSnapshot };
