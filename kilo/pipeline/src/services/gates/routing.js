'use strict';

/**
 * Task 4.8: T1 Failure Routing.
 * Handles T1 (HALT) gate violations based on TRUST_MODE.
 * 
 * @module services/gates/routing
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../logger');
const queue = require('../queue');

/**
 * Handle a T1 Gate Failure.
 * 
 * @param {string} taskId
 * @param {string} reason
 */
function handleT1Failure(taskId, reason) {
    const { TRUST_MODE } = config;

    logger.error('T1 HALT triggered', { task_id: taskId, reason, trust_mode: TRUST_MODE });

    if (TRUST_MODE === 'supervised') {
        // Supervised: block and await manual unblock via POST /task/clear
        queue.block(taskId, reason);
    } else {
        // Graduated / Autonomous: Auto-escalate to rearchitect
        const task = queue.get(taskId);
        if (task) {
            if (task.strategy_index === 3) {
                // If already at rearchitect and we failed again, it's a CONVERGENCE_EXIT
                logger.warn('T1 HALT during rearchitect -> CONVERGENCE_EXIT', { task_id: taskId });

                const quarantineDir = '/var/kilo/quarantine/tasks';
                fs.mkdirSync(quarantineDir, { recursive: true });
                fs.writeFileSync(path.join(quarantineDir, `${taskId}_T1_fail.json`), JSON.stringify({
                    task_id: taskId,
                    reason: `T1 HALT after rearchitect: ${reason}`
                }, null, 2));

                queue.fail(taskId, `CONVERGENCE_EXIT: ${reason}`);
            } else {
                // Escalate to rearchitect immediately
                logger.info('Auto-escalating T1 failure to rearchitect', { task_id: taskId });
                queue.update(taskId, { strategy_index: 3 });
                queue.fail(taskId, `T1 HALT auto-escalated: ${reason}`);
            }
        }
    }
}

/**
 * Handle a T2 Gate Failure (DESTROY).
 * Routes back to Error Recovery (Stage 3) safely.
 */
function handleT2Failure(taskId, reason) {
    logger.warn('T2 DESTROY triggered (routing to Error Recovery)', { task_id: taskId, reason });
    // Fails the task back into the recovery pipeline so it can be re-architected normally
    queue.fail(taskId, `T2 DESTROY: ${reason}`);
}

module.exports = { handleT1Failure, handleT2Failure };
