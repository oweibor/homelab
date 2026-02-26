'use strict';

/**
 * Task 5.1: Writer 3 (Task Reasoning).
 * Trigger: FULLY_COMPLETED or CONVERGENCE_EXIT.
 * Upserts task reasoning and outcomes to the project_reasoning collection.
 * 
 * @module services/writers/writer3
 */

const logger = require('../logger');
const qdrant = require('../qdrant');

/**
 * Write task reasoning to Qdrant memory.
 * 
 * @param {object} task - The completed or converged task object from queue
 * @param {string} outcome - 'FULLY_COMPLETED' | 'CONVERGENCE_EXIT'
 * @returns {Promise<boolean>}
 */
async function writeReasoning(task, outcome) {
    logger.info('Writer 3 (Reasoning) triggered', { task_id: task.id, outcome });

    try {
        // Determine confidence based on outcome
        let confidence = outcome === 'FULLY_COMPLETED' ? 0.95 : 0.50;

        // Apply the -0.10 penalty for convergence exit natively as specified
        if (outcome === 'CONVERGENCE_EXIT') {
            confidence = Math.max(0, confidence - 0.10);
        }

        const payload = {
            task_id: task.id,
            instruction: task.instruction,
            outcome: outcome,
            confidence: confidence,
            strategy_depth: task.strategy_index || 0,
            timestamp: new Date().toISOString()
        };

        // The text to embed for semantic retrieval
        const reasoningText = `Task: ${task.instruction}\nOutcome: ${outcome}\nDepth: ${task.strategy_index || 0}`;

        // Auto-promote directly to Qdrant (W3 always auto-promotes)
        await qdrant.upsert('project_reasoning', task.id, reasoningText, payload);

        logger.debug('Writer 3 success', { task_id: task.id });
        return true;

    } catch (err) {
        logger.error('Writer 3 failed to promote reasoning', { task_id: task.id, error: err.message });
        return false;
    }
}

module.exports = { writeReasoning };
