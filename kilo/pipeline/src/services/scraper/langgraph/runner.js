'use strict';

/**
 * LangGraph-style Graph Orchestrator for Web Scraping.
 * 
 * Implements the graph execution model:
 * - Compiled Graph: Collection of nodes and edges
 * - Runner: Executes the graph with state management
 * 
 * @module services/scraper/langgraph/runner
 */

const {
    createInitialState,
    serializeState,
    deserializeState,
    fetchPageNode,
    extractCategoriesNode,
    extractProductsNode,
    checkPaginationNode,
    handleErrorNode,
    checkpointNode,
} = require('./state');

const scraperConfig = require('../config');
const logger = require('../../logger');

/**
 * Define the scraping graph structure.
 * Following LangGraph patterns: nodes + conditional edges.
 */
const SCRAPE_GRAPH = {
    nodes: {
        fetch_page: fetchPageNode,
        extract_categories: extractCategoriesNode,
        extract_products: extractProductsNode,
        check_pagination: checkPaginationNode,
        handle_error: handleErrorNode,
        checkpoint: checkpointNode,
    },

    // Entry point
    entry: 'fetch_page',

    // Edge definitions (from -> to or from -> conditional)
    edges: {
        fetch_page: {
            // After fetch, check for errors first
            on_success: ['extract_categories', 'extract_products'],
            on_error: ['handle_error'],
        },

        extract_categories: {
            // After extraction, go to pagination check
            next: 'check_pagination',
        },

        extract_products: {
            // After extraction, go to pagination check
            next: 'check_pagination',
        },

        handle_error: {
            // Error handler decides next action
            conditional: true,
        },

        check_pagination: {
            // Check if should continue or checkpoint
            on_has_next: 'checkpoint',
            on_no_next: null, // End
        },

        checkpoint: {
            // After checkpoint, go back to fetch
            next: 'fetch_page',
        },
    },
};

/**
 * LangGraph Runner class.
 * Executes the graph with state management and checkpointing.
 */
class LangGraphRunner {
    constructor(options = {}) {
        this.graph = options.graph || SCRAPE_GRAPH;
        this.crawl4ai = options.crawl4ai;
        this.checkpointStore = options.checkpointStore || null;
        this.onProgress = options.onProgress || null;
        this.onComplete = options.onComplete || null;
        this.onError = options.onError || null;

        this.config = scraperConfig.langgraph;
        this.logger = logger;
    }

    /**
     * Run the scraping graph.
     * @param {object} options - Run options
     * @returns {Promise<object>} Final state
     */
    async run(options) {
        const {
            job_id,
            target_url,
            extraction_type = 'product',
            max_pages = 100,
            anti_bot = 'magic',
        } = options;

        this.logger.info('Starting LangGraph scrape runner', { job_id, target_url });

        // Initialize state
        let state = createInitialState({
            job_id,
            target_url,
            extraction_type,
            max_pages,
            anti_bot,
            checkpoint_interval: this.config.checkpointInterval,
        });

        // Context passed to nodes
        const context = {
            crawl4ai: this.crawl4ai,
            config: scraperConfig,
            logger: this.logger,
        };

        try {
            // Main execution loop
            while (state.has_next_page && state.page_number <= state.max_pages) {
                // Emit progress
                if (this.onProgress) {
                    this.onProgress(this._formatProgress(state));
                }

                // Run the graph from entry point
                state = await this._executeGraph(state, context);

                // Handle backoff if needed
                if (state.backoff_ms) {
                    this.logger.debug('Backing off', { ms: state.backoff_ms });
                    await this._sleep(state.backoff_ms);
                    delete state.backoff_ms;
                }

                // Handle pause if needed
                if (state.pause_ms) {
                    this.logger.debug('Pausing', { ms: state.pause_ms });
                    await this._sleep(state.pause_ms);
                    delete state.pause_ms;
                }

                // Save checkpoint if needed
                if (state.should_checkpoint) {
                    await this._saveCheckpoint(job_id, state);
                }
            }

            // Job completed
            const finalState = {
                ...state,
                completed_at: new Date().toISOString(),
                status: 'completed',
            };

            this.logger.info('LangGraph scrape completed', {
                job_id,
                pages: state.visited_urls.length,
                products: state.products.length,
                categories: state.categories.length,
            });

            if (this.onComplete) {
                this.onComplete(finalState);
            }

            return finalState;

        } catch (error) {
            this.logger.error('LangGraph scrape failed', { job_id, error: error.message });

            if (this.onError) {
                this.onError(error);
            }

            throw error;
        }
    }

    /**
     * Execute the graph starting from entry point.
     * @param {object} state - Current state
     * @param {object} context - Execution context
     * @returns {Promise<object>} Updated state
     */
    async _executeGraph(state, context) {
        let currentNode = this.graph.entry;

        while (currentNode) {
            const nodeFn = this.graph.nodes[currentNode];

            if (!nodeFn) {
                this.logger.error('Unknown node', { node: currentNode });
                break;
            }

            this.logger.debug('Executing node', { node: currentNode, page: state.page_number });

            // Execute the node
            state = await nodeFn(state, context);

            // Determine next node based on edges
            currentNode = this._getNextNode(currentNode, state);
        }

        return state;
    }

    /**
     * Get next node based on edge definitions.
     * @param {string} currentNode - Current node name
     * @param {object} state - Current state
     * @returns {string|null} Next node or null to end
     */
    _getNextNode(currentNode, state) {
        const edges = this.graph.edges[currentNode];

        if (!edges) {
            return null;
        }

        // Handle conditional edges (like handle_error)
        if (edges.conditional) {
            switch (state.action) {
                case 'retry':
                    return 'fetch_page';
                case 'skip':
                    return 'check_pagination';
                case 'pause_and_continue':
                    return 'fetch_page';
                case 'continue':
                default:
                    return 'check_pagination';
            }
        }

        // Handle success/error edges (like fetch_page)
        if (state.fetch_error || state.consecutive_failures > 0) {
            return edges.on_error || 'handle_error';
        }

        // For extraction nodes, check what type we're doing
        if (currentNode === 'extract_categories' || currentNode === 'extract_products') {
            // For 'multi' type, we might need both nodes
            // But for simplicity, we use sequential
            return edges.next;
        }

        // Handle pagination edges
        if (currentNode === 'check_pagination') {
            return state.has_next_page ? edges.on_has_next : edges.on_no_next;
        }

        // Default to next
        return edges.next || edges.on_success || null;
    }

    /**
     * Save checkpoint to persistent storage.
     * @param {string} jobId - Job ID
     * @param {object} state - Current state
     */
    async _saveCheckpoint(jobId, state) {
        if (!this.checkpointStore) {
            return;
        }

        try {
            const serialized = serializeState(state);
            await this.checkpointStore.save(jobId, serialized);
            this.logger.debug('Checkpoint saved', { jobId, page: state.page_number });
        } catch (error) {
            this.logger.error('Failed to save checkpoint', { jobId, error: error.message });
        }
    }

    /**
     * Resume from a checkpoint.
     * @param {string} jobId - Job ID
     * @returns {Promise<object|null>} Resumed state or null
     */
    async resume(jobId) {
        if (!this.checkpointStore) {
            return null;
        }

        try {
            const checkpoint = await this.checkpointStore.load(jobId);
            if (checkpoint) {
                this.logger.info('Resuming from checkpoint', { jobId, page: checkpoint.page_number });
                return deserializeState(checkpoint);
            }
        } catch (error) {
            this.logger.error('Failed to load checkpoint', { jobId, error: error.message });
        }

        return null;
    }

    /**
     * Format state for progress callback.
     * @param {object} state - Current state
     * @returns {object} Formatted progress
     */
    _formatProgress(state) {
        return {
            job_id: state.job_id,
            page_number: state.page_number,
            has_next_page: state.has_next_page,
            pages_crawled: state.visited_urls.length,
            products_extracted: state.products.length,
            categories_found: state.categories.length,
            failed_pages: state.total_failures,
            current_url: state.current_url,
            consecutive_failures: state.consecutive_failures,
        };
    }

    /**
     * Sleep for specified milliseconds.
     * @param {number} ms - Milliseconds
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    LangGraphRunner,
    SCRAPE_GRAPH,
};
