/**
 * Hybrid Network Manager - Tor + I2P Combo
 * 
 * Provides combined Tor + I2P network support:
 * - Tor network integration via SOCKS5 proxy
 * - I2P network integration via SAM protocol
 * - Automatic network switching on failure
 * - Circuit rotation for Tor
 * - Network health monitoring
 * 
 * @module services/scraper/hybridNetworkManager
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { SocksClient } = require('socks');
const net = require('net');
const { EventEmitter } = require('events');
const logger = require('../logger');
const config = require('../../config');
const scraperConfig = require('./config');
const { HARDWARE_PROFILE, isLowEnd, getHardwareProfile } = require('./hardwareProfiles');

// Lazy singleton instance
let _instance = null;

/**
 * Get or create the HybridNetworkManager singleton.
 * Uses lazy initialization to avoid reading process.env at require time.
 * @returns {HybridNetworkManager} The singleton instance
 */
function getInstance() {
    if (!_instance) {
        const antiDetection = scraperConfig.antiDetection;
        _instance = new HybridNetworkManager({
            enabled: antiDetection.tor.enabled || antiDetection.i2p.enabled,
            preferredNetwork: process.env.PREFERRED_NETWORK || 'tor',
        });
    }
    return _instance;
}

class HybridNetworkManager extends EventEmitter {
    constructor(options = {}) {
        super();

        const antiDetection = scraperConfig.antiDetection;

        // Tor configuration
        this.torHost = options.torHost || process.env.TOR_HOST || 'localhost';
        this.torPort = options.torPort || parseInt(process.env.TOR_PORT || '9050');
        this.torControlPort = options.torControlPort || parseInt(process.env.TOR_CONTROL_PORT || '9051');

        // Security: Load password from secret file or options only, no direct env fallback
        this.torPassword = options.torPassword || this._loadTorSecret() || '';
        // Hardware-aware: Disable Tor on low-end devices (too slow)
        this.torCircuitRotation = isLowEnd() ? false : (options.torCircuitRotation !== false && antiDetection.tor.circuitRotation);
        this.torCircuitInterval = options.torCircuitInterval || 300000; // 5 minutes

        // I2P configuration
        this.i2pHost = options.i2pHost || process.env.I2P_HOST || 'localhost';
        this.i2pSamPort = options.i2pSamPort || parseInt(process.env.I2P_SAM_PORT || '7656');
        this.i2pHttpPort = options.i2pHttpPort || parseInt(process.env.I2P_HTTP_PORT || '7657');

        // Network selection - hardware-aware
        this.enabled = options.enabled !== false;
        // On low-end, prefer I2P over Tor (I2P is lighter)
        this.preferredNetwork = options.preferredNetwork || (isLowEnd() ? 'i2p' : 'tor'); // 'tor', 'i2p', 'hybrid'
        this.fallbackEnabled = options.fallbackEnabled !== false;

        // State
        this.status = {
            tor: { available: false, circuits: [], lastRotation: null },
            i2p: { available: false, tunnels: [], samConnected: false },
            activeNetwork: null,
            lastError: null,
        };

        this.circuitTimer = null;
        this.hardwareProfile = HARDWARE_PROFILE;

        if (this.enabled && this.torCircuitRotation) {
            this._startCircuitRotation();
        }

        logger.info('HybridNetworkManager initialized', {
            torHost: this.torHost,
            torPort: this.torPort,
            i2pHost: this.i2pHost,
            i2pSamPort: this.i2pSamPort,
            preferredNetwork: this.preferredNetwork,
        });
    }

    /**
     * Load Tor password from secret file (Docker Secrets support)
     * @private
     * @returns {string|null} The password or null if not found
     */
    _loadTorSecret() {
        const secretPath = process.env.TOR_PASSWORD_FILE;
        if (!secretPath) return null;

        try {
            if (fs.existsSync(secretPath)) {
                return fs.readFileSync(secretPath, 'utf8').trim();
            }
        } catch (error) {
            logger.error('Failed to load Tor secret from file', { path: secretPath, error: error.message });
        }
        return null;
    }

    /**
     * Check Tor network availability
     * @returns {Promise<boolean>} Whether Tor is available
     */
    async _checkTor() {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(15000); // Increased for Tor network (slower)

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', () => {
                resolve(false);
            });

            socket.connect(this.torPort, this.torHost);
        });
    }

    /**
     * Check I2P availability via HTTP proxy port
     * @returns {Promise<boolean>} Whether I2P is available
     */
    async _checkI2P() {
        try {
            const response = await this._httpRequest({
                hostname: this.i2pHost,
                port: this.i2pHttpPort,
                path: '/',
                method: 'GET',
                timeout: 5000,
            });
            return response.statusCode === 200;
        } catch {
            return false;
        }
    }

    /**
     * Simple HTTP request helper
     * @private
     */
    _httpRequest(options) {
        return new Promise((resolve, reject) => {
            const protocol = options.port === 443 ? https : http;
            const req = protocol.request(options, (res) => {
                resolve(res);
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (options.timeout) {
                req.setTimeout(options.timeout);
            }

            req.end();
        });
    }

    /**
     * Rotate Tor circuit
     * @returns {Promise<boolean>} Whether rotation succeeded
     */
    async rotateTorCircuit() {
        if (!this.status.tor.available) {
            logger.warn('Tor not available, cannot rotate circuit');
            return false;
        }

        try {
            // Connect to Tor control port and send NEWNYM signal
            const socket = await new Promise((resolve, reject) => {
                const sock = new net.Socket();
                sock.setTimeout(10000);
                sock.on('connect', () => resolve(sock));
                sock.on('error', reject);
                sock.on('timeout', () => {
                    sock.destroy();
                    reject(new Error('Tor control port connection timeout'));
                });
                sock.connect(this.torControlPort, this.torHost);
            });

            // Authenticate if password is set
            if (this.torPassword) {
                await this._torCommand(socket, `AUTHENTICATE "${this.torPassword}"`);
            } else {
                await this._torCommand(socket, 'AUTHENTICATE');
            }

            // Signal new circuit
            await this._torCommand(socket, 'SIGNAL NEWNYM');

            socket.end();

            this.status.tor.lastRotation = new Date().toISOString();
            logger.info('Tor circuit rotated successfully');

            return true;
        } catch (error) {
            logger.error('Failed to rotate Tor circuit', { error: error.message });
            return false;
        }
    }

    /**
     * Send command to Tor control port
     * @private
     */
    _torCommand(socket, command) {
        return new Promise((resolve, reject) => {
            socket.write(command + '\r\n');

            let data = '';
            const onData = (chunk) => {
                data += chunk.toString();
                if (data.includes('250 OK') || data.includes('250')) {
                    socket.removeListener('data', onData);
                    resolve(data);
                } else if (data.includes('514') || data.includes('error')) {
                    socket.removeListener('data', onData);
                    reject(new Error(data));
                }
            };

            socket.on('data', onData);
            socket.setTimeout(10000, () => {
                socket.destroy();
                reject(new Error('Tor command timeout'));
            });
        });
    }

    /**
     * Start automatic circuit rotation
     * @private
     */
    _startCircuitRotation() {
        this.circuitTimer = setInterval(async () => {
            if (this.status.tor.available) {
                await this.rotateTorCircuit();
            }
        }, this.torCircuitInterval);

        logger.info('Tor circuit rotation started', {
            interval: this.torCircuitInterval
        });
    }

    /**
     * Check status of both networks
     * @returns {Promise<Object>} Combined status
     */
    async checkStatus() {
        const [torAvailable, i2pAvailable] = await Promise.all([
            this._checkTor(),
            this._checkI2P(),
        ]);

        this.status.tor.available = torAvailable;
        this.status.i2p.available = i2pAvailable;

        // Determine active network
        if (torAvailable && this.preferredNetwork === 'tor') {
            this.status.activeNetwork = 'tor';
        } else if (i2pAvailable && this.preferredNetwork === 'i2p') {
            this.status.activeNetwork = 'i2p';
        } else if (torAvailable) {
            this.status.activeNetwork = 'tor';
        } else if (i2pAvailable) {
            this.status.activeNetwork = 'i2p';
        } else {
            this.status.activeNetwork = null;
        }

        logger.debug('Hybrid network status', this.status);

        this.emit('status', this.status);

        return this.status;
    }

    /**
     * Get SOCKS5 proxy agent for Tor
     * @returns {Object} Proxy configuration
     */
    getTorProxyConfig() {
        return {
            proxy: {
                ipaddress: this.torHost,
                port: this.torPort,
                type: 5, // SOCKS5
            },
            Tor: true,
        };
    }

    /**
     * Get I2P proxy configuration
     * @returns {Object} I2P configuration
     */
    getI2PConfig() {
        return {
            host: this.i2pHost,
            samPort: this.i2pSamPort,
            httpPort: this.i2pHttpPort,
        };
    }

    /**
     * Get HTTP agent configured for current network
     * @returns {Object} HTTP/HTTPS agent
     */
    getHttpAgent() {
        const activeNetwork = this.status.activeNetwork || this.preferredNetwork;

        if (activeNetwork === 'tor') {
            // Return SOCKS5 agent
            return {
                type: 'tor',
                config: this.getTorProxyConfig(),
                hardwareProfile: this.hardwareProfile,
            };
        }

        if (activeNetwork === 'i2p') {
            return {
                type: 'i2p',
                config: this.getI2PConfig(),
                hardwareProfile: this.hardwareProfile,
            };
        }

        return { type: 'direct', hardwareProfile: this.hardwareProfile };
    }

    /**
     * Make request through Tor
     * @param {Object} options - Request options
     * @returns {Promise<Object>} Response
     */
    async requestViaTor(options) {
        if (!this.status.tor.available) {
            throw new Error('Tor network not available');
        }

        const proxy = this.getTorProxyConfig();

        // For HTTP requests through SOCKS5 proxy
        return this._requestViaSocks(options, proxy.proxy);
    }

    /**
     * Make request through SOCKS5 proxy
     * @private
     */
    _requestViaSocks(options, proxy) {
        return new Promise(async (resolve, reject) => {
            try {
                const { socket } = await SocksClient.createConnection({
                    destination: {
                        host: options.hostname,
                        port: options.port || 80,
                    },
                    proxy: proxy,
                    command: 'connect',
                });

                const protocol = options.port === 443 ? https : http;

                const req = protocol.request({
                    ...options,
                    socket: socket,
                    agent: false,
                }, (res) => {
                    resolve(res);
                });

                req.on('error', reject);

                if (options.body) {
                    req.write(options.body);
                }

                req.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Fallback to alternative network
     * @returns {Promise<string>} New active network
     */
    async fallback() {
        if (!this.fallbackEnabled) {
            throw new Error('Fallback disabled');
        }

        logger.warn('Attempting network fallback', {
            current: this.status.activeNetwork
        });

        // Try the other network
        if (this.status.activeNetwork === 'tor' && this.status.i2p.available) {
            this.status.activeNetwork = 'i2p';
            logger.info('Fell back to I2P');
            return 'i2p';
        }

        if (this.status.activeNetwork === 'i2p' && this.status.tor.available) {
            this.status.activeNetwork = 'tor';
            logger.info('Fell back to Tor');
            return 'tor';
        }

        // If current is unknown, try both
        if (!this.status.activeNetwork) {
            if (this.status.tor.available) {
                this.status.activeNetwork = 'tor';
                return 'tor';
            }
            if (this.status.i2p.available) {
                this.status.activeNetwork = 'i2p';
                return 'i2p';
            }
        }

        throw new Error('No networks available for fallback');
    }

    /**
     * Stop all timers and cleanup
     */
    destroy() {
        if (this.circuitTimer) {
            clearInterval(this.circuitTimer);
            this.circuitTimer = null;
        }
    }
}

// Export lazy-initialized singleton and factory function
module.exports = {
    getInstance,
    HybridNetworkManager,
};
