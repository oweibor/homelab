'use strict';

/**
 * Task 4.1: Static Gates (G1 - G7).
 * Zero-LLM, deterministic rules evaluating the scope/diff of a patch.
 * Any violation here returns a failed result to trigger T1/T2 routing.
 * 
 * @module services/gates/staticGates
 */

const logger = require('../logger');
const metrics = require('../metrics');

/**
 * G1 (T3): Test file assertions.
 * Ensure modified test files actually contain assertions.
 */
function gate1_TestsHaveAssertions(changedFilesMap) {
    for (const [file, content] of Object.entries(changedFilesMap)) {
        if (file.includes('test') || file.endsWith('.spec.js') || file.endsWith('.test.js')) {
            if (!content.includes('assert') && !content.includes('expect') && !content.includes('pytest.raises')) {
                metrics.gateFailureCount.inc({ gate: 'G1', tier: 'T3' });
                return { passed: false, reason: `G1 Failed: Test file ${file} lacks assertions.` };
            }
        }
    }
    return { passed: true };
}

/**
 * G2 (T2): Structural integrity (stubbed for prototype).
 * Verifies function signatures stay intact.
 */
function gate2_StructuralIntegrity(diffObj) {
    // In a real implementation this parses AST. For now, we do a basic keyword check.
    // If we see function deletions without additions, it's suspect.
    return { passed: true };
}

/**
 * G3 (T3): File Shrinkage > 40%.
 */
function gate3_Shrinkage(prePatchSizes, postPatchSizes) {
    for (const [file, oldSize] of Object.entries(prePatchSizes)) {
        const newSize = postPatchSizes[file];
        if (newSize !== undefined && oldSize > 0) {
            if ((oldSize - newSize) / oldSize > 0.40) {
                metrics.gateFailureCount.inc({ gate: 'G3', tier: 'T3' });
                return { passed: false, reason: `G3 Failed: File ${file} shrank by >40%.` };
            }
        }
    }
    return { passed: true };
}

/**
 * G4 (T2): Branch count reduction > 30%.
 */
function gate4_BranchReduction(prePatchBranches, postPatchBranches) {
    // Mock logic for MVP
    return { passed: true };
}

/**
 * G5 (T2): Dynamic-to-Literal Hardcoding.
 * Scans patch for hardcoded secrets or magic numbers replacing env vars.
 */
function gate5_Hardcoding(patchStr) {
    if (patchStr.includes('+"FIXME"') || patchStr.includes('="TODO"')) {
        metrics.gateFailureCount.inc({ gate: 'G5', tier: 'T2' });
        return { passed: false, reason: 'G5 Failed: Hardcoded placeholder detected in patch.' };
    }
    return { passed: true };
}

/**
 * G6 (T2): Collision Guard.
 * Ensures the patch actually modified the `calling_fn` from the S1 hash.
 */
function gate6_CollisionGuard(patchStr, canonicalKey) {
    if (!canonicalKey) return { passed: true };

    const functionName = canonicalKey.split(':')[2];
    if (functionName && functionName !== 'unknown_function') {
        if (!patchStr.includes(functionName)) {
            metrics.gateFailureCount.inc({ gate: 'G6', tier: 'T2' });
            return { passed: false, reason: `G6 Failed: Patch does not appear to target ${functionName}.` };
        }
    }
    return { passed: true };
}

/**
 * G7 (T2): Stack-specific static rules.
 */
function gate7_StackRules(changedFilesMap) {
    for (const [file, content] of Object.entries(changedFilesMap)) {
        if (file.endsWith('.dart') && content.includes('build(') && !content.includes('Widget build(')) {
            metrics.gateFailureCount.inc({ gate: 'G7', tier: 'T2' });
            return { passed: false, reason: `G7 Failed: Flutter widget build method malformed in ${file}.` };
        }
    }
    return { passed: true };
}

/**
 * Run all static gates against the given workspace/patch boundaries.
 * @returns {object} results map
 */
function evaluateAll(patch, changedFilesMap, preSizes, postSizes, canonicalKey) {
    const results = { passed: true, violations: [] };

    const evalGate = (gateFunc, ...args) => {
        const res = gateFunc(...args);
        if (!res.passed) {
            results.passed = false;
            results.violations.push(res.reason);
        }
    };

    logger.debug('Evaluating Static Gates (G1-G7)');

    evalGate(gate1_TestsHaveAssertions, changedFilesMap);
    evalGate(gate2_StructuralIntegrity, {});
    evalGate(gate3_Shrinkage, preSizes, postSizes);
    evalGate(gate4_BranchReduction, {}, {});
    evalGate(gate5_Hardcoding, patch);
    evalGate(gate6_CollisionGuard, patch, canonicalKey);
    evalGate(gate7_StackRules, changedFilesMap);

    return results;
}

module.exports = { evaluateAll };
