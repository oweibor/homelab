/**
 * Fingerprint Manager - Advanced Browser Fingerprint Randomization
 * 
 * Provides comprehensive fingerprint randomization to avoid detection:
 * - User-Agent strings
 * - Screen resolutions and color depth
 * - Timezones and locales
 * - Canvas fingerprint hashing (advanced)
 * - WebGL vendor/renderer randomization
 * - Font enumeration simulation
 * - WebRTC leak prevention
 * - TLS/SSL fingerprint matching
 * - Hardware concurrency and memory
 * 
 * Hardware-aware: Automatically adjusts complexity based on HARDWARE_PROFILE
 * 
 * @module services/scraper/fingerprintManager
 */

const crypto = require('crypto');
const config = require('../../config');
const logger = require('../logger');
const { HARDWARE_PROFILE, HARDWARE_LIMITS, getHardwareProfile, isLowEnd, hwLimits } = require('./hardwareProfiles');

class FingerprintManager {
    constructor(options = {}) {
        this.poolSize = options.poolSize || hwLimits.poolSize;
        this.canvasNoise = options.canvasNoise !== undefined ? options.canvasNoise : hwLimits.canvasNoise;
        this.webglRandomization = options.webglRandomization !== undefined ? options.webglRandomization : hwLimits.webglRandomization;
        this.fontSimulation = options.fontSimulation !== undefined ? options.fontSimulation : hwLimits.fontSimulation;
        this.webrtcBlocking = options.webrtcBlocking !== undefined ? options.webrtcBlocking : hwLimits.webrtcBlocking;
        this.tlsFingerprint = options.tlsFingerprint !== undefined ? options.tlsFingerprint : hwLimits.tlsFingerprint;
        this.randomizePerRequest = options.randomizePerRequest !== undefined ? options.randomizePerRequest : hwLimits.randomizePerRequest;

        this.fingerprints = this._generatePool(this.poolSize);
        this.currentIndex = 0;

        logger.info('FingerprintManager initialized', {
            profile: HARDWARE_PROFILE,
            poolSize: this.poolSize,
            features: {
                canvasNoise: this.canvasNoise,
                webglRandomization: this.webglRandomization,
                fontSimulation: this.fontSimulation,
                webrtcBlocking: this.webrtcBlocking,
                tlsFingerprint: this.tlsFingerprint,
                randomizePerRequest: this.randomizePerRequest,
            },
        });
    }

    /**
     * Generate hash for canvas fingerprint
     * @private
     */
    _canvasHash(seed) {
        // Create deterministic canvas-like data
        const canvas = `Canvas ${seed} ${Date.now()}`;

        // Mix in hardware-specific noise
        let noise = seed;
        if (this.canvasNoise) {
            noise += Math.random().toString(36).substring(7);
        }

        // Generate hash
        const hash = crypto.createHash('sha256');
        hash.update(canvas + noise);
        return hash.digest('hex').substring(0, 32);
    }

    /**
     * Generate WebGL fingerprint
     * @private
     */
    _webglFingerprint(seed) {
        const vendors = [
            'Intel Inc.',
            'Intel OpenGL Engine',
            'NVIDIA Corporation',
            'ANGLE (NVIDIA, NVIDIA GeForce RTX)',
            'AMD',
            'Apple Inc.',
            'Mesa DRI Intel(R) UHD Graphics',
            'Intel Iris OpenGL Engine',
        ];

        const renderers = [
            'Intel Iris OpenGL Engine',
            'ANGLE',
            'NVIDIA GeForce RTX 3060/PCIe/SSE2',
            'NVIDIA GeForce RTX 3080/PCIe/SSE2',
            'AMD Radeon Pro 5500M',
            'Apple M1',
            'Intel UHD Graphics 620',
            'Mesa DRI Intel(R) UHD Graphics 620',
            'llvmpipe (LLVM 12.0.0, 256 bits)',
        ];

        // Deterministic selection based on seed
        const vendorIdx = parseInt(seed.charCodeAt(0)) % vendors.length;
        const rendererIdx = parseInt(seed.charCodeAt(1)) % renderers.length;

        return {
            vendor: vendors[vendorIdx],
            renderer: renderers[rendererIdx],
        };
    }

    /**
     * Generate simulated font list
     * @private
     */
    _fontList(seed) {
        if (!this.fontSimulation) {
            return ['Arial', 'Helvetica', 'sans-serif'];
        }

        const fontFamilies = [
            'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS',
            'Times New Roman', 'Georgia', 'Garamond', 'Courier New',
            'Comic Sans MS', 'Impact', 'Lucida Console', 'Lucida Sans',
            'Palatino Linotype', 'Book Antiqua', 'Century Gothic',
            'Candara', 'Consolas', 'Segoe UI', 'Roboto', 'Open Sans',
            'Lato', 'Montserrat', 'Source Sans Pro', 'Ubuntu', 'Cantarell',
        ];

        // Deterministic subset selection
        const numFonts = 8 + (parseInt(seed.charCodeAt(2)) % 8); // 8-15 fonts
        const fonts = [];

        for (let i = 0; i < numFonts; i++) {
            const idx = (parseInt(seed.charCodeAt(i % seed.length)) + i) % fontFamilies.length;
            fonts.push(fontFamilies[idx]);
        }

        return [...new Set(fonts)]; // Remove duplicates
    }

    /**
     * Generate TLS fingerprint (JA3-like)
     * @private
     */
    _tlsFingerprint(seed) {
        if (!this.tlsFingerprint) {
            return null;
        }

        // Common browser TLS fingerprints
        const tlsVersions = ['TLS 1.3', 'TLS 1.2', 'TLS 1.2'];
        const cipherSuites = [
            '0x1301,0x1302,0x1303', // Chrome TLS 1.3
            '0xc02b,0xc02f,0xc030,0xc02c,0xc030,0xcca9,0xcca8,0xc02b,0xc02f', // Chrome TLS 1.2
            '0x002f,0x0035,0x000a,0x000d,0x0013,0x0012', // Firefox
        ];

        const versionIdx = parseInt(seed.charCodeAt(3)) % tlsVersions.length;
        const cipherIdx = parseInt(seed.charCodeAt(4)) % cipherSuites.length;

        return {
            version: tlsVersions[versionIdx],
            cipherSuites: cipherSuites[cipherIdx],
        };
    }

    /**
     * Generate a pool of fingerprints
     * @param {number} count - Number of fingerprints to generate
     * @returns {Array} Array of fingerprint objects
     */
    _generatePool(count) {
        const fingerprints = [];

        const userAgents = [
            // Windows Chrome (latest versions)
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            // macOS Chrome
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            // macOS Safari
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            // Linux Chrome
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            // Firefox Windows
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
            // Firefox macOS
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
            // Firefox Linux
            'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
            // Edge
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
            // Opera
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
        ];

        const resolutions = [
            { width: 1920, height: 1080 },
            { width: 1366, height: 768 },
            { width: 1536, height: 864 },
            { width: 1440, height: 900 },
            { width: 1280, height: 720 },
            { width: 2560, height: 1440 },
            { width: 1680, height: 1050 },
            { width: 1920, height: 1200 },
            { width: 1600, height: 900 },
            { width: 1360, height: 768 },
        ];

        const timezones = [
            'America/New_York',
            'America/Chicago',
            'America/Denver',
            'America/Los_Angeles',
            'America/Toronto',
            'America/Vancouver',
            'America/Mexico_City',
            'America/Sao_Paulo',
            'Europe/London',
            'Europe/Paris',
            'Europe/Berlin',
            'Europe/Amsterdam',
            'Europe/Madrid',
            'Asia/Tokyo',
            'Asia/Shanghai',
            'Asia/Hong_Kong',
            'Asia/Singapore',
            'Asia/Seoul',
            'Australia/Sydney',
            'UTC',
        ];

        const languages = [
            'en-US,en;q=0.9',
            'en-US,en;q=0.9,es;q=0.8',
            'en-GB,en;q=0.9',
            'en-US,en;q=0.9,fr;q=0.8',
            'en-US,en;q=0.9,de;q=0.8',
            'en-US,en;q=0.9,zh-CN;q=0.8',
            'en-US,en;q=0.9,ja;q=0.8',
            'en-US,en;q=0.9,ko;q=0.8',
            'en-CA,en;q=0.9,fr;q=0.8',
            'en-AU,en;q=0.9',
        ];

        const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];

        const hardwareConcurrency = [2, 4, 6, 8, 12, 16];
        const deviceMemory = [4, 8, 16, 32];

        for (let i = 0; i < count; i++) {
            const seed = Math.random().toString(36).substring(2, 10);
            const canvasSeed = this._canvasHash(seed);
            const webgl = this._webglFingerprint(seed);
            const fonts = this._fontList(seed);
            const tls = this._tlsFingerprint(seed);

            fingerprints.push({
                // Basic fingerprint
                userAgent: userAgents[i % userAgents.length],
                resolution: resolutions[i % resolutions.length],
                timezone: timezones[i % timezones.length],
                language: languages[i % languages.length],
                platform: platforms[i % platforms.length],

                // Hardware
                hardwareConcurrency: hardwareConcurrency[i % hardwareConcurrency.length],
                deviceMemory: deviceMemory[i % deviceMemory.length],
                colorDepth: [24, 32][i % 2],
                pixelRatio: [1, 1.25, 1.5, 2][i % 4],

                // Canvas fingerprint
                canvasSeed: canvasSeed,
                canvasHash: this._canvasHash(canvasSeed),

                // WebGL
                webglVendor: webgl.vendor,
                webglRenderer: webgl.renderer,

                // Fonts
                fonts: fonts,

                // TLS
                tlsFingerprint: tls,

                // Privacy
                doNotTrack: '1',
                cookiesEnabled: true,
                javascriptEnabled: true,

                // Connection
                connectionType: 'unknown',

                // Storage
                sessionStorage: true,
                localStorage: true,
                indexedDB: true,

                // WebRTC
                webrtcIP: this.webrtcBlocking ? null : '0.0.0.0',
            });
        }

        return fingerprints;
    }

    /**
     * Get next fingerprint in pool (sequential)
     * @returns {Object} Fingerprint object
     */
    getNext() {
        const fp = this.fingerprints[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.fingerprints.length;
        return fp;
    }

    /**
     * Get random fingerprint from pool
     * @returns {Object} Random fingerprint object
     */
    getRandom() {
        const index = Math.floor(Math.random() * this.fingerprints.length);
        return this.fingerprints[index];
    }

    /**
     * Get fingerprint based on strategy
     * @param {string} strategy - 'sequential' or 'random'
     * @returns {Object} Fingerprint object
     */
    get(strategy = 'random') {
        if (strategy === 'sequential') {
            return this.getNext();
        }
        return this.getRandom();
    }

    /**
     * Generate HTTP headers from fingerprint
     * @param {Object} fp - Fingerprint object
     * @returns {Object} Headers object
     */
    getHeaders(fp) {
        const headers = {
            'User-Agent': fp.userAgent,
            'Accept-Language': fp.language,
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': fp.doNotTrack,
            'Sec-Ch-Ua': `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`,
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': `"${fp.platform}"`,
            'Sec-Ch-Ua-Full-Version': '"120.0.0.0"',
            'Sec-Ch-Ua-Bitness': `"${fp.hardwareConcurrency}"`,
            'Upgrade-Insecure-Requests': '1',
        };

        return headers;
    }

    /**
     * Get WebRTC configuration for blocking leaks
     * @param {Object} fp - Fingerprint object
     * @returns {Object} WebRTC config
     */
    getWebRTCConfig(fp) {
        if (this.webrtcBlocking) {
            return {
                enabled: false,
                config: {
                    iceServers: [],
                },
            };
        }

        return {
            enabled: true,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                ],
            },
        };
    }

    /**
     * Get fonts for CSS injection
     * @param {Object} fp - Fingerprint object
     * @returns {string} Font family string
     */
    getFontFamily(fp) {
        return fp.fonts.join(', ');
    }

    /**
     * Get Crawl4AI options from fingerprint
     * @param {Object} fp - Fingerprint object
     * @returns {Object} Crawl4AI options
     */
    getCrawlOptions(fp) {
        const options = {
            viewport: {
                width: fp.resolution.width,
                height: fp.resolution.height,
            },
            timezone: fp.timezone,
            headers: this.getHeaders(fp),
            // Randomize canvas fingerprint
            canvasFingerprintSeed: fp.canvasSeed,
            // Screen properties
            screenWidth: fp.resolution.width,
            screenHeight: fp.resolution.height,
        };

        // Add WebGL spoofing if enabled
        if (this.webglRandomization) {
            options.extraHTTPHeaders = {
                'X-WebGL-Vendor': fp.webglVendor,
                'X-WebGL-Renderer': fp.webglRenderer,
            };
        }

        return options;
    }

    /**
     * Get proxy configuration
     * @param {Object} fp - Fingerprint object
     * @returns {Object} Proxy config
     */
    getProxyConfig(fp) {
        return {
            type: fp.connectionType || 'direct',
        };
    }

    /**
     * Regenerate fingerprint pool
     * @param {number} size - New pool size
     */
    regenerate(size = null) {
        if (size) {
            this.poolSize = size;
        }
        this.fingerprints = this._generatePool(this.poolSize);
        this.currentIndex = 0;
        logger.info('Fingerprint pool regenerated', { poolSize: this.poolSize });
    }

    /**
     * Get current hardware profile info
     * @returns {Object} Hardware info
     */
    getHardwareInfo() {
        return {
            profile: HARDWARE_PROFILE,
            limits: hwLimits,
        };
    }
}

// Export singleton with hardware-aware initialization
const fingerprintManager = new FingerprintManager({
    poolSize: parseInt(process.env.FINGERPRINT_POOL_SIZE || hwLimits.poolSize),
    randomizePerRequest: process.env.RANDOMIZE_FINGERPRINT !== undefined
        ? process.env.RANDOMIZE_FINGERPRINT === 'true'
        : hwLimits.randomizePerRequest,
});

module.exports = fingerprintManager;
module.exports.FingerprintManager = FingerprintManager;
module.exports.HARDWARE_PROFILE = HARDWARE_PROFILE;
