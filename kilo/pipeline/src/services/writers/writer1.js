'use strict';

/**
 * Task 5.4: Writer 1 (Architectural Decisions).
 * Trigger: FULLY_COMPLETED only.
 * Extracts ADRs from completed tasks via Ollama. Requires confidence > 0.85.
 * Saves to staging/ for Promotion Engine.
 * 
 * @module services/writers/writer1
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');
const ollama = require('../ollama/client');

/**
 * Extract ADRs and write to staging or quarantine.
 * 
 * @param {string} taskId 
 * @param {string} workspacePath 
 * @param {string} diffText 
 * @returns {Promise<boolean>}
 */
async function extractADR(taskId, workspacePath, diffText) {
    logger.info('Writer 1 (ADR) triggered', { task_id: taskId });

    const prompt = `
Extract any core architectural decisions made in the following code patch.
Output ONLY valid JSON matching this schema:
{
  "decisions": [
    {
      "title": "String",
      "rationale": "String",
      "consequences": "String",
      "confidence_score": 0.95
    }
  ]
}
If no major decisions were made, output {"decisions": []}.

Patch:
${diffText}`;

    const result = await ollama.generate(prompt, 'adr_extraction');

    if (result.tripped) {
        logger.warn('Circuit breaker OPEN — Writer 1 (ADR) skipped entirely.', { task_id: taskId });
        // Note: The spec says "skip Writer 1 entirely, log skip". It also mentions 
        // a `writer_retry/` queue for offline evaluation when the circuit recovers logic in 6.10,
        // but the primary action is to skip.
        return false;
    }

    try {
        // Basic JSON extraction
        const jsonStr = result.text.match(/\{[\s\S]*\}/)?.[0] || '{"decisions":[]}';
        const parsed = JSON.parse(jsonStr);

        if (!parsed.decisions || parsed.decisions.length === 0) {
            logger.debug('Writer 1 found no decisions', { task_id: taskId });
            return true;
        }

        const stagingDir = path.join(workspacePath, '.kilo', 'staging');
        fs.mkdirSync(stagingDir, { recursive: true });

        for (const adr of parsed.decisions) {
            if (adr.confidence_score > 0.85) {
                const id = uuidv4();
                const payload = {
                    id,
                    type: 'decision',
                    title: adr.title,
                    rationale: adr.rationale,
                    consequences: adr.consequences,
                    status: 'proposed',
                    confidence: adr.confidence_score,
                    corroboration_count: 1, // Start at 1
                    task_id: taskId,
                    created_at: new Date().toISOString()
                };

                const filePath = path.join(stagingDir, `${id}.json`);
                fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
                logger.info('Writer 1 staged a new ADR', { id, title: adr.title });
            } else {
                logger.debug('Writer 1 rejected ADR (confidence <= 0.85)', { title: adr.title });
            }
        }

        return true;

    } catch (err) {
        logger.error('Writer 1 failed to parse ADR LLM output', { error: err.message });
        return false;
    }
}

module.exports = { extractADR };
