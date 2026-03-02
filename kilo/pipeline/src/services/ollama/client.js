'use strict';

/**
 * Primary Ollama client for the pipeline.
 * Wraps all LLM requests with the Circuit Breaker (Task 4.4)
 * and the Hallucination Scanner (Task 4.5).
 * 
 * @module services/ollama/client
 */

const logger = require('../logger');
const config = require('../../config');
const circuitBreaker = require('./circuitBreaker');
const scanner = require('./scanner');

const OLLAMA_BASE = config.OLLAMA_HOST || 'http://ollama:11434';
const OLLAMA_URL = `${OLLAMA_BASE}/api/generate`;
// Support OLLAMA_DEFAULT_MODEL env var (from onboarding wizard), fallback to legacy MODEL_CODING
const DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL || process.env.MODEL_CODING || 'qwen2.5-coder:3b';

/**
 * Call Ollama with full safety protections.
 * 
 * @param {string} prompt - The assembled prompt
 * @param {string} callType - 'adr_extraction' | 'semantic_check'
 * @param {string} [context=''] - Project context for hallucination scanner
 * @returns {Promise<{text: string, tripped: boolean}>}
 */
async function generate(prompt, callType, context = '') {
    // 1. Check Circuit Breaker State (Task 4.4)
    if (!circuitBreaker.isCallAllowed()) {
        logger.warn('Ollama call blocked — circuit breaker is OPEN');
        return { text: '', tripped: true };
    }

    logger.debug('Ollama call initiating', { callType, model: DEFAULT_MODEL });

    try {
        // Note: native fetch is available in Node 18+
        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.1, // Strict determinism
                    num_predict: 2000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const llmText = data.response;

        // 2. Scan for Hallucinations (Task 4.5)
        // Run zero-LLM checks before accepting the generation
        const scanResult = scanner.scanResponse(llmText, callType, context);

        if (!scanResult.valid) {
            logger.error('Hallucination detected by scanner', { reason: scanResult.reason });
            // We count a hallucination as a failure for the circuit breaker
            circuitBreaker.recordFailure();
            return { text: '', tripped: true };
        }

        // Call successful and clean!
        circuitBreaker.recordSuccess();
        return { text: llmText, tripped: false };

    } catch (err) {
        logger.error('Ollama connectivity failed', { error: err.message });
        circuitBreaker.recordFailure();
        return { text: '', tripped: true };
    }
}

module.exports = { generate };
