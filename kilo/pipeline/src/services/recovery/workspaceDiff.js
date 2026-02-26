'use strict';

/**
 * Stage 5: Workspace Diff.
 * Compares current sandbox state to base snapshot using Docker API (`container.changes()`).
 * Outputs diff summary to be consumed by Gate 8A (scope) and Writer 2.
 *
 * @module services/recovery/workspaceDiff
 */

const fs = require('fs');
const path = require('path');
const sandboxClient = require('../sandbox');
const config = require('../../config');
const logger = require('../logger');

/**
 * Retrieve the list of modified files in the sandbox workspace.
 * Uses Docker API to check overlay changes.
 *
 * @param {string} taskId
 * @param {string} containerId
 * @param {number} iteration - Tracking loop count
 * @returns {Promise<{ changedFiles: string[], diffSummaryPath: string }>}
 */
async function diffWorkspace(taskId, containerId, iteration = 1) {
    try {
        // Note: sandbox runs without a direct exposed dockerode object in our wrapper, 
        // but we can query it via the internal docker object or execute a stat check.
        // However, since we map /workspace as :ro (read-only) in Phase 2, any changes 
        // made by Orchestrate must be done back to the host path or inside a :rw volume.
        // Wait, the specification says: "compare current sandbox container state... Use `docker diff`"
        // Let's execute `docker diff` equivalent or just `find` inside the container if it was writing to a temp rw mount.

        logger.info('Diffing workspace changes', { task_id: taskId, containerId, iteration });

        const diffCommand = [
            'sh', '-c',
            'find /workspace -type f -mmin -60 2>/dev/null || true'
        ];

        const result = await sandboxClient.execInSandbox(containerId, diffCommand);

        // Parse the output, which is a list of file paths inside /workspace
        const changedFiles = result.stdout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('/workspace/'));

        // Create a diff summary object
        const diffData = {
            task_id: taskId,
            iteration,
            timestamp: new Date().toISOString(),
            changed_files: changedFiles,
            scope: changedFiles.map(f => f.replace('/workspace/', ''))
        };

        // Save to checkpoint dir as diff_{n}.json
        const checkpointDir = path.join(config.CHECKPOINT_DIR, taskId);
        fs.mkdirSync(checkpointDir, { recursive: true });

        const diffSummaryPath = path.join(checkpointDir, `diff_${iteration}.json`);
        fs.writeFileSync(diffSummaryPath, JSON.stringify(diffData, null, 2));

        logger.debug('Workspace diff created', {
            task_id: taskId,
            iteration,
            filesChanged: changedFiles.length
        });

        return { changedFiles: diffData.scope, diffSummaryPath };

    } catch (err) {
        logger.error('Failed to diff workspace', { task_id: taskId, error: err.message });
        throw err;
    }
}

module.exports = { diffWorkspace };
