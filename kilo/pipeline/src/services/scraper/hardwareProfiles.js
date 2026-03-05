'use strict';

/**
 * Hardware Profiles Module - Consolidated definitions for all scraper hardware configurations.
 * 
 * This module centralizes all hardware profile definitions to avoid duplication across:
 * - config.js (ANTI_DETECTION_PROFILES)
 * - fingerprintManager.js (HARDWARE_LIMITS)
 * - hybridNetworkManager.js (LOW_END_PROFILES)
 * - wifiRotationManager.js (LOW_END_PROFILES)
 * 
 * @module services/scraper/hardwareProfiles
 */

/**
 * Current hardware profile from environment
 * Defaults to 'n100_like' if not specified.
 * @type {string}
 */
const HARDWARE_PROFILE = process.env.HARDWARE_PROFILE || 'n100_like';

/**
 * Low-end profiles that should use conservative settings
 * @type {string[]}
 */
const LOW_END_PROFILES = ['n100_like', 'celeron', 'arm64_rpi5', 'amd_low'];

/**
 * Check if current hardware is low-end
 * @returns {boolean} True if hardware is low-end
 */
function isLowEnd() {
    return LOW_END_PROFILES.includes(HARDWARE_PROFILE);
}

/**
 * Get the current hardware profile
 * @returns {string} Current hardware profile name
 */
function getHardwareProfile() {
    return HARDWARE_PROFILE;
}

/**
 * Get a specific hardware profile configuration
 * @param {string} [profile] - Profile name, defaults to current hardware profile
 * @returns {object} Hardware profile configuration
 */
function getProfileForHardware(profile) {
    const targetProfile = profile || HARDWARE_PROFILE;
    return HARDWARE_PROFILES[targetProfile] || HARDWARE_PROFILES.n100_like;
}

/**
 * Anti-detection profiles for scraper modules.
 * These define settings for fingerprint, ipv6, tor, i2p, wifi rotation, and fallback.
 * Based on hardware capability - low-end devices use reduced complexity.
 */
const ANTI_DETECTION_PROFILES = {
    // Low-end: N100, Celeron, ARM - reduced complexity
    n100_like: {
        fingerprint: { poolSize: 5, randomizePerRequest: false, advanced: true },
        ipv6: { enabled: true, preferIPv6: false },
        tor: { enabled: false },  // Too slow for low-end
        i2p: { enabled: false },
        wifiRotation: { enabled: true, aggressive: false },
        fallback: { maxRetries: 3, useHeavyMethods: false },
    },
    celeron: {
        fingerprint: { poolSize: 5, randomizePerRequest: false, advanced: true },
        ipv6: { enabled: true, preferIPv6: false },
        tor: { enabled: false },
        i2p: { enabled: false },
        wifiRotation: { enabled: true, aggressive: false },
        fallback: { maxRetries: 3, useHeavyMethods: false },
    },
    arm64_rpi5: {
        fingerprint: { poolSize: 5, randomizePerRequest: false, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: false },
        i2p: { enabled: true },  // I2P lighter than Tor
        wifiRotation: { enabled: true, aggressive: false },
        fallback: { maxRetries: 3, useHeavyMethods: false },
    },
    // N305: 8-core N-series, more capable than N100 but still low-power
    n305: {
        fingerprint: { poolSize: 8, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: false },
        fallback: { maxRetries: 4, useHeavyMethods: false },
    },
    amd_low: {
        fingerprint: { poolSize: 5, randomizePerRequest: false, advanced: true },
        ipv6: { enabled: true, preferIPv6: false },
        tor: { enabled: false },
        i2p: { enabled: false },
        wifiRotation: { enabled: true, aggressive: false },
        fallback: { maxRetries: 3, useHeavyMethods: false },
    },
    arm64_server: {
        fingerprint: { poolSize: 10, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 5, useHeavyMethods: true },
    },
    arm64_rk3588: {
        fingerprint: { poolSize: 15, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 7, useHeavyMethods: true },
    },
    // Mid-range: i3, AMD mid - moderate
    core_i3: {
        fingerprint: { poolSize: 10, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 5, useHeavyMethods: true },
    },
    amd_mid: {
        fingerprint: { poolSize: 10, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 5, useHeavyMethods: true },
    },
    // High, i7, AMD high, Nvidia-end: i5 - full features
    core_i5: {
        fingerprint: { poolSize: 15, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 7, useHeavyMethods: true },
    },
    core_i7: {
        fingerprint: { poolSize: 20, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 10, useHeavyMethods: true },
    },
    amd_high: {
        fingerprint: { poolSize: 20, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 10, useHeavyMethods: true },
    },
    nvidia_small: {
        fingerprint: { poolSize: 15, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 7, useHeavyMethods: true },
    },
    nvidia_medium: {
        fingerprint: { poolSize: 20, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 10, useHeavyMethods: true },
    },
    nvidia_large: {
        fingerprint: { poolSize: 25, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 10, useHeavyMethods: true },
    },
    apple_silicon: {
        fingerprint: { poolSize: 20, randomizePerRequest: true, advanced: true },
        ipv6: { enabled: true, preferIPv6: true },
        tor: { enabled: true, circuitRotation: true },
        i2p: { enabled: true },
        wifiRotation: { enabled: true, aggressive: true },
        fallback: { maxRetries: 10, useHeavyMethods: true },
    },
};

/**
 * Hardware limits for fingerprint manager.
 * Defines complexity limits based on hardware capability.
 */
const HARDWARE_LIMITS = {
    // Low-end: N100, Celeron, ARM
    n100_like: {
        poolSize: 5,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: false,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: false, // Too expensive
    },
    celeron: {
        poolSize: 5,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: false,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: false,
    },
    arm64_rpi5: {
        poolSize: 5,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: false,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: false,
    },
    n305: {
        poolSize: 8,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    amd_low: {
        poolSize: 5,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: false,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: false,
    },
    arm64_server: {
        poolSize: 10,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    arm64_rk3588: {
        poolSize: 15,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    // Mid-range: i3, i5, AMD mid
    core_i3: {
        poolSize: 10,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    amd_mid: {
        poolSize: 10,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    // High-end: i7, AMD high, Nvidia, Apple Silicon
    core_i5: {
        poolSize: 15,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    core_i7: {
        poolSize: 20,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    amd_high: {
        poolSize: 20,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    nvidia_small: {
        poolSize: 15,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    nvidia_medium: {
        poolSize: 20,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    nvidia_large: {
        poolSize: 25,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    apple_silicon: {
        poolSize: 20,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
    // Default fallback
    default: {
        poolSize: 10,
        canvasNoise: true,
        webglRandomization: true,
        fontSimulation: true,
        webrtcBlocking: true,
        tlsFingerprint: true,
        randomizePerRequest: true,
    },
};

/**
 * Unified HARDWARE_PROFILES object containing all profile definitions.
 * This is the main export that includes all hardware-specific settings.
 */
const HARDWARE_PROFILES = {
    // Profile metadata
    ...ANTI_DETECTION_PROFILES,

    // Additional metadata
    _metadata: {
        lowEndProfiles: LOW_END_PROFILES,
        currentProfile: HARDWARE_PROFILE,
    },
};

// Get hardware limits for current profile
const hwLimits = HARDWARE_LIMITS[HARDWARE_PROFILE] || HARDWARE_LIMITS.default;

module.exports = {
    // Core profile data
    HARDWARE_PROFILES,
    HARDWARE_PROFILE,
    LOW_END_PROFILES,
    ANTI_DETECTION_PROFILES,
    HARDWARE_LIMITS,

    // Helper functions
    getHardwareProfile,
    isLowEnd,
    getProfileForHardware,

    // Current hardware limits (for convenience)
    hwLimits,
};
