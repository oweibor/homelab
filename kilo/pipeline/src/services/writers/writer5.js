'use strict';

/**
 * Task 5.3: Writer 5 (Project Context).
 * Trigger: Any completion.
 * Appends new facts to context.md. Implements 4000 token limit with
 * safe Ollama summarization fallback using the circuit breaker.
 * 
 * @module services/writers/writer5
 */

const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const ollama = require('../ollama/client');
const qdrant = require('../qdrant');
const embeddings = require('../embeddings');

/**
 * Write to the project context and ensure it stays within limits.
 * 
 * @param {string} workspacePath - Path to the git workspace
 * @param {string} newFact - A newly discovered fact from the task
 * @param {string} taskId
 * @returns {Promise<boolean>}
 */
async function writeContext(workspacePath, newFact, taskId) {
    logger.info('Writer 5 (Context) triggered', { task_id: taskId });

    try {
        const contextPath = path.join(workspacePath, '.kilo', 'context.md');

        // Ensure .kilo directory exists
        fs.mkdirSync(path.dirname(contextPath), { recursive: true });

        let currentContext = '';
        if (fs.existsSync(contextPath)) {
            currentContext = fs.readFileSync(contextPath, 'utf8');
        }

        // Append new fact (monotonic growth)
        let updatedContext = currentContext + `\n- [${new Date().toISOString()}] ${newFact}`;

        // Naive token estimation (1 token ~= 4 chars)
        const estimatedTokens = updatedContext.length / 4;

        if (estimatedTokens > 4000) {
            logger.info('Context > 4000 tokens. Attempting summarization via Ollama', { task_id: taskId });

            const lines = updatedContext.split('\n').filter(l => l.trim().length > 0);
            const midpoint = Math.floor(lines.length / 2);

            const oldestHalf = lines.slice(0, midpoint).join('\n');
            const newestHalf = lines.slice(midpoint).join('\n');

            const prompt = `Condense the following historical project facts into a brief, dense summary without losing critical architectural points:\n\n${oldestHalf}`;

            const result = await ollama.generate(prompt, 'summarize');

            if (result.tripped) {
                // Task 5.3 constraint: Skip summary if circuit is open, keep existing uncompressed.
                logger.warn('Circuit breaker OPEN — skipping context summarization (hardware safety)');
            } else if (result.text && result.text.length > 50) {
                // Successfully summarized oldest half
                updatedContext = `## Historical Summary\n${result.text}\n\n## Recent Facts\n${newestHalf}`;
                logger.debug('Context successfully summarized');
            }
        }

        // Write back to disk
        fs.writeFileSync(contextPath, updatedContext);

        // Generate embedding vector
        const vector = await embeddings.embed(updatedContext);

        // Auto-promote to Qdrant memory collection (full text replacement logic)
        await qdrant.upsert('project_context', [{
            id: 'global_context', vector, payload: {
                type: 'context',
                updated_at: new Date().toISOString()
            }
        }]);

        return true;

    } catch (err) {
        logger.error('Writer 5 failed to update context', { error: err.message });
        return false;
    }
}

module.exports = { writeContext };
