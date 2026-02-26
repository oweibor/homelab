'use strict';

/**
 * Stage 4: Patch Validator.
 * Implements a strict 0-100 scoring system to evaluate generated code fixes before applying them.
 * Penalizes hedging language and contradictions with ADRs (project_decisions).
 *
 * @module services/recovery/patchValidator
 */

/**
 * Evaluate a patch string based on static heuristics.
 * RAG contradiction logic (-40) relies on checking the memory block.
 *
 * @param {string} patch - The LLM-generated patch text
 * @param {string} memoryContext - The retrieved memory block context
 * @returns {{ score: number, resynthesize: boolean, breakdown: object }}
 */
function validatePatch(patch, memoryContext = '') {
    let score = 0;
    const breakdown = {};

    // 1. Actionable code changes (+30)
    // Look for diff blocks or markdown code blocks
    if (patch.includes('```') || patch.includes('--- a/') || patch.includes('+++ b/')) {
        score += 30;
        breakdown.actionable = 30;
    } else {
        breakdown.actionable = 0;
    }

    // 2. Imports resolve (+20)
    // Basic heuristic: check if common import/require keywords are present and well-formed
    // This is a naive check; full resolution happens in the sandbox S7 convergence check
    if (!/(?:import [A-Za-z0-9_{}\s,]+ from|require\s*\()/.test(patch) || /import\s+from/.test(patch) === false) {
        score += 20; // If no imports are added, it's fine. If there are imports, assume they resolve for now. 
        breakdown.imports = 20;
    } else {
        // If it *looks* like an import but has hallmarks of hallucination (e.g. your-module-here)
        if (patch.includes('your-module') || patch.includes('path/to/')) {
            breakdown.imports = 0;
        } else {
            score += 20;
            breakdown.imports = 20;
        }
    }

    // 3. No hedging language (+20)
    const hedging = /(I think|maybe|might|try to|could be|It looks like|possibly)/i;
    if (!hedging.test(patch)) {
        score += 20;
        breakdown.hedging = 20;
    } else {
        breakdown.hedging = 0;
    }

    // 4. Appropriate length (+15)
    // Patches > 10 chars and < 4000 chars are considered appropriate
    if (patch.length >= 10 && patch.length <= 4000) {
        score += 15;
        breakdown.length = 15;
    } else {
        breakdown.length = 0;
    }

    // 5. No placeholder comments (+15)
    const placeholders = /(TODO|FIXME|insert code here|\/\/\/ \.\.\.)/i;
    if (!placeholders.test(patch)) {
        score += 15;
        breakdown.placeholders = 15;
    } else {
        breakdown.placeholders = 0;
    }

    // 6. ADR Contradiction (-40 penalty)
    // Example: If patch tries to add Redux, but project_decisions explicitly forbids it.
    // This requires a semantic scanner. For this pipeline iteration, we look for 
    // explicitly forbidden keywords from the memoryContext if they appear in the patch.
    let adrPenalty = 0;
    if (memoryContext && memoryContext.includes('--- PROJECT_DECISIONS')) {
        // Very naive regex to find "do not use X" in the decisions block
        const forbiddenMatch = memoryContext.match(/(?:do not use|avoid|forbidden)\s+([A-Za-z0-9_-]+)/gi);
        if (forbiddenMatch) {
            for (const phrase of forbiddenMatch) {
                const word = phrase.split(' ').pop();
                if (word && patch.includes(word)) {
                    score -= 40;
                    adrPenalty = -40;
                    break; // Apply penalty once
                }
            }
        }
    }
    breakdown.adr_contradiction = adrPenalty;

    // Final Evaluation
    const resynthesize = score < 70;

    return {
        score,
        resynthesize,
        breakdown
    };
}

module.exports = { validatePatch };
