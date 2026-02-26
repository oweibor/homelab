'use strict';

/**
 * Sequential in-memory task queue.
 * Enforces single-concurrency execution and task_id dedup.
 *
 * @module services/queue
 */

const { EventEmitter } = require('events');
const logger = require('./logger');
const metrics = require('./metrics');

class TaskQueue extends EventEmitter {
    constructor() {
        super();
        /** @type {Map<string, object>} All tasks by ID (any state) */
        this._tasks = new Map();
        /** @type {Array<string>} Ordered queue of task IDs waiting to run */
        this._pending = [];
        /** @type {string|null} Currently executing task ID */
        this._running = null;
        /** @type {boolean} Whether the queue is processing */
        this._processing = false;
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

        logger.info('Task enqueued', { task_id, queue_size: this._pending.length });

        // Kick off processing if idle
        if (!this._processing) {
            this._processNext();
        }

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
        if (!this._processing) {
            this._processNext();
        }
        return true;
    }

    /** @returns {number} */
    get size() {
        return this._pending.length;
    }

    /** @returns {string|null} */
    get currentTaskId() {
        return this._running;
    }

    /**
     * Process the next task in the queue.
     * @private
     */
    async _processNext() {
        if (this._pending.length === 0) {
            this._processing = false;
            this._running = null;
            return;
        }

        this._processing = true;
        const taskId = this._pending.shift();
        this._running = taskId;

        const task = this._tasks.get(taskId);
        if (!task) {
            this._processNext();
            return;
        }

        task.status = 'running';
        task.started_at = new Date().toISOString();
        task.updated_at = task.started_at;

        logger.info('Task started', { task_id: taskId });
        this.emit('task:start', task);

        // The actual pipeline execution is handled by the listener
        // When done, the listener should call complete() or fail()
    }

    /**
     * Mark task as completed and move to next.
     * @param {string} taskId
     * @param {object} result
     */
    complete(taskId, result) {
        const task = this._tasks.get(taskId);
        if (task) {
            task.status = 'completed';
            task.result = result;
            task.updated_at = new Date().toISOString();
            logger.info('Task completed', { task_id: taskId });
            metrics.taskCount.inc({ status: 'completed' });
            this.emit('task:complete', task);
        }
        this._running = null;
        this._processNext();
    }

    /**
     * Mark task as failed and move to next.
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
        this._running = null;
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
        this._running = null;
        this._processNext();
    }
}

// Singleton
module.exports = new TaskQueue();
