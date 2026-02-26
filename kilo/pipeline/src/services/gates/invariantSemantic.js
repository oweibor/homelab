'use strict';

/**
 * Task 4.3: Gate 8B (Semantic Invariants).
 * Evaluates semantic invariants against the patch using Ollama.
 * Connects through the Ollama Circuit Breaker to ensure hardware safety.
 *
 * @module services/gates/invariantSemantic
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const metrics = require('../metrics');
const ollama = require('../ollama/client');

/**
 * Evaluate semantic invariants via LLM reasoning.
 * 
 * @param {string} taskId
 * @param {Array<object>} invariants - Invariants with type=='sem'
 * @param {string} patchDiff - Diff of changes
 * @returns {Promise<{ passed: boolean, circuitOpen: boolean, violations: string[] }>}
 */
async function evaluateSemantic(taskId, invariants, patchDiff) {
    if (!invariants || invariants.length === 0) {
        logger.debug('Gate 8B passed vacuously (no semantic invariants)');
        return { passed: true, circuitOpen: false, violations: [] };
    }

    // Pre-filter invariants relevant to the scope
    const activeInvariants = invariants;

    logger.info(`Evaluating Gate 8B (${activeInvariants.length} invariants)`, { task_id: taskId });
    const violations = [];
    let circuitTripped = false;

    for (const inv of activeInvariants) {
        const prompt = `
Given this patch diff:
${patchDiff}

And the following natural language invariant for this codebase:
"${inv.rule}"

Identify if the patch violates this invariant. Be precise.
If it violates it, explain how.
If not, just reply "NO_VIOLATION".`;

        const result = await ollama.generate(prompt, 'semantic_check');

        if (result.tripped) {
            // Task 4.3 rule: If circuit is OPEN, pass with warning (don't halt pipeline for hardware overload)
            logger.warn('Gate 8B bypassed — Ollama Circuit Open', { invariant_id: inv.id });
            circuitTripped = true;
            continue;
        }

        const { text } = result;

        if (!text.includes('NO_VIOLATION')) {
            metrics.gateFailureCount.inc({ gate: 'G8B', tier: 'T1' });
            logger.warn('Gate 8B Semantic Violation detected', { invariant_id: inv.id });
            violations.push(`Violation of "${inv.rule}": ${text}`);

            // Move invariant to quarantine as instructed in Task 4.3
            const quarantineDir = '/var/kilo/quarantine/invariants';
            fs.mkdirSync(quarantineDir, { recursive: true });
            try {
                fs.writeFileSync(
                    path.join(quarantineDir, `${inv.id || 'unknown'}_${taskId}.json`),
                    JSON.stringify({ task_id: taskId, invariant: inv, violation: text, patch: patchDiff }, null, 2)
                );
            } catch (e) {
                logger.error('Failed to write invariant to quarantine', { error: e.message });
            }
        }
    }

    if (violations.length > 0) {
        return { passed: false, circuitOpen: circuitTripped, violations };
    }

    // If no violations found or we bypassed all due to circuit, pass overall
    if (circuitTripped) {
        return { passed: true, circuitOpen: true, warnings: ['Gate 8B bypassed due to overloaded LLM circuit.'] };
    }

    logger.info('Gate 8B passed', { task_id: taskId });
    return { passed: true, circuitOpen: false, violations: [] };
}

module.exports = { evaluateSemantic };
