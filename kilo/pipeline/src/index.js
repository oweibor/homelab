'use strict';

/**
 * kilo-pipeline — OpenClaw + Kilo Code v9 orchestration service.
 *
 * Entry point. Initializes all modules, mounts Express routes,
 * starts the file watcher, and registers graceful shutdown.
 *
 * @module index
 */

const express = require('express');
const config = require('./config');
const logger = require('./services/logger');
const queue = require('./services/queue');
const embeddings = require('./services/embeddings');
const qdrantClient = require('./services/qdrant');
const sandboxClient = require('./services/sandbox');
const watcher = require('./services/watcher');
const memory = require('./services/memory');
const executor = require('./services/executor');
const metrics = require('./services/metrics');

// Phase 3 Recovery Modules
const canonicalize = require('./services/recovery/canonicalize');
const ledger = require('./services/recovery/ledger');
const classifier = require('./services/recovery/classifier');
const searchRouter = require('./services/recovery/searchRouter');
const patchValidator = require('./services/recovery/patchValidator');
const workspaceDiff = require('./services/recovery/workspaceDiff');
const compressor = require('./services/recovery/compressor');
const convergence = require('./services/recovery/convergence');

// Phase 4 Gates & Validation Modules
const staticGates = require('./services/gates/staticGates');
const invariantDet = require('./services/gates/invariantDeterministic');
const invariantSem = require('./services/gates/invariantSemantic');
const adrCheck = require('./services/gates/adrCheck');
const contextCheck = require('./services/gates/contextCheck');
const gateRouting = require('./services/gates/routing');
const snapshot = require('./services/workspace/snapshot');

// Phase 5 Writers & Engine
const writer1 = require('./services/writers/writer1');
const writer2 = require('./services/writers/writer2');
const writer3 = require('./services/writers/writer3');
const writer4 = require('./services/writers/writer4');
const writer5 = require('./services/writers/writer5');
const promotionEngine = require('./services/promotion/engine');

// Route handlers
const taskRoutes = require('./routes/task');
const statusRoutes = require('./routes/status');
const healthRoutes = require('./routes/health');
const stagingRoutes = require('./routes/staging');
const quarantineRoutes = require('./routes/quarantine');
const scrapeRoutes = require('./routes/scrape');

const app = express();

// --- Middleware ---
app.use(express.json({ limit: '1mb' }));

// Request logging
app.use((req, _res, next) => {
    if (req.path !== '/health') {
        logger.debug('Request', { method: req.method, path: req.path });
    }
    next();
});

// --- Routes ---
app.use('/', taskRoutes);
app.use('/', statusRoutes);
app.use('/', healthRoutes);
app.use('/staging', stagingRoutes);
app.use('/quarantine', quarantineRoutes);
app.use('/', scrapeRoutes);

// Prometheus Metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', metrics.register.contentType);
        // Refresh dynamic metrics before responding
        await metrics.updateQuarantineMetrics();
        // Update scraper vector count if available
        if (metrics.scraperMetrics) {
            try {
                const scraperStorage = require('./services/scraper/storage');
                const stats = await scraperStorage.getStats();
                metrics.scraperMetrics.updateVectorCount(stats.vectorsCount);
            } catch (e) {
                // Scraper not initialized yet
            }
        }
        // Get metrics from both main register and scraper register
        const mainMetrics = await metrics.register.metrics();
        const scraperMetricsOutput = metrics.scraperMetrics
            ? await metrics.scraperMetrics.register.metrics()
            : '';
        // Combine both sets of metrics
        const combined = scraperMetricsOutput
            ? mainMetrics + '\n' + scraperMetricsOutput
            : mainMetrics;
        res.end(combined);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// --- Pipeline execution listener ---
const fs = require('fs');
const path = require('path');

queue.on('task:start', async (task) => {
    const { task_id, instruction, workspace_path } = task;

    try {
        // Update task state
        queue.update(task_id, { current_stage: 'memory_retrieval' });
        persistState(task_id);

        // Stage: Memory retrieval
        logger.info('Stage: memory retrieval', { task_id });
        const memoryContext = await memory.retrieveMemory(task_id, instruction);

        // Stage: Architect
        queue.update(task_id, { current_stage: 'architect' });
        persistState(task_id);

        logger.info('Stage: architect', { task_id });
        const architectResult = await executor.runArchitect(
            task_id,
            instruction,
            memoryContext,
            workspace_path
        );

        if (architectResult.exitCode !== 0) {
            queue.update(task_id, { current_stage: 'error_recovery' });
            persistState(task_id);
            queue.fail(task_id, `Architect exited with code ${architectResult.exitCode}`);
            return;
        }

        // Stage: Orchestrate
        queue.update(task_id, { current_stage: 'orchestrate' });
        persistState(task_id);

        logger.info('Stage: orchestrate', { task_id });
        const orchResult = await executor.runOrchestrate(task_id, workspace_path);

        // Route based on exit code
        queue.update(task_id, { current_stage: orchResult.route });
        persistState(task_id);

        switch (orchResult.route) {
            case 'gates':
                logger.info('Stage: gates (Phase 4 block)', { task_id });
                try {
                    // Pre-requisite: we need to diff the workspace to see what changed (Stage 5 context)
                    // We assume sandbox exposes containerId, for MVP we mock passing it
                    const { changedFiles } = await workspaceDiff.diffWorkspace(task_id, 'sandbox_id_stub', 1);

                    // 1. Group K: Static Gates
                    const staticResult = staticGates.evaluateAll('mock_patch', changedFiles, {}, {}, null);
                    if (!staticResult.passed) {
                        gateRouting.handleT2Failure(task_id, staticResult.violations.join('; '));
                        return;
                    }

                    // 2. Group K: Deterministic Invariants (Gate 8A)
                    const detInvariants = []; // Would load from Qdrant
                    const detResult = await invariantDet.evaluateDeterministic(task_id, 'sandbox_id_stub', detInvariants, changedFiles);
                    if (!detResult.passed) {
                        gateRouting.handleT1Failure(task_id, `Gate 8A: ${detResult.violations[0]}`);
                        return;
                    }

                    // 3. Group L: Semantic Invariants (Gate 8B)
                    const semInvariants = []; // Would load from Qdrant
                    const semResult = await invariantSem.evaluateSemantic(task_id, semInvariants, 'mock_patch_diff');
                    if (!semResult.passed) {
                        gateRouting.handleT1Failure(task_id, `Gate 8B: ${semResult.violations[0]}`);
                        return;
                    }

                    // 4. Group L: ADR Check (Gate 9)
                    const adrs = []; // Load promoted from project_decisions
                    const adrResult = await adrCheck.evaluateADRs(task_id, adrs, true, 'mock_patch_diff');
                    if (!adrResult.passed) {
                        gateRouting.handleT1Failure(task_id, `Gate 9: ${adrResult.violations[0]}`);
                        return;
                    }

                    // 5. Group L: Context Consistency (Gate 10)
                    const ctxMatch = await contextCheck.checkConsistency(task_id, 'Mock Context', 'mock_patch_diff');
                    if (!ctxMatch.passed) {
                        gateRouting.handleT2Failure(task_id, `Gate 10: ${ctxMatch.breakdown}`);
                        return;
                    }

                    // All Gates Passed!
                    logger.info('Task completely unblocked and finished successfully! (Gate phase cleared)', { task_id });

                    queue.complete(task_id, { status: 'FULLY_COMPLETED' });

                    // Capture known_good/ snapshot (Task 4.9)
                    await snapshot.captureSnapshot(task_id, workspace_path);

                    // --- Phase 5: Writers & Promotion (Stage 9) ---
                    const taskObj = queue.get(task_id) || { id: task_id, instruction: 'Unknown', strategy_index: 0 };

                    // W3, W4, W5 (Non-LLM / Context Writers)
                    await writer3.writeReasoning(taskObj, 'FULLY_COMPLETED');
                    await writer4.writeSummary(taskObj, { files_modified: Object.keys(changedFiles || {}) });
                    await writer5.writeContext(workspace_path, `Task ${task_id} completed successfully modifying ${Object.keys(changedFiles || {}).length} files.`, task_id);

                    // W1 & W2 (LLM Extractors)
                    await writer1.extractADR(task_id, workspace_path, 'mock_patch_diff');
                    await writer2.extractInvariants(task_id, workspace_path, 'mock_patch_diff');

                    // Evaluate Staging / Auto-Promote (Task 5.6)
                    await promotionEngine.evaluateStaging(workspace_path);

                    // Stage 9 Ledger Entry (Task 5.10)
                    const s9Entry = {
                        error_hash: 'none',
                        task_id,
                        outcome: 'FULLY_COMPLETED',
                        dependency_versions: {},
                        ttl_days: 180,
                        staleness_flag: false,
                        gate_8a_result: { passed: detResult.passed, violations: detResult.violations || [] },
                        gate_8b_result: { passed: semResult.passed, violations: semResult.violations || [] },
                        deterministic_violations: detResult.violations || [],
                        semantic_violations: semResult.violations || [],
                        gate_severity_results: { G1: true, G2: true, G3: true, G4: true, G5: true, G6: true, G7: true, G8A: detResult.passed, G8B: semResult.passed, G9: adrResult.passed, G10: ctxMatch.passed },
                        written_at: new Date().toISOString()
                    };
                    const fsS9 = require('fs');
                    fsS9.mkdirSync('/var/kilo/failure_ledger', { recursive: true });
                    fsS9.writeFileSync(`/var/kilo/failure_ledger/stage9_${task_id}.json`, JSON.stringify(s9Entry, null, 2));

                } catch (gateErr) {
                    logger.error('Gate evaluation pipeline crashed', { task_id, error: gateErr.message });
                    queue.fail(task_id, 'Gate execution failed: ' + gateErr.message);
                }
                break;

            case 'error_recovery':
                logger.info('Stage: error_recovery', { task_id });
                try {
                    // Extract error context (mocked for now, in reality parsed from orchestrator logs)
                    // We assume orchResult.stderr has the error
                    const errObj = { type: 'RuntimeError', message: orchResult.stderr.substring(0, 200), stack: orchResult.stderr };

                    // Stage 1: Canonicalize
                    const canonicalError = canonicalize.canonicalize(errObj);
                    logger.debug('Error canonicalized', { hash: canonicalError.hash });

                    // Stage 2: Ledger & 4x Wall
                    const ledgerEntry = ledger.getLedgerEntry(canonicalError.hash, canonicalError);
                    ledger.saveLedgerEntry(ledgerEntry);

                    if (ledger.evaluateWall(task_id, ledgerEntry)) {
                        // Task blocked or quarantined
                        return;
                    }

                    // Stage 3: Classify & Route
                    const errorClass = classifier.classify(canonicalError);
                    if (errorClass === 'COMPLEX') {
                        const searchResult = await searchRouter.routeSearch(canonicalError);
                        logger.debug('Search strategy selected', { strategy: searchResult.strategy });
                    }

                    // For now, we update task state to indicate we are looping back or waiting
                    // A real implementation would loop back to orchestrator or architect here
                    queue.fail(task_id, `Error recovery pipeline initiated for ${canonicalError.hash}`);
                } catch (recErr) {
                    logger.error('Error in recovery pipeline', { error: recErr.message });
                    queue.fail(task_id, 'Recovery pipeline crashed');
                }
                break;

            case 'convergence': {
                logger.info('Stage: convergence', { task_id });
                // Stage 7: Convergence check
                const taskRef = queue.get(task_id);
                const strategyIndex = taskRef.strategy_index || 0;

                const ladderResult = convergence.checkConvergence(task_id, strategyIndex);

                if (ladderResult.halted) {
                    return; // Task blocked or quarantined
                }

                // Advance ladder
                queue.update(task_id, { strategy_index: ladderResult.nextIndex });
                persistState(task_id);

                logger.info('Ladder advanced, pipeline continuing', { next_strategy: ladderResult.action });
                queue.fail(task_id, `Convergence continuing with strategy ${ladderResult.action}`);
                break;
            }

            default:
                queue.fail(task_id, `Unknown route: ${orchResult.route}`);
        }
    } catch (err) {
        logger.error('Pipeline execution error', { task_id, error: err.message });
        queue.fail(task_id, err);
    }
});

/**
 * Persist task state to checkpoint dir.
 * @param {string} taskId
 */
function persistState(taskId) {
    const task = queue.get(taskId);
    if (!task) return;
    const statePath = path.join(config.CHECKPOINT_DIR, taskId, 'state.json');
    try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(task, null, 2));
    } catch (err) {
        logger.error('Failed to persist state', { task_id: taskId, error: err.message });
    }
}

// --- Startup ---
async function main() {
    logger.info('kilo-pipeline starting', {
        version: '0.1.0',
        trust_mode: config.TRUST_MODE,
        port: config.PORT,
    });

    // Initialize services
    try {
        logger.info('Initializing Qdrant client...');
        qdrantClient.initialize();

        logger.info('Initializing Docker sandbox client...');
        sandboxClient.initialize();

        logger.info('Initializing MiniLM embedding model...');
        await embeddings.initialize();
        logger.info('Embedding model ready');
    } catch (err) {
        logger.error('Service initialization failed', { error: err.message });
        logger.warn('Pipeline starting in degraded mode — some features may not work');
    }

    // Start file watcher
    try {
        watcher.start();
    } catch (err) {
        logger.error('File watcher failed to start', { error: err.message });
    }

    // Start HTTP server
    const server = app.listen(config.PORT, () => {
        logger.info(`kilo-pipeline listening on :${config.PORT}`, {
            health: `http://localhost:${config.PORT}/health`,
        });
    });

    // --- Graceful shutdown ---
    const shutdown = async (signal) => {
        logger.info(`${signal} received — shutting down gracefully`);

        watcher.stop();

        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(0);
        });

        // Force kill after 10s
        setTimeout(() => {
            logger.error('Graceful shutdown timed out — forcing exit');
            process.exit(1);
        }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    logger.error('Fatal startup error', { error: err.message });
    process.exit(1);
});
