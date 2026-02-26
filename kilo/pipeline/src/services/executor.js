'use strict';

/**
 * Kilo CLI execution wrappers.
 * Runs `kilo architect` and `kilo orchestrate` inside Docker sandboxes.
 *
 * @module services/executor
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const sandbox = require('./sandbox');
const logger = require('./logger');

/**
 * Run `kilo architect` — generates an architecture plan from the instruction.
 *
 * @param {string} taskId
 * @param {string} instruction
 * @param {string} memoryContext - Memory context block
 * @param {string} workspacePath
 * @returns {Promise<{plan: string, exitCode: number}>}
 */
async function runArchitect(taskId, instruction, memoryContext, workspacePath) {
    const checkpointDir = path.join(config.CHECKPOINT_DIR, taskId);

    logger.info('Running kilo architect', { task_id: taskId });

    // Spawn sandbox
    const { containerId } = await sandbox.spawnSandbox(
        taskId,
        workspacePath,
        instruction,
        memoryContext
    );

    try {
        // Install kilo CLI inside sandbox
        const installResult = await sandbox.execInSandbox(containerId, [
            'sh', '-c',
            'npm install -g @kilocode/cli 2>&1 || echo "KILO_INSTALL_FAILED"',
        ]);

        if (installResult.stdout.includes('KILO_INSTALL_FAILED')) {
            logger.error('kilo CLI install failed', {
                task_id: taskId,
                stderr: installResult.stderr,
            });
        }

        // Run kilo architect
        const result = await sandbox.execInSandbox(containerId, [
            'sh', '-c',
            `kilo architect \
        --instruction '${instruction.replace(/'/g, "\\'")}' \
        --context-file /checkpoint/memory_context.md \
        --output /checkpoint/architecture_plan.md 2>&1`,
        ]);

        // Save stdout/stderr to logs
        const logPath = path.join(checkpointDir, 'architect.log');
        fs.writeFileSync(logPath, `EXIT CODE: ${result.exitCode}\n\nSTDOUT:\n${result.stdout}\n\nSTDERR:\n${result.stderr}`);

        // Read architecture plan if it was generated
        let plan = '';
        const planPath = path.join(checkpointDir, 'architecture_plan.md');
        if (fs.existsSync(planPath)) {
            plan = fs.readFileSync(planPath, 'utf8');
        }

        logger.info('kilo architect completed', {
            task_id: taskId,
            exit_code: result.exitCode,
            plan_length: plan.length,
        });

        return { plan, exitCode: result.exitCode };
    } finally {
        await sandbox.cleanupSandbox(containerId);
    }
}

/**
 * Run `kilo orchestrate` — executes the plan against the workspace.
 * Routes based on exit code:
 *   0 → gates (Stage 8)
 *   1 → error recovery (Stage 1 — canonicalization)
 *   2 → convergence (Stage 7)
 *
 * @param {string} taskId
 * @param {string} workspacePath
 * @returns {Promise<{exitCode: number, route: string, stdout: string, stderr: string}>}
 */
async function runOrchestrate(taskId, workspacePath) {
    const checkpointDir = path.join(config.CHECKPOINT_DIR, taskId);
    const planPath = path.join(checkpointDir, 'architecture_plan.md');

    if (!fs.existsSync(planPath)) {
        throw new Error(`architecture_plan.md not found for task ${taskId}`);
    }

    logger.info('Running kilo orchestrate', { task_id: taskId });

    // Spawn sandbox with the workspace
    const memoryContext = ''; // Already embedded in the plan
    const { containerId } = await sandbox.spawnSandbox(
        taskId,
        workspacePath,
        'orchestrate',
        memoryContext
    );

    try {
        // Install kilo CLI
        await sandbox.execInSandbox(containerId, [
            'sh', '-c',
            'npm install -g @kilocode/cli 2>&1 || true',
        ]);

        // Run kilo orchestrate
        const result = await sandbox.execInSandbox(containerId, [
            'sh', '-c',
            `kilo orchestrate \
        --plan /checkpoint/architecture_plan.md \
        --workspace /workspace 2>&1; echo "EXIT_CODE:$?"`,
        ]);

        // Parse actual exit code from output (exec doesn't always propagate)
        let exitCode = result.exitCode;
        const exitMatch = result.stdout.match(/EXIT_CODE:(\d+)/);
        if (exitMatch) {
            exitCode = parseInt(exitMatch[1], 10);
        }

        // Route based on exit code
        let route;
        switch (exitCode) {
            case 0:
                route = 'gates'; // Stage 8 — semantic guard
                break;
            case 1:
                route = 'error_recovery'; // Stage 1 — canonicalization
                break;
            case 2:
                route = 'convergence'; // Stage 7 — convergence check
                break;
            default:
                route = 'error_recovery'; // Unknown → treat as error
                break;
        }

        // Save logs
        const logPath = path.join(checkpointDir, 'orchestrator.log');
        fs.writeFileSync(logPath, [
            `EXIT CODE: ${exitCode}`,
            `ROUTE: ${route}`,
            '',
            'STDOUT:',
            result.stdout,
            '',
            'STDERR:',
            result.stderr,
        ].join('\n'));

        logger.info('kilo orchestrate completed', {
            task_id: taskId,
            exit_code: exitCode,
            route,
        });

        return { exitCode, route, stdout: result.stdout, stderr: result.stderr };
    } finally {
        await sandbox.cleanupSandbox(containerId);
    }
}

module.exports = { runArchitect, runOrchestrate };
