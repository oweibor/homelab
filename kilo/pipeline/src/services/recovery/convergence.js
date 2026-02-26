'use strict';

/**
 * Stage 7: Convergence Check.
 * Manages the 4-step retry ladder upon task failure.
 * Routes to quarantine or blocks task when ladder is exhausted.
 *
 * @module services/recovery/convergence
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../logger');
const queue = require('../queue');

const LADDER = [
    'debug_local', // Step 0: Retry with current context
    'debug_RAG',   // Step 1: Add RAG results
    'debug_web',   // Step 2: Add Web search results
    'rearchitect'  // Step 3: Throw away the plan, start from architect again
];

/**
 * Evaluate the convergence ladder and return the next action.
 * If ladder is exhausted (>= 4), triggers CONVERGENCE_EXIT routing.
 *
 * @param {string} taskId
 * @param {number} strategyIndex - Current step in the ladder (0-3)
 * @returns {{ action: string, nextIndex: number, halted: boolean }}
 */
function checkConvergence(taskId, strategyIndex) {
    logger.info('Checking convergence ladder', { task_id: taskId, strategy_index: strategyIndex });

    // If we haven't exhausted the ladder, move to the next strategy
    if (strategyIndex < LADDER.length) {
        const nextStrategy = LADDER[strategyIndex];
        logger.info(`Advancing ladder to ${nextStrategy}`, { task_id: taskId });
        return {
            action: nextStrategy,
            nextIndex: strategyIndex + 1,
            halted: false
        };
    }

    // Ladder exhausted -> CONVERGENCE_EXIT
    const { TRUST_MODE } = config;
    const reason = `Task exhausted convergence ladder (4 failures).`;

    logger.warn('CONVERGENCE_EXIT triggered', { task_id: taskId, trust_mode: TRUST_MODE });

    if (TRUST_MODE === 'supervised') {
        // Supervised: block and ask for human guidance
        queue.block(taskId, reason);
        return {
            action: 'CONVERGENCE_EXIT',
            nextIndex: strategyIndex,
            halted: true
        };
    } else {
        // Graduated / Autonomous: quarantine and fail
        const quarantineDir = '/var/kilo/quarantine/tasks';
        const filePath = path.join(quarantineDir, `${taskId}.json`);

        try {
            fs.mkdirSync(quarantineDir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify({
                task_id: taskId,
                reason,
                timestamp: new Date().toISOString(),
                final_strategy_index: strategyIndex
            }, null, 2));
        } catch (err) {
            logger.error('Failed to write quarantine file', { task_id: taskId, error: err.message });
        }

        queue.fail(taskId, reason);
        return {
            action: 'CONVERGENCE_EXIT',
            nextIndex: strategyIndex,
            halted: true
        };
    }
}

module.exports = { checkConvergence, LADDER };
