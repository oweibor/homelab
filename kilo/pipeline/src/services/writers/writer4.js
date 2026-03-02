'use strict';

/**
 * Task 5.2: Writer 4 (Task Summary).
 * Trigger: FULLY_COMPLETED only.
 * Captures the overall summary of an executed task.
 * 
 * @module services/writers/writer4
 */

const logger = require('../logger');
const qdrant = require('../qdrant');
const embeddings = require('../embeddings');

/**
 * Write the task summary to Qdrant memory.
 * 
 * @param {object} task - The fully completed task object
 * @param {object} metadata - Additional metadata collected during execution (e.g. diffs)
 * @returns {Promise<boolean>}
 */
async function writeSummary(task, metadata = {}) {
    logger.info('Writer 4 (Summary) triggered', { task_id: task.id });

    try {
        const payload = {
            task_id: task.id,
            instruction: task.instruction,
            files_modified: metadata.files_modified || [],
            deps_introduced: metadata.deps_introduced || [],
            downstream_effects_noted: metadata.downstream_effects || '',
            duration_seconds: metadata.duration_seconds || 0,
            gate_results_summary: metadata.gate_results || 'Passed implicitly',
            timestamp: new Date().toISOString()
        };

        const summaryText = `Task Summary: ${task.instruction}\nFiles modified: ${(metadata.files_modified || []).join(', ')}`;

        const vector = await embeddings.embed(summaryText);

        // Writer 4 always auto-promotes in all modes
        await qdrant.upsert('project_history', [{ id: task.id, vector, payload }]);

        logger.debug('Writer 4 success', { task_id: task.id });
        return true;

    } catch (err) {
        logger.error('Writer 4 failed to promote summary', { task_id: task.id, error: err.message });
        return false;
    }
}

module.exports = { writeSummary };
