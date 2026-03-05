/**
 * IPv6 Manager - Dynamic IPv6 Integration
 * 
 * Manages IPv6 connectivity and provides:
 * - IPv6 address detection
 * - IPv6-only network support
 * - Dual-stack fallback handling
 * - Teredo / tunnel broker integration
 * 
 * @module services/scraper/ipv6Manager
 */

const { exec } = require('child_process');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);

const logger = require('../logger');
const scraperConfig = require('./config');

// Lazy singleton instance
let _instance = null;

/**
 * Get or create the IPv6Manager singleton.
 * Uses lazy initialization to avoid reading process.env at require time.
 * @returns {IPv6Manager} The singleton instance
 */
function getInstance() {
    if (!_instance) {
        const antiDetection = scraperConfig.antiDetection;
        _instance = new IPv6Manager({
            enabled: antiDetection.ipv6.enabled,
            preferIPv6: antiDetection.ipv6.preferIPv6,
        });
    }
    return _instance;
}

class IPv6Manager {
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.preferIPv6 = options.preferIPv6 || false;
        this.checkInterval = options.checkInterval || 60000; // 1 minute
        this.status = {
            hasIPv6: false,
            ipv6Address: null,
            ipv4Address: null,
            isDualStack: false,
            lastCheck: null,
            tunnelType: null,
            interfaces: this._detectNetworkInterfaces(), // Dynamically detect interfaces
        };

        this.checkTimer = null;

        if (this.enabled) {
            this._startMonitoring();
        }

        logger.info('IPv6Manager initialized', {
            enabled: this.enabled,
            preferIPv6: this.preferIPv6
        });
    }

    /**
     * Dynamically detect available network interfaces on the system.
     * @private
     * @returns {object} Object with all[] interface names
     */
    _detectNetworkInterfaces() {
        const detected = { all: [] };

        try {
            // Use Node.js built-in networkInterfaces
            const interfaces = os.networkInterfaces();

            for (const name of Object.keys(interfaces)) {
                // Skip loopback
                if (name === 'lo' || name === 'lo0' || name === '127.0.0.1') continue;
                detected.all.push(name);
            }

            // On Linux, use ip command for additional detection
            if (process.platform === 'linux') {
                try {
                    const { execSync } = require('child_process');
                    const ipOutput = execSync('ip -o link show | awk -F\': \' \'{print $2}\'', { encoding: 'utf8', timeout: 3000 });
                    const ipInterfaces = ipOutput.trim().split('\n').map(i => i.trim()).filter(i => i);

                    for (const name of ipInterfaces) {
                        if (!detected.all.includes(name)) {
                            detected.all.push(name);
                        }
                    }
                } catch (e) {
                    logger.debug('Additional interface detection via ip command failed', { error: e.message });
                }
            }

            logger.debug('IPv6Manager detected interfaces', detected);
        } catch (e) {
            logger.warn('Failed to dynamically detect network interfaces', { error: e.message });
        }

        return detected;
    }

    /**
     * Get IPv6 addresses from the system
     * @returns {Promise<Array>} Array of IPv6 addresses
     */
    async _getIPv6Addresses() {
        try {
            // Try using ip command (Linux)
            if (process.platform === 'linux') {
                const { stdout } = await execPromise('ip -6 addr show | grep inet6 | grep -v fe80:: | awk \'{print $2}\' | cut -d"/" -f1');
                return stdout.trim().split('\n').filter(a => a.length > 0);
            }

            // Try using ifconfig (macOS/older Linux)
            if (process.platform === 'darwin') {
                const { stdout } = await execPromise('ifconfig | grep inet6 | grep -v fe80:: | awk \'{print $2}\'');
                return stdout.trim().split('\n').filter(a => a.length > 0);
            }

            // Windows - use PowerShell for more reliable parsing across locales
            if (process.platform === 'win32') {
                try {
                    // Use PowerShell to get IPv6 addresses (locale-independent)
                    const { stdout } = await execPromise(
                        'powershell -Command "Get-NetIPAddress -AddressFamily IPv6 | Where-Object { $_.IPAddress -notlike \'fe80::*\' } | Select-Object -ExpandProperty IPAddress"',
                        { timeout: 10000 }
                    );
                    return stdout.trim().split('\n').filter(a => a.trim() && !a.trim().startsWith('fe80'));
                } catch (e) {
                    // Fallback to netsh if PowerShell fails
                    logger.warn('PowerShell failed, falling back to netsh', { error: e.message });
                    const { stdout } = await execPromise('netsh int ipv6 show address');
                    const addresses = stdout.split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('fe80'))
                        .map(line => line.split(/\s+/).pop())
                        .filter(a => a && a.includes(':'));
                    return addresses;
                }
            }

            return [];
        } catch (error) {
            logger.warn('Failed to get IPv6 addresses', { error: error.message });
            return [];
        }
    }

    /**
     * Get IPv4 addresses from the system
     * @returns {Promise<Array>} Array of IPv4 addresses
     */
    async _getIPv4Addresses() {
        try {
            // Try using ip command (Linux)
            if (process.platform === 'linux') {
                const { stdout } = await execPromise('ip -4 addr show | grep inet | awk \'{print $2}\' | cut -d"/" -f1');
                return stdout.trim().split('\n').filter(a => a.length > 0 && a !== '127.0.0.1');
            }

            // Try using ifconfig (macOS)
            if (process.platform === 'darwin') {
                const { stdout } = await execPromise('ifconfig | grep "inet " | awk \'{print $2}\'');
                return stdout.trim().split('\n').filter(a => a.length > 0 && a !== '127.0.0.1');
            }

            // Windows - use PowerShell for more reliable parsing across locales
            if (process.platform === 'win32') {
                try {
                    const { stdout } = await execPromise(
                        'powershell -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne \'127.0.0.1\' } | Select-Object -ExpandProperty IPAddress"',
                        { timeout: 10000 }
                    );
                    return stdout.trim().split('\n').filter(a => a.trim() && a.trim() !== '127.0.0.1');
                } catch (e) {
                    // Fallback to ipconfig if PowerShell fails
                    logger.warn('PowerShell failed, falling back to ipconfig', { error: e.message });
                    const { stdout } = await execPromise('ipconfig');
                    const addresses = stdout.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.toLowerCase().includes('ipv4'))
                        .map(line => line.split(':').pop().trim())
                        .filter(a => a && a !== '127.0.0.1');
                    return addresses;
                }
            }

            return [];
        } catch (error) {
            logger.warn('Failed to get IPv4 addresses', { error: error.message });
            return [];
        }
    }

    /**
     * Check IPv6 connectivity
     * @returns {Promise<boolean>} Whether IPv6 is working
     */
    async _checkIPv6Connectivity() {
        try {
            // Try to connect to an IPv6-only endpoint
            // Using Google's public DNS over IPv6
            const http = require('http');

            return new Promise((resolve) => {
                const req = http.request({
                    method: 'HEAD',
                    hostname: 'ipv6.google.com',
                    port: 80,
                    timeout: 5000,
                }, (res) => {
                    resolve(true);
                });

                req.on('error', () => resolve(false));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });

                req.end();
            });
        } catch {
            return false;
        }
    }

    /**
     * Detect tunnel type (Teredo, 6to4, etc.)
     * @returns {Promise<string|null>} Tunnel type
     */
    async _detectTunnelType() {
        try {
            if (process.platform === 'linux') {
                // Check for Teredo interface
                const { stdout } = await execPromise('ip -6 tunnel show');
                if (stdout.includes('teredo')) {
                    return 'teredo';
                }
                if (stdout.includes('6to4')) {
                    return '6to4';
                }
            }

            if (process.platform === 'win32') {
                const { stdout } = await execPromise('netsh int teredo show state');
                if (stdout.includes('type: client')) {
                    return 'teredo';
                }
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Perform full network status check
     * @returns {Promise<Object>} Current network status
     */
    async checkStatus() {
        const [ipv6Addresses, ipv4Addresses] = await Promise.all([
            this._getIPv6Addresses(),
            this._getIPv4Addresses(),
        ]);

        const ipv6Connectivity = await this._checkIPv6Connectivity();
        const tunnelType = await this._detectTunnelType();

        this.status = {
            hasIPv6: ipv6Addresses.length > 0 && ipv6Connectivity,
            ipv6Address: ipv6Addresses[0] || null,
            ipv4Address: ipv4Addresses[0] || null,
            isDualStack: ipv6Addresses.length > 0 && ipv4Addresses.length > 0,
            lastCheck: new Date().toISOString(),
            tunnelType,
            ipv6Addresses,
            ipv4Addresses,
        };

        logger.debug('IPv6 status checked', this.status);

        return this.status;
    }

    /**
     * Start periodic monitoring
     * @private
     */
    _startMonitoring() {
        this.checkTimer = setInterval(() => {
            this.checkStatus().catch(err => {
                logger.error('IPv6 status check failed', { error: err.message });
            });
        }, this.checkInterval);

        // Initial check
        this.checkStatus();
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }

    /**
     * Get proxy URL with IPv6 preference
     * @returns {Object} Proxy configuration
     */
    getProxyConfig() {
        if (!this.enabled) {
            return { useIPv6: false };
        }

        return {
            useIPv6: this.status.hasIPv6,
            preferIPv6: this.preferIPv6,
            ipv6Address: this.status.ipv6Address,
            ipv4Address: this.status.ipv4Address,
            isDualStack: this.status.isDualStack,
            tunnelType: this.status.tunnelType,
        };
    }

    /**
     * Get the appropriate IP type to use
     * @returns {string} 'ipv6', 'ipv4', or 'dual'
     */
    getActiveIPType() {
        if (!this.enabled || !this.status.hasIPv6) {
            return 'ipv4';
        }

        if (this.preferIPv6 && this.status.hasIPv6) {
            return 'ipv6';
        }

        return this.status.isDualStack ? 'dual' : 'ipv4';
    }

    /**
     * Should use IPv6 for the next request
     * @returns {boolean} Whether to use IPv6
     */
    shouldUseIPv6() {
        const ipType = this.getActiveIPType();
        return ipType === 'ipv6' || ipType === 'dual';
    }

    /**
     * Get HTTP agent configured for IPv6
     * @returns {Object} HTTP/HTTPS agent
     */
    getAgent() {
        const http = require('http');
        const https = require('https');

        const status = this.status;

        if (!status.hasIPv6) {
            return { httpAgent: new http.Agent(), httpsAgent: new https.Agent() };
        }

        // For dual-stack, we can use default agents
        // For IPv6-only, we'd need to configure the IPv6 bind address
        return {
            httpAgent: new http.Agent({
                // If we have a specific IPv6 address, bind to it
                localAddress: status.ipv6Address,
            }),
            httpsAgent: new https.Agent({
                localAddress: status.ipv6Address,
            }),
        };
    }

    /**
     * Check if we should fallback to IPv4
     * @returns {boolean} Whether to fallback
     */
    shouldFallbackToIPv4() {
        return this.enabled && !this.status.hasIPv6;
    }
}

// Export lazy-initialized singleton and factory function
module.exports = {
    getInstance,
    IPv6Manager,
};
