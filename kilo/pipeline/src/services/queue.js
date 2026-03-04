'use strict';

/**
 * Hardware-aware parallel task queue.
 * Supports configurable concurrency based on HARDWARE_PROFILE.
 * Enforces task_id dedup and manages worker pool for parallel execution.
 *
 * @module services/queue
 */

const { EventEmitter } = require('events');
const logger = require('./logger');
const metrics = require('./metrics');
const config = require('../config');

class TaskQueue extends EventEmitter {
    /**
     * @param {number} maxConcurrency - Maximum parallel tasks (from config.MAX_CONCURRENCY)
     */
    constructor(maxConcurrency = 1) {
        super();
        /** @type {number} Maximum concurrent tasks */
        this._maxConcurrency = maxConcurrency;

        /** @type {Map<string, object>} All tasks by ID (any state) */
        this._tasks = new Map();

        /** @type {Array<string>} Ordered queue of task IDs waiting to run */
        this._pending = [];

        /** @type {Map<string, object>} Currently executing tasks (taskId -> task) */
        this._running = new Map();

        logger.info('TaskQueue initialized', { maxConcurrency: this._maxConcurrency });
    }

    /**
     * Get current concurrency settings.
     * @returns {{ current: number, max: number }}
     */
    get concurrency() {
        return {
            current: this._running.size,
            max: this._maxConcurrency,
        };
    }

    /**
     * Check if queue can accept more tasks.
     * @returns {boolean}
     */
    get canAcceptMore() {
        return this._running.size < this._maxConcurrency;
    }

    /**
     * Enqueue a new task. Rejects duplicates with 409.
     * @param {object} task - Must have task_id, workspace_path, instruction
     * @returns {{ task_id: string, status: string }}
     * @throws {Error} If task_id already exists
     */
    enqueue(task) {
        const { task_id } = task;

        if (this._tasks.has(task_id)) {
            const err = new Error(`Task ${task_id} already exists`);
            err.statusCode = 409;
            throw err;
        }

        const now = new Date().toISOString();
        const entry = {
            ...task,
            status: 'queued',
            current_stage: null,
            started_at: null,
            updated_at: now,
            created_at: now,
            result: null,
        };

        this._tasks.set(task_id, entry);
        this._pending.push(task_id);

        logger.info('Task enqueued', {
            task_id,
            queue_size: this._pending.length,
            running: this._running.size,
            max: this._maxConcurrency
        });

        // Kick off processing if we have capacity
        this._processNext();

        return { task_id, status: 'queued' };
    }

    /**
     * Get task state by ID.
     * @param {string} taskId
     * @returns {object|null}
     */
    get(taskId) {
        return this._tasks.get(taskId) || null;
    }

    /**
     * Get all tasks (for debugging/monitoring).
     * @returns {Array<object>}
     */
    getAll() {
        return Array.from(this._tasks.values());
    }

    /**
     * Update task state fields.
     * @param {string} taskId
     * @param {object} updates
     */
    update(taskId, updates) {
        const task = this._tasks.get(taskId);
        if (!task) return;
        Object.assign(task, updates, { updated_at: new Date().toISOString() });
    }

    /**
     * Unblock a supervised-mode blocked task.
     * @param {string} taskId
     * @returns {boolean} true if unblocked
     */
    clearBlock(taskId) {
        const task = this._tasks.get(taskId);
        if (!task || task.status !== 'blocked') return false;

        task.status = 'queued';
        task.updated_at = new Date().toISOString();
        this._pending.unshift(taskId);

        logger.info('Task unblocked', { task_id: taskId });

        // Re-add to pending queue, processNext will handle it
        this._processNext();

        return true;
    }

    /** @returns {number} Number of pending tasks */
    get size() {
        return this._pending.length;
    }

    /** @returns {number} Number of running tasks */
    get runningCount() {
        return this._running.size;
    }

    /**
     * Returns the first running task ID (for backward compatibility).
     * Note: When multiple tasks run in parallel, only the first task ID is returned.
     * Use `runningCount` or `concurrency` for full status.
     * @returns {string|null} First running task ID or null if none
     */
    get currentTaskId() {
        const keys = this._running.keys();
        return keys.next().value || null;
    }

    /**
     * Process the next task(s) in the queue.
     * Handles parallel execution up to MAX_CONCURRENCY.
     * @private
     */
    _processNext() {
        // Process while we have pending tasks AND available worker slots
        while (this._pending.length > 0 && this._running.size < this._maxConcurrency) {
            const taskId = this._pending.shift();
            this._startTask(taskId);
        }

        // Log queue status
        if (this._pending.length === 0 && this._running.size === 0) {
            logger.debug('Queue idle', { maxConcurrency: this._maxConcurrency });
        }
    }

    /**
     * Start a single task.
     * @param {string} taskId
     * @private
     */
    _startTask(taskId) {
        const task = this._tasks.get(taskId);
        if (!task) return;

        task.status = 'running';
        task.started_at = new Date().toISOString();
        task.updated_at = task.started_at;

        this._running.set(taskId, task);

        logger.info('Task started', {
            task_id: taskId,
            running: this._running.size,
            max: this._maxConcurrency
        });

        this.emit('task:start', task);
    }

    /**
     * Mark task as completed and process next.
     * @param {string} taskId
     * @param {object} result
     */
    complete(taskId, result) {
        const task = this._tasks.get(taskId);
        if (task) {
            task.status = 'completed';
            task.result = result;
            task.updated_at = new Date().toISOString();
            logger.info('Task completed', {
                task_id: taskId,
                remaining_running: this._running.size - 1
            });
            metrics.taskCount.inc({ status: 'completed' });
            this.emit('task:complete', task);
        }

        this._running.delete(taskId);
        this._processNext();
    }

    /**
     * Mark task as failed and process next.
     * @param {string} taskId
     * @param {Error|string} error
     */
    fail(taskId, error) {
        const task = this._tasks.get(taskId);
        if (task) {
            task.status = 'failed';
            task.result = { error: error instanceof Error ? error.message : error };
            task.updated_at = new Date().toISOString();
            logger.error('Task failed', { task_id: taskId, error: task.result.error });
            metrics.taskCount.inc({ status: 'failed' });
            this.emit('task:fail', task);
        }

        this._running.delete(taskId);
        this._processNext();
    }

    /**
     * Block task (supervised mode 4× wall).
     * @param {string} taskId
     * @param {string} reason
     */
    block(taskId, reason) {
        const task = this._tasks.get(taskId);
        if (task) {
            task.status = 'blocked';
            task.result = { blocked_reason: reason };
            task.updated_at = new Date().toISOString();
            logger.warn('Task blocked', { task_id: taskId, reason });
            metrics.taskCount.inc({ status: 'blocked' });
            this.emit('task:blocked', task);
        }

        this._running.delete(taskId);
        this._processNext();
    }

    /**
     * Dynamically update max concurrency (hot reload).
     * Useful for testing or runtime adjustment.
     * @param {number} newMax - New max concurrency (capped at 12 for safety)
     */
    setMaxConcurrency(newMax) {
        // Safety cap to prevent resource exhaustion; can be overridden via config if needed
        const HARD_CAP = 12;
        const oldMax = this._maxConcurrency;
        this._maxConcurrency = Math.max(1, Math.min(newMax, HARD_CAP));

        logger.info('Concurrency updated', {
            old: oldMax,
            new: this._maxConcurrency
        });

        // Trigger processing if we now have capacity
        if (this._maxConcurrency > oldMax) {
            this._processNext();
        }
    }
}

// Create singleton with hardware-aware concurrency
const queue = new TaskQueue(config.MAX_CONCURRENCY);

module.exports = queue;
