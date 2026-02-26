'use strict';

/**
 * Task 4.5: Rule-Based Hallucination Scanner.
 * Wrapper that analyzes Ollama responses BEFORE they reach the pipeline.
 * Zero LLM calls are used in this scanner.
 * 
 * @module services/ollama/scanner
 */

const logger = require('../logger');

// Known hallucination or refusal traits common in 3B models
const HALLUCINATION_PHRASES = [
    /i cannot/i,
    /as an ai/i,
    /i don't have access/i,
    /i am unable to/i,
    /i am just an ai/i,
    /please provide more/i,
    /i misunderstood/i
];

/**
 * Scan an LLM response for rules violations.
 * 
 * @param {string} llmText - Raw text from Ollama
 * @param {string} callType - 'adr_extraction' | 'semantic_check' | 'summarize'
 * @param {string} projectContext - Context block (used for API cross-check)
 * @returns {{ valid: boolean, reason: string|null }}
 */
function scanResponse(llmText, callType, projectContext = '') {
    if (!llmText || typeof llmText !== 'string') {
        return { valid: false, reason: 'Empty or invalid response type' };
    }

    const text = llmText.trim();

    // 1. Length bounds check based on purpose
    if (callType === 'adr_extraction') {
        // ADRs should be substantial but not massive novels
        if (text.length < 100) return { valid: false, reason: 'Response too short for ADR (<100)' };
        if (text.length > 2000) return { valid: false, reason: 'Response too long for ADR (>2000)' };
    } else if (callType === 'semantic_check') {
        // Semantic validation should be concise
        if (text.length < 10) return { valid: false, reason: 'Response too short for semantic check (<10)' };
        if (text.length > 500) return { valid: false, reason: 'Response too long for semantic check (>500)' };
    }

    // 2. Phrase matching for generic refusals/hallucinations
    for (const regex of HALLUCINATION_PHRASES) {
        if (regex.test(text)) {
            logger.warn('Hallucination scanner caught refusal phrase', { phrase: regex.toString() });
            return { valid: false, reason: `Matches refusal pattern: ${regex.toString()}` };
        }
    }

    // 3. Very basic API/Module hallucination check (if context is provided)
    // If the LLM returns code blocks suggesting imports, roughly verify they exist in projectContext
    // We look for 'import X' or 'require(X)' in the generated text
    const importMatches = text.match(/(?:import\s+.*?\s+from\s+|require\s*\(\s*)['"]([^./][^'"]+)['"]/g);

    if (importMatches && projectContext) {
        const contextLower = projectContext.toLowerCase();

        for (const matchStr of importMatches) {
            // Extract just the package name
            const pkgMatch = matchStr.match(/['"]([^'"]+)['"]/);
            if (pkgMatch && pkgMatch[1]) {
                const pkg = pkgMatch[1].toLowerCase();

                // Exclude Node built-ins
                const builtins = ['fs', 'path', 'crypto', 'child_process', 'os', 'http', 'https', 'events'];
                if (builtins.includes(pkg)) continue;

                // If the suggested package doesn't appear ANYWHERE in the project context (which 
                // includes package.json dependencies typically), flag it as a hallucination.
                if (!contextLower.includes(pkg)) {
                    logger.warn('Hallucination scanner caught unknown package', { package: pkg });
                    return { valid: false, reason: `Unknown package hallucinated: ${pkg}` };
                }
            }
        }
    }

    return { valid: true, reason: null };
}

module.exports = { scanResponse, HALLUCINATION_PHRASES };
