/**
 * WiFi Rotation Manager - Public WiFi / Tether Fallback
 * 
 * Manages WiFi and tether connections for IP rotation:
 * - WiFi network scanning and switching
 * - Mobile tethering fallback
 * - USB tethering support
 * - Connection health monitoring
 * - Automatic failover
 * 
 * @module services/scraper/wifiRotationManager
 */

const { exec, spawn } = require('child_process');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);
const EventEmitter = require('events');
const logger = require('../logger');
const scraperConfig = require('./config');
const { HARDWARE_PROFILE, LOW_END_PROFILES, isLowEnd, getHardwareProfile } = require('./hardwareProfiles');

/**
 * Sanitize SSID for safe shell use
 * @param {string} ssid - Network SSID
 * @returns {string} Sanitized SSID
 */
function sanitizeSSID(ssid) {
    // Allow common SSID characters: alphanumeric, spaces, dots, hyphens, underscores, @, ()
    // Block shell metacharacters: ` $ ; | & < > \ ! { } [ ] ' "
    return ssid.replace(/[^a-zA-Z0-9 ._\-@()]/g, '');
}

/**
 * Sanitize Windows profile filename
 * @param {string} ssid - Network SSID
 * @returns {string} Sanitized filename
 */
function sanitizeWindowsFilename(ssid) {
    // More restrictive: only alphanumeric and underscore for Windows filenames
    return ssid.replace(/[^a-zA-Z0-9_]/g, '_');
}

class WiFiRotationManager extends EventEmitter {
    constructor(options = {}) {
        super();

        const antiDetection = scraperConfig.antiDetection;

        // Configuration - hardware-aware
        this.enabled = options.enabled !== false;

        // Detect network interfaces dynamically (with fallback to defaults)
        const detectedInterfaces = this._detectNetworkInterfaces();
        this.wifiInterfaces = options.wifiInterfaces || detectedInterfaces.wifi;
        this.tetherInterfaces = options.tetherInterfaces || detectedInterfaces.tether;
        this.activeWifiInterface = null; // Detected on Windows at runtime

        // Less aggressive rotation on low-end to save resources
        this.rotationStrategy = options.rotationStrategy || (isLowEnd() ? 'sequential' : 'smart');
        // Longer interval on low-end to reduce network thrashing
        this.healthCheckInterval = options.healthCheckInterval || (isLowEnd() ? 60000 : 30000);
        // Fewer retries on low-end
        this.maxRetries = options.maxRetries || (isLowEnd() ? 2 : 3);
        // Aggressive mode only on high-end
        this.aggressiveMode = options.aggressiveMode !== undefined ? options.aggressiveMode : antiDetection.wifiRotation.aggressive;

        // Known networks (for smart rotation)
        this.knownNetworks = options.knownNetworks || [];

        // State
        this.status = {
            currentInterface: null,
            currentMode: null, // 'wifi', 'tether', 'ethernet'
            availableNetworks: [],
            isConnected: false,
            lastSwitch: null,
            connectionHealth: 'unknown',
            retryCount: 0,
        };

        this.healthTimer = null;
        this.networkIndex = 0;
        this.hardwareProfile = HARDWARE_PROFILE;

        logger.info('WiFiRotationManager initialized', {
            enabled: this.enabled,
            wifiInterfaces: this.wifiInterfaces,
            tetherInterfaces: this.tetherInterfaces,
            rotationStrategy: this.rotationStrategy,
            detected: detectedInterfaces.detected, // Log if dynamic detection was used
        });
    }

    /**
     * Dynamically detect available network interfaces on the system.
     * Uses Node.js os.networkInterfaces() and shell commands for comprehensive detection.
     * @private
     * @returns {object} Object with wifi[] and tether[] interface arrays
     */
    _detectNetworkInterfaces() {
        const defaults = {
            wifi: ['wlan0', 'wlan1', 'Wi-Fi'],
            tether: ['usb0', 'rndis0', 'eth0', 'enp0s0', 'ens33', 'enx00e04c68079e'],
        };

        let detected = { wifi: [], tether: [], all: [] };

        try {
            // Use Node.js built-in networkInterfaces for primary detection
            const interfaces = os.networkInterfaces();

            for (const [name, addrs] of Object.entries(interfaces)) {
                // Skip loopback
                if (name === 'lo' || name === 'lo0' || name === '127.0.0.1') continue;

                detected.all.push(name);

                // Classify interface by name pattern
                const lowerName = name.toLowerCase();

                // WiFi interfaces: wlan, wifi, ath, ra, rtl
                if (/^(wlan|wi-?fi|ath|ra|rtl)/i.test(name)) {
                    if (!detected.wifi.includes(name)) detected.wifi.push(name);
                }
                // Ethernet interfaces: eth, en, e1000, etc
                else if (/^(eth|enp|ens|enx|e1000)/i.test(name)) {
                    // Check if it's a likely ethernet (not virtual/special)
                    if (!/veth|docker|bridge|virbr/i.test(name)) {
                        if (!detected.tether.includes(name)) detected.tether.push(name);
                    }
                }
                // USB interfaces: usb, rndis, cdc, eth
                else if (/^(usb|rndis|cdc_ether)/i.test(name)) {
                    if (!detected.tether.includes(name)) detected.tether.push(name);
                }
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

                            // Re-classify any new interfaces found via ip command
                            if (/^(wlan|wi-?fi|ath|ra|rtl)/i.test(name) && !detected.wifi.includes(name)) {
                                detected.wifi.push(name);
                            }
                            else if (/^(eth|enp|ens|enx|usb|rndis)/i.test(name) && !detected.tether.includes(name)) {
                                if (!/veth|docker|bridge|virbr/i.test(name)) {
                                    detected.tether.push(name);
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('Additional interface detection via ip command failed', { error: e.message });
                }
            }

            // On Windows, use netsh for additional detection
            if (process.platform === 'win32') {
                try {
                    const { execSync } = require('child_process');
                    const netshOutput = execSync('netsh interface show interface', { encoding: 'utf8', timeout: 5000 });
                    // Parse netsh output for interface names (Enabled interfaces)
                    const lines = netshOutput.split('\n');
                    for (const line of lines) {
                        const match = line.match(/\s{2,}(.+?)\s{2,}(Connected|Disconnected)/i);
                        if (match && match[1]) {
                            const name = match[1].trim();
                            if (!detected.all.includes(name) && !/virtual|loopback|isatap|teredo/i.test(name)) {
                                detected.all.push(name);
                                if (!detected.wifi.includes(name) && /wi-?fi|wireless|lan/i.test(name)) {
                                    detected.wifi.push(name);
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('Additional interface detection via netsh failed', { error: e.message });
                }
            }

            logger.debug('Dynamic network interface detection results', detected);
        } catch (e) {
            logger.warn('Failed to dynamically detect network interfaces, using defaults', { error: e.message });
        }

        // Merge detected with defaults (detected takes precedence)
        return {
            wifi: detected.wifi.length > 0 ? detected.wifi : defaults.wifi,
            tether: detected.tether.length > 0 ? detected.tether : defaults.tether,
            all: detected.all,
            detected: detected.wifi.length > 0 || detected.tether.length > 0,
        };
    }

    /**
     * Get list of available WiFi networks
     * @returns {Promise<Array>} Available networks
     */
    async scanNetworks() {
        try {
            if (process.platform === 'linux') {
                // Use iwlist or nmcli for Linux
                const { stdout } = await execPromise('nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list', { timeout: 10000 });
                const networks = stdout.trim().split('\n')
                    .filter(line => line.length > 0)
                    .map(line => {
                        const [ssid, signal, security] = line.split(':');
                        return { ssid, signal: parseInt(signal), security };
                    })
                    .filter(n => n.ssid);

                return networks;
            }

            if (process.platform === 'win32') {
                // Use netsh for Windows
                const { stdout } = await execPromise('netsh wlan show networks mode=bssid', { timeout: 15000 });
                const networks = [];
                const lines = stdout.split('\n');
                let currentSsid = '';

                for (const line of lines) {
                    if (line.includes('SSID')) {
                        const match = line.match(/SSID\s*:\s*(.+)/);
                        if (match) currentSsid = match[1].trim();
                    }
                    if (line.includes('Signal') && currentSsid) {
                        const match = line.match(/Signal\s*:\s*(\d+)%/);
                        if (match) {
                            networks.push({
                                ssid: currentSsid,
                                signal: parseInt(match[1]),
                                security: 'WPA2', // Simplified
                            });
                        }
                    }
                }

                return networks;
            }

            return [];
        } catch (error) {
            logger.warn('Failed to scan networks', { error: error.message });
            return [];
        }
    }

    /**
     * Connect to a WiFi network
     * @param {string} ssid - Network SSID
     * @param {string} password - Network password
     * @returns {Promise<boolean>} Success
     */
    async connectWiFi(ssid, password = '') {
        try {
            // Sanitize SSID to prevent command injection
            const safeSSID = sanitizeSSID(ssid);

            if (process.platform === 'linux') {
                // Use spawn with array to prevent shell injection
                try {
                    await this._runSecureCommand('nmcli', ['con', 'up', 'id', ssid], 15000);
                    logger.info('Connected to existing WiFi network', { ssid });
                    return true;
                } catch {
                    // Connection doesn't exist, create it
                    const args = ['dev', 'wifi', 'connect', ssid];
                    if (password) {
                        args.push('password', password);
                    }
                    await this._runSecureCommand('nmcli', args, 20000);
                    logger.info('Connected to new WiFi network', { ssid });
                    return true;
                }
            }

            if (process.platform === 'win32') {
                const safeFilename = sanitizeWindowsFilename(ssid);
                // Use spawn with array for secure execution
                await this._runSecureCommand('netsh', ['wlan', 'add', 'profile', `filename=%TEMP%\\${safeFilename}.xml`], 10000);
                await this._runSecureCommand('netsh', ['wlan', 'connect', 'name', ssid], 15000);
                logger.info('Connected to WiFi network (Windows)', { ssid });
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Failed to connect to WiFi', { ssid, error: error.message });
            return false;
        }
    }

    /**
     * Enable mobile tethering
     * @returns {Promise<boolean>} Success
     */
    async enableTethering() {
        try {
            if (process.platform === 'linux') {
                // Check for USB tethering
                const { stdout } = await this._runSecureCommand('ip', ['link', 'show'], 5000);

                // Look for USB network interfaces
                for (const iface of this.tetherInterfaces) {
                    if (stdout.includes(iface)) {
                        // Defense-in-depth: Explicitly sanitize dynamically detected interface name
                        const safeIface = iface.replace(/[^a-zA-Z0-9]/g, '');
                        // Use spawn with array to prevent injection
                        await this._runSecureCommand('ip', ['link', 'set', safeIface, 'up'], 5000);
                        await this._runSecureCommand('dhclient', [safeIface], 10000);
                        logger.info('USB tethering enabled', { interface: iface });
                        this.status.currentInterface = iface;
                        this.status.currentMode = 'tether';
                        return true;
                    }
                }

                // Try NetworkManager hotspot
                await this._runSecureCommand('nmcli', ['con', 'edit', 'type', 'wifi', 'ifname', 'wlan0'], 5000);
                await this._runSecureCommand('nmcli', ['con', 'modify', 'wifi-wlan0', 'ipv4.method', 'shared'], 5000);
                await this._runSecureCommand('nmcli', ['con', 'up', 'wifi-wlan0'], 15000);

                logger.info('WiFi hotspot enabled');
                this.status.currentMode = 'tether';
                return true;
            }

            if (process.platform === 'win32') {
                // Dynamic Windows WiFi interface detection to avoid breaking host connectivity
                const wifiIface = await this._detectWindowsWifiInterface();
                await this._runSecureCommand('netsh', ['interface', 'set', 'interface', wifiIface, 'disable'], 5000);
                await this._runSecureCommand('netsh', ['interface', 'set', 'interface', 'Mobile Hotspot', 'enable'], 5000);
                logger.info('Windows mobile hotspot enabled', { wifiIface });
                this.status.currentMode = 'tether';
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Failed to enable tethering', { error: error.message });
            return false;
        }
    }

    /**
     * Switch to next network based on strategy
     * @returns {Promise<boolean>} Success
     */
    async switchNetwork() {
        if (!this.enabled) {
            return false;
        }

        logger.info('Switching network', {
            strategy: this.rotationStrategy,
            retryCount: this.status.retryCount,
        });

        // Get available networks
        const networks = await this.scanNetworks();
        this.status.availableNetworks = networks;

        if (networks.length === 0) {
            // No WiFi, try tethering
            logger.warn('No WiFi networks available, trying tethering');
            return await this.enableTethering();
        }

        // Select network based on strategy
        let targetNetwork;

        if (this.rotationStrategy === 'random') {
            targetNetwork = networks[Math.floor(Math.random() * networks.length)];
        } else if (this.rotationStrategy === 'smart') {
            // Prefer known networks with good signal
            targetNetwork = this._selectSmartNetwork(networks);
        } else {
            // Sequential rotation
            targetNetwork = networks[this.networkIndex % networks.length];
            this.networkIndex++;
        }

        if (targetNetwork) {
            // Check if we already have password for this network
            const known = this.knownNetworks.find(n => n.ssid === targetNetwork.ssid);

            if (known || !targetNetwork.security) {
                const password = known?.password || '';
                const success = await this.connectWiFi(targetNetwork.ssid, password);

                if (success) {
                    this.status.currentInterface = this.wifiInterfaces[0];
                    this.status.currentMode = 'wifi';
                    this.status.lastSwitch = new Date().toISOString();
                    this.status.retryCount = 0;
                    this.status.isConnected = true;
                    this.emit('connected', { mode: 'wifi', network: targetNetwork });
                    return true;
                }
            }
        }

        // Failed to connect, try tethering as fallback
        if (this.status.retryCount < this.maxRetries) {
            this.status.retryCount++;
            return await this.enableTethering();
        }

        logger.error('Max retries exceeded for network switching');
        return false;
    }

    /**
     * Smart network selection
     * @private
     */
    _selectSmartNetwork(networks) {
        // First, prefer known networks
        const knownWithSignal = networks
            .filter(n => this.knownNetworks.some(k => k.ssid === n.ssid))
            .sort((a, b) => b.signal - a.signal);

        if (knownWithSignal.length > 0) {
            return knownWithSignal[0];
        }

        // Then, prefer open networks with good signal
        const openWithSignal = networks
            .filter(n => !n.security || n.security === 'Open')
            .sort((a, b) => b.signal - a.signal);

        if (openWithSignal.length > 0) {
            return openWithSignal[0];
        }

        // Finally, any network with decent signal
        return networks
            .sort((a, b) => b.signal - a.signal)[0];
    }

    /**
     * Check connection health
     * @private
     */
    async _checkHealth() {
        try {
            // Try to ping a reliable host
            const host = process.platform === 'win32' ? '-n' : '-c';
            const count = process.platform === 'win32' ? '1' : '1';

            await execPromise(`ping ${host} ${count} 8.8.8.8`, { timeout: 5000 });

            const wasHealthy = this.status.connectionHealth === 'good';
            this.status.connectionHealth = 'good';

            if (!wasHealthy) {
                this.emit('healthRestored');
            }

            return true;
        } catch {
            this.status.connectionHealth = 'poor';
            this.emit('healthDegraded');
            return false;
        }
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthCheck() {
        this.healthTimer = setInterval(async () => {
            const isHealthy = await this._checkHealth();

            if (!isHealthy) {
                logger.warn('Connection health degraded, attempting switch');
                await this.switchNetwork();
            }
        }, this.healthCheckInterval);
    }

    /**
     * Start the WiFi rotation manager
     */
    start() {
        if (!this.enabled) {
            logger.info('WiFi rotation manager is disabled');
            return;
        }

        this._startHealthCheck();
        logger.info('WiFi rotation manager started');
    }

    /**
     * Stop the WiFi rotation manager
     */
    stop() {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
        logger.info('WiFi rotation manager stopped');
    }

    /**
     * Get current status
     * @returns {object} Current status
     */
    getStatus() {
        return { ...this.status };
    }

    /**
     * Add a known network
     * @param {string} ssid - Network SSID
     * @param {string} password - Network password
     */
    addKnownNetwork(ssid, password) {
        this.knownNetworks.push({ ssid, password });
        logger.info('Added known network', { ssid });
    }

    /**
     * Remove a known network
     * @param {string} ssid - Network SSID
     */
    removeKnownNetwork(ssid) {
        this.knownNetworks = this.knownNetworks.filter(n => n.ssid !== ssid);
        logger.info('Removed known network', { ssid });
    }

    /**
     * Helper to run commands securely using spawn with argument array
     * @private
     */
    _runSecureCommand(command, args, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { timeout });
            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => { stdout += data; });
            child.stderr.on('data', (data) => { stderr += data; });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    const error = new Error(`Command ${command} failed with code ${code}`);
                    error.stderr = stderr;
                    error.stdout = stdout;
                    reject(error);
                }
            });

            child.on('error', reject);
        });
    }

    /**
     * Detect the active WiFi interface on Windows
     * @private
     */
    async _detectWindowsWifiInterface() {
        try {
            const { stdout } = await execPromise('netsh interface show interface');
            // Look for interface with "Wi-Fi" in the name and state "Connected" or "Disconnected"
            // but prioritize the one actually named Wi-Fi if multiple exist
            const lines = stdout.split('\n');
            let found = 'Wi-Fi'; // default fallback

            for (const line of lines) {
                if (line.includes('Wireless') || line.includes('Wi-Fi')) {
                    const parts = line.split(/\s{2,}/);
                    if (parts.length >= 4) {
                        found = parts[parts.length - 1].trim();
                        break;
                    }
                }
            }
            return found;
        } catch {
            return 'Wi-Fi';
        }
    }
}

// Lazy singleton instance
let _instance = null;

/**
 * Get or create the WiFiRotationManager singleton.
 * Uses lazy initialization to avoid reading process.env at require time.
 * @returns {WiFiRotationManager} The singleton instance
 */
function getInstance() {
    if (!_instance) {
        _instance = new WiFiRotationManager();
    }
    return _instance;
}

module.exports = {
    getInstance,
    WiFiRotationManager,
};
