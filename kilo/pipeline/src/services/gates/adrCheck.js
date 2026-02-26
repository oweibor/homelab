'use strict';

/**
 * Task 4.6: Gate 9 (ADR Check).
 * Implements 3-state logic (ACTIVE, EMPTY, PHASE2) against architectural decisions.
 * Violations trigger T1 HALT.
 * 
 * @module services/gates/adrCheck
 */

const logger = require('../logger');
const metrics = require('../metrics');
const ollama = require('../ollama/client');

/**
 * Evaluate patch against project decisions (ADRs).
 * 
 * @param {string} taskId 
 * @param {Array<object>} decisions - Retrieved promoted ADRs
 * @param {boolean} isLibraryDocsLoaded - Phase 2 flag indicator
 * @param {string} patchDiff - Patch changes
 * @returns {Promise<{ passed: boolean, state: string, violations: string[] }>}
 */
async function evaluateADRs(taskId, decisions, isLibraryDocsLoaded, patchDiff) {
    // State 2: EMPTY (no ADRs exist yet)
    if (!decisions || decisions.length === 0) {
        logger.info('Gate 9 passed vacuously (State: EMPTY - no ADRs enforced)', { task_id: taskId });
        return { passed: true, state: 'EMPTY', violations: [] };
    }

    // State 3: PHASE2 (library docs absent)
    if (!isLibraryDocsLoaded) {
        logger.warn('Gate 9 passed with warning (State: PHASE2 - library docs absent)', { task_id: taskId });
        return { passed: true, state: 'PHASE2', violations: [] }; // Pass but warn
    }

    // State 1: ACTIVE
    logger.info(`Evaluating Gate 9 (${decisions.length} ADRs)`, { task_id: taskId });
    const violations = [];

    for (const adr of decisions) {
        const prompt = `
Given this patch diff:
${patchDiff}

And the following Architectural Decision Record (ADR) for this project:
Title: ${adr.title}
Decision: ${adr.rationale}

Does the patch contradict this ADR? Answer only YES or NO. If YES, briefly state why.`;

        const result = await ollama.generate(prompt, 'semantic_check');

        if (result.tripped) {
            logger.warn('Gate 9 bypassed — Ollama Circuit Open', { adr_title: adr.title });
            continue;
        }

        if (result.text.toUpperCase().includes('YES')) {
            metrics.gateFailureCount.inc({ gate: 'G9', tier: 'T1' });
            logger.warn('Gate 9 ADR Contradiction detected', { adr_title: adr.title });
            violations.push(`Contradicts ADR "${adr.title}": ${result.text}`);
        }
    }

    if (violations.length > 0) {
        return { passed: false, state: 'ACTIVE', violations };
    }

    logger.info('Gate 9 passed (State: ACTIVE)', { task_id: taskId });
    return { passed: true, state: 'ACTIVE', violations: [] };
}

module.exports = { evaluateADRs };
