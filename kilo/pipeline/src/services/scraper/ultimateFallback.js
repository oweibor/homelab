/**
 * Ultimate Fallback Manager - Chains All Anti-Detection Methods
 * 
 * Provides a unified fallback chain:
 * 1. Direct connection (baseline)
 * 2. Browser fingerprint randomization
 * 3. IPv6 connection
 * 4. Tor network
 * 5. I2P network
 * 6. WiFi/Tether rotation
 * 7. Ultimate last resort
 * 
 * Each method is tried in order until one succeeds.
 * 
 * Hardware-aware: Automatically adjusts based on HARDWARE_PROFILE
 * - Low-end (N100, Celeron): Limited Tor/I2P, fewer retries
 * - Mid-range (i3, AMD): Full features with moderate retries
 * - High-end (i7, Nvidia): All features, aggressive retries
 * 
 * @module services/scraper/ultimateFallback
 */

const EventEmitter = require('events');
const logger = require('../logger');
const scraperConfig = require('./config');

// Lazy singleton instance
let _instance = null;

/**
 * Get or create the UltimateFallback singleton.
 * Uses lazy initialization to avoid reading process.env at require time.
 * @returns {UltimateFallback} The singleton instance
 */
function getInstance() {
    if (!_instance) {
        const antiDetection = scraperConfig.antiDetection;
        _instance = new UltimateFallback({
            enableIPv6: antiDetection.ipv6.enabled,
            enableTor: antiDetection.tor.enabled,
            enableI2P: antiDetection.i2p.enabled,
            enableWiFi: antiDetection.wifiRotation.enabled,
            maxRetries: antiDetection.fallback.maxRetries,
        });
    }
    return _instance;
}

// Import managers (will be initialized in constructor)
let fingerprintManager = null;
let ipv6Manager = null;
let hybridNetworkManager = null;
let wifiRotationManager = null;

class UltimateFallback extends EventEmitter {
    constructor(options = {}) {
        super();

        // Get hardware-aware settings from config
        const antiDetection = scraperConfig.antiDetection;
        const profile = antiDetection.hardwareProfile;

        this.options = {
            maxRetries: options.maxRetries || antiDetection.fallback.maxRetries,
            retryDelay: options.retryDelay || antiDetection.fallback.retryDelay,
            enableIPv6: options.enableIPv6 !== undefined ? options.enableIPv6 : antiDetection.ipv6.enabled,
            enableTor: options.enableTor !== undefined ? options.enableTor : antiDetection.tor.enabled,
            enableI2P: options.enableI2P !== undefined ? options.enableI2P : antiDetection.i2p.enabled,
            enableWiFi: options.enableWiFi !== undefined ? options.enableWiFi : antiDetection.wifiRotation.enabled,
            useHeavyMethods: options.useHeavyMethods !== undefined ? options.useHeavyMethods : antiDetection.fallback.useHeavyMethods,
            ...options,
        };

        // State
        this.currentMethod = 'direct';
        this.attemptHistory = [];
        this.isActive = false;
        this.hardwareProfile = profile;

        // Initialize managers BEFORE building chain (managers must be loaded first)
        this._initManagers();

        // Build fallback chain (uses loaded managers)
        this.fallbackChain = this._buildChain();

        logger.info('UltimateFallback initialized', {
            hardwareProfile: profile,
            maxRetries: this.options.maxRetries,
            enabledMethods: this.fallbackChain.map(m => m.name),
            useHeavyMethods: this.options.useHeavyMethods,
        });
    }

    /**
     * Initialize all managers
     * @private
     */
    _initManagers() {
        try {
            fingerprintManager = require('./fingerprintManager');
            logger.debug('FingerprintManager loaded');
        } catch (e) {
            logger.warn('FingerprintManager not available', { error: e.message });
        }

        try {
            const ipv6Module = require('./ipv6Manager');
            ipv6Manager = ipv6Module.getInstance ? ipv6Module.getInstance() : ipv6Module;
            logger.debug('IPv6Manager loaded');
        } catch (e) {
            logger.warn('IPv6Manager not available', { error: e.message });
        }

        try {
            const hybridModule = require('./hybridNetworkManager');
            hybridNetworkManager = hybridModule.getInstance ? hybridModule.getInstance() : hybridModule;
            logger.debug('HybridNetworkManager loaded');
        } catch (e) {
            logger.warn('HybridNetworkManager not available', { error: e.message });
        }

        try {
            const wifiModule = require('./wifiRotationManager');
            wifiRotationManager = wifiModule.getInstance ? wifiModule.getInstance() : wifiModule;
            logger.debug('WiFiRotationManager loaded');
        } catch (e) {
            logger.warn('WiFiRotationManager not available', { error: e.message });
        }
    }

    /**
     * Build the fallback chain based on enabled options
     * @private
     */
    _buildChain() {
        const chain = [];

        // Method 1: Direct with fingerprint randomization
        if (fingerprintManager) {
            chain.push({
                name: 'fingerprint',
                weight: 10,
                execute: async (context) => {
                    const fp = fingerprintManager.get();
                    return {
                        ...context,
                        headers: fingerprintManager.getHeaders(fp),
                        fingerprint: fp,
                        method: 'fingerprint',
                    };
                },
            });
        }

        // Method 2: IPv6
        if (this.options.enableIPv6 && ipv6Manager) {
            chain.push({
                name: 'ipv6',
                weight: 8,
                execute: async (context) => {
                    await ipv6Manager.checkStatus();
                    return {
                        ...context,
                        useIPv6: true,
                        agent: ipv6Manager.getAgent(),
                        method: 'ipv6',
                    };
                },
            });
        }

        // Method 3: Tor
        if (this.options.enableTor && hybridNetworkManager) {
            chain.push({
                name: 'tor',
                weight: 6,
                execute: async (context) => {
                    await hybridNetworkManager.checkStatus();
                    if (!hybridNetworkManager.status.tor.available) {
                        throw new Error('Tor not available');
                    }
                    return {
                        ...context,
                        proxy: hybridNetworkManager.getTorProxyConfig(),
                        method: 'tor',
                    };
                },
            });
        }

        // Method 4: I2P
        if (this.options.enableI2P && hybridNetworkManager) {
            chain.push({
                name: 'i2p',
                weight: 4,
                execute: async (context) => {
                    await hybridNetworkManager.checkStatus();
                    if (!hybridNetworkManager.status.i2p.available) {
                        throw new Error('I2P not available');
                    }
                    return {
                        ...context,
                        proxy: hybridNetworkManager.getI2PConfig(),
                        method: 'i2p',
                    };
                },
            });
        }

        // Method 5: WiFi rotation
        if (this.options.enableWiFi && wifiRotationManager) {
            chain.push({
                name: 'wifi',
                weight: 3,
                execute: async (context) => {
                    await wifiRotationManager.switchNetwork();
                    return {
                        ...context,
                        method: 'wifi',
                    };
                },
            });
        }

        // Method 6: Ultimate fallback (combines all)
        chain.push({
            name: 'ultimate',
            weight: 1,
            execute: async (context) => {
                // Try everything in parallel
                return this._ultimateAttempt(context);
            },
        });

        return chain;
    }

    /**
     * Ultimate attempt - combines all methods
     * @private
     */
    async _ultimateAttempt(context) {
        logger.info('Attempting ultimate fallback combination');

        // 1. Get fresh fingerprint
        let result = { ...context };
        if (fingerprintManager) {
            const fp = fingerprintManager.getRandom();
            result = {
                ...result,
                headers: fingerprintManager.getHeaders(fp),
                fingerprint: fp,
            };
        }

        // 2. Check IPv6
        if (ipv6Manager) {
            await ipv6Manager.checkStatus();
            if (ipv6Manager.shouldUseIPv6()) {
                result.useIPv6 = true;
                result.agent = ipv6Manager.getAgent();
            }
        }

        // 3. Try Tor as proxy
        if (hybridNetworkManager) {
            await hybridNetworkManager.checkStatus();
            if (hybridNetworkManager.status.tor.available) {
                result.proxy = hybridNetworkManager.getTorProxyConfig();
                // Rotate circuit for fresh IP
                await hybridNetworkManager.rotateTorCircuit();
            }
        }

        result.method = 'ultimate';

        return result;
    }

    /**
     * Execute scraping with full fallback chain
     * @param {Function} scraperFunc - The actual scraping function
     * @param {Object} options - Scraping options
     * @returns {Promise<Object>} Result
     */
    async execute(scraperFunc, options = {}) {
        this.isActive = true;

        const context = {
            url: options.url,
            attempt: 0,
            method: 'direct',
            ...options.context,
        };

        let lastError = null;

        for (let i = 0; i < this.fallbackChain.length; i++) {
            const method = this.fallbackChain[i];
            context.attempt++;

            logger.info(`Attempting fallback method ${context.attempt}: ${method.name}`, {
                url: context.url,
            });

            try {
                // Apply method transformation
                const modifiedContext = await method.execute(context);

                // Execute scraper with modified context
                const result = await scraperFunc({
                    ...options,
                    ...modifiedContext,
                });

                // Success!
                this._recordAttempt(method.name, true);
                this.currentMethod = method.name;
                this.isActive = false;

                this.emit('success', { method: method.name, result });

                return {
                    success: true,
                    result,
                    method: method.name,
                    attempts: context.attempt,
                };

            } catch (error) {
                lastError = error;
                logger.warn(`Fallback method ${method.name} failed`, {
                    error: error.message,
                    url: context.url,
                });

                this._recordAttempt(method.name, false, error.message);

                // Emit failure for this method
                this.emit('methodFailed', { method: method.name, error: error.message });

                // Wait before next attempt
                if (i < this.fallbackChain.length - 1) {
                    await this._delay(this.options.retryDelay);
                }
            }
        }

        // All methods failed
        this.isActive = false;

        const error = new Error(`All fallback methods exhausted: ${lastError?.message}`);
        this.emit('failed', { error: error.message, attempts: context.attempt });

        return {
            success: false,
            error: error.message,
            attempts: context.attempt,
            history: this.attemptHistory,
        };
    }

    /**
     * Record attempt in history
     * @private
     */
    _recordAttempt(method, success, error = null) {
        this.attemptHistory.push({
            method,
            success,
            error,
            timestamp: new Date().toISOString(),
        });

        // Keep only last 100 attempts
        if (this.attemptHistory.length > 100) {
            this.attemptHistory = this.attemptHistory.slice(-100);
        }
    }

    /**
     * Delay helper
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current status
     * @returns {Object} Status
     */
    getStatus() {
        return {
            hardwareProfile: this.hardwareProfile,
            isActive: this.isActive,
            currentMethod: this.currentMethod,
            attemptHistory: this.attemptHistory.slice(-10),
            config: {
                maxRetries: this.options.maxRetries,
                enableIPv6: this.options.enableIPv6,
                enableTor: this.options.enableTor,
                enableI2P: this.options.enableI2P,
                enableWiFi: this.options.enableWiFi,
                useHeavyMethods: this.options.useHeavyMethods,
            },
            managers: {
                fingerprint: !!fingerprintManager,
                ipv6: !!ipv6Manager,
                hybrid: !!hybridNetworkManager,
                wifi: !!wifiRotationManager,
            },
        };
    }

    /**
     * Force switch to specific method
     * @param {string} methodName - Method name
     * @returns {Promise<Object>} Modified context
     */
    async forceMethod(methodName) {
        const method = this.fallbackChain.find(m => m.name === methodName);

        if (!method) {
            throw new Error(`Unknown method: ${methodName}`);
        }

        this.currentMethod = methodName;

        return await method.execute({});
    }

    /**
     * Reset state
     */
    reset() {
        this.currentMethod = 'direct';
        this.attemptHistory = [];
        this.isActive = false;
    }
}

// Export lazy-initialized singleton and factory function
module.exports = {
    getInstance,
    UltimateFallback,
};
