'use strict';

/**
 * Nextcloud CSV Export Writer.
 * Writes scraped data to Nextcloud data mount for immediate UI visibility.
 * 
 * Path: /var/www/html/data/{NC_ADMIN_USER}/files/Crawls/{task_id}.csv
 * 
 * @module services/scraper/nextcloudWriter
 */

const fs = require('fs');
const path = require('path');
const { Parser } = require('json2csv');
const logger = require('../logger');
const config = require('../../config');

/**
 * Nextcloud mount configuration
 */
const NEXTCLOUD_CONFIG = {
    dataPath: process.env.NEXTCLOUD_DATA_PATH || '/var/www/html/data',
    adminUser: process.env.NEXTCLOUD_ADMIN_USER || 'admin',
    crawlsFolder: 'Crawls'
};

// Cache for availability check (30 second TTL)
let _availabilityCache = null;
let _lastCheckTime = 0;

/**
 * Smart field mapping for WooCommerce-compatible export
 * Maps scraped fields to WooCommerce import fields
 */
const WOOCOMMERCE_FIELD_MAP = {
    // WooCommerce CSV columns
    ID: 'id',
    Type: 'type',
    SKU: 'sku',
    Name: 'title',
    Published: 'published',
    'Short description': 'short_description',
    Description: 'description',
    'Regular price': 'price',
    'Sale price': 'sale_price',
    'Tax status': 'tax_status',
    'Tax class': 'tax_class',
    Stock: 'stock',
    'Stock status': 'stock_status',
    'Backorders allowed': 'backorders',
    'Sold individually': 'sold_individually',
    'Weight (kg)': 'weight',
    'Length (cm)': 'length',
    'Width (cm)': 'width',
    'Height (cm)': 'height',
    'Allow customer reviews': 'reviews_allowed',
    'Categories': 'categories',
    Tags: 'tags',
    'Shipping class': 'shipping_class',
    Images: 'images',
    'Download limit': 'download_limit',
    'Download expiry': 'download_expiry',
    Parent: 'parent_sku',
    'Grouped products': 'grouped_products',
    Upsells: 'upsell_ids',
    'Cross-sells': 'cross_sell_ids',
    'External URL': 'external_url',
    'Button text': 'button_text',
    Position: 'position'
};

/**
 * Default scraper fields
 */
const DEFAULT_FIELDS = [
    'url',
    'title',
    'content',
    'extracted_at',
    'job_id'
];

/**
 * Export formats
 */
const EXPORT_FORMATS = {
    WOOCOMMERCE: 'woocommerce',
    SIMPLE: 'simple',
    PRODUCTS: 'products',
    CATEGORIES: 'categories'
};

/**
 * Get Nextcloud export path
 * @param {string} jobId - Job ID
 * @returns {string} Full path to CSV file
 */
function getExportPath(jobId) {
    const basePath = path.join(
        NEXTCLOUD_CONFIG.dataPath,
        NEXTCLOUD_CONFIG.adminUser,
        'files',
        NEXTCLOUD_CONFIG.crawlsFolder
    );

    // Ensure directory exists
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
        logger.info('Created Nextcloud Crawls directory', { path: basePath });
    }

    return path.join(basePath, `${jobId}.csv`);
}

/**
 * Transform scraped data to one or more WooCommerce rows (Parent + Variations)
 * @param {object} item - Scraped item (might contain item.variants)
 * @returns {object[]} Array of WooCommerce-formatted rows
 */
function transformToWooCommerce(item) {
    const rows = [];
    const parentSku = item.sku || item.product_id || `scraped-${Date.now()}`;

    // 1. Create Parent Row
    const parentRow = {
        ID: '',
        Type: item.variants?.length > 0 ? 'variable' : 'simple',
        SKU: parentSku,
        Name: item.title || item.name || '',
        Published: '1',
        'Short description': item.summary || item.excerpt || '',
        Description: item.content || item.description || '',
        'Regular price': item.price || item.regular_price || '',
        'Sale price': item.sale_price || '',
        Stock: item.stock_quantity || item.stock || '',
        'Stock status': item.stock_status || (item.in_stock ? 'instock' : 'outofstock'),
        'Weight (kg)': item.weight || '',
        'Dimensions (L×W×H cm)': item.dimensions || '',
        Parent: ''
    };

    // Images & Categories
    if (item.categories && Array.isArray(item.categories)) {
        parentRow.Categories = item.categories.join('; ');
    } else if (item.category) {
        parentRow.Categories = item.category;
    }

    if (item.tags && Array.isArray(item.tags)) {
        parentRow.Tags = item.tags.join(', ');
    }

    if (item.images && Array.isArray(item.images)) {
        parentRow.Images = item.images.join(', ');
    } else if (item.image) {
        parentRow.Images = item.image;
    }

    // Attributes hint for parent
    if (item.variants?.length > 0) {
        parentRow['Attribute 1 name'] = 'Size/Color/Variant';
        parentRow['Attribute 1 value'] = item.variants.map(v => v.sku || v.name || 'Variant').join(', ');
        parentRow['Attribute 1 visible'] = '1';
        parentRow['Attribute 1 global'] = '1';
    }

    parentRow['Meta: _scraped_url'] = item.url || '';
    parentRow['Meta: _scraped_at'] = item.extracted_at || '';

    rows.push(parentRow);

    // 2. Create Child Rows (Variations)
    if (item.variants && Array.isArray(item.variants)) {
        for (const variant of item.variants) {
            const childRow = {
                ID: '',
                Type: 'variation',
                SKU: variant.sku || `${parentSku}-${variant.name || 'var'}`,
                Name: `${parentRow.Name} - ${variant.name || variant.sku}`,
                Published: '1',
                'Regular price': variant.price || parentRow['Regular price'],
                'Sale price': variant.sale_price || '',
                Stock: variant.stock || '',
                'Stock status': 'instock',
                Parent: parentSku,
                'Attribute 1 name': 'Size/Color/Variant',
                'Attribute 1 value': variant.sku || variant.name || 'Variant'
            };
            rows.push(childRow);
        }
    }

    return rows;
}

/**
 * Transform to simple CSV format
 * @param {object} item - Scraped item
 * @returns {object} Simple format
 */
function transformToSimple(item) {
    return {
        url: item.url || '',
        title: item.title || item.name || '',
        content: item.content ? item.content.substring(0, 500) : '',
        extracted_at: item.extracted_at || '',
        job_id: item.job_id || ''
    };
}

/**
 * Export scraped data to Nextcloud CSV
 * @param {string} jobId - Job ID
 * @param {object[]} data - Scraped data items
 * @param {string} format - Export format (woocommerce, simple)
 * @returns {Promise<{path: string, rows: number}>} Export result
 */
async function exportToNextcloud(jobId, data, format = 'simple') {
    logger.info('Starting Nextcloud export', { jobId, count: data.length, format });

    const exportPath = getExportPath(jobId);

    // Transform data based on format
    let transformedData;
    let fields;

    switch (format) {
        case EXPORT_FORMATS.WOOCOMMERCE:
            transformedData = data.flatMap(transformToWooCommerce);
            fields = Object.keys(WOOCOMMERCE_FIELD_MAP);
            break;

        case EXPORT_FORMATS.PRODUCTS:
            transformedData = data.map(item => ({
                url: item.url || '',
                name: item.title || item.name || '',
                price: item.price || '',
                sku: item.sku || item.product_id || '',
                stock: item.stock || '',
                category: item.category || '',
                image: item.image || item.images?.[0] || '',
                description: item.description || item.content || ''
            }));
            fields = ['url', 'name', 'price', 'sku', 'stock', 'category', 'image', 'description'];
            break;

        case EXPORT_FORMATS.CATEGORIES:
            transformedData = data.map(item => ({
                url: item.url || '',
                name: item.title || item.name || '',
                parent: item.parent_category || '',
                description: item.description || ''
            }));
            fields = ['url', 'name', 'parent', 'description'];
            break;

        case EXPORT_FORMATS.SIMPLE:
        default:
            transformedData = data.map(transformToSimple);
            fields = DEFAULT_FIELDS;
            break;
    }

    try {
        const parser = new Parser({ fields });
        const csv = parser.parse(transformedData);

        fs.writeFileSync(exportPath, csv, 'utf8');

        logger.info('Nextcloud export completed', {
            path: exportPath,
            rows: transformedData.length,
            format
        });

        return {
            path: exportPath,
            rows: transformedData.length,
            format,
            url: `/Crawls/${jobId}.csv`  // Nextcloud web URL path
        };

    } catch (error) {
        logger.error('Nextcloud export failed', {
            jobId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Check if Nextcloud export is available
 * Uses caching to avoid frequent filesystem checks on network mounts
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
    // Use cached result if recent (30 seconds)
    const now = Date.now();
    if (_availabilityCache !== null && (now - _lastCheckTime) < 30000) {
        return _availabilityCache;
    }

    try {
        const testPath = path.join(
            NEXTCLOUD_CONFIG.dataPath,
            NEXTCLOUD_CONFIG.adminUser,
            'files'
        );

        // Try to access the path with proper error handling
        try {
            fs.accessSync(testPath, fs.constants.R_OK);
            _availabilityCache = true;
        } catch (accessErr) {
            // Path doesn't exist or isn't accessible
            if (accessErr.code === 'ENOENT') {
                _availabilityCache = false;
            } else if (accessErr.code === 'EACCES') {
                // Permission denied - might be network mount issue
                logger.warn('Nextcloud path permission denied, may be network mount issue', {
                    path: testPath,
                    error: accessErr.message
                });
                _availabilityCache = false;
            } else {
                throw accessErr; // Re-throw other errors
            }
        }
    } catch (error) {
        logger.warn('Nextcloud availability check failed', { error: error.message });
        _availabilityCache = false;
    }

    _lastCheckTime = Date.now();
    return _availabilityCache;
}

/**
 * Get list of exported files
 * @returns {string[]} List of job IDs with exports
 */
function listExports() {
    const crawlsPath = path.join(
        NEXTCLOUD_CONFIG.dataPath,
        NEXTCLOUD_CONFIG.adminUser,
        'files',
        NEXTCLOUD_CONFIG.crawlsFolder
    );

    if (!fs.existsSync(crawlsPath)) {
        return [];
    }

    const files = fs.readdirSync(crawlsPath)
        .filter(f => f.endsWith('.csv'))
        .map(f => f.replace('.csv', ''));

    return files;
}

module.exports = {
    exportToNextcloud,
    isAvailable,
    listExports,
    getExportPath,
    transformToWooCommerce,
    EXPORT_FORMATS
};
