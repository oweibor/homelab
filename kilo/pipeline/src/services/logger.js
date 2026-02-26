'use strict';

/**
 * Structured JSON logger using Winston.
 * Console transport only — Docker captures stdout/stderr.
 *
 * @module services/logger
 */

const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.errors({ stack: true }),
        format.json()
    ),
    defaultMeta: { service: 'kilo-pipeline' },
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize({ all: process.env.NODE_ENV !== 'production' }),
                format.printf(({ timestamp, level, message, service, ...meta }) => {
                    const metaStr = Object.keys(meta).length
                        ? ` ${JSON.stringify(meta)}`
                        : '';
                    return `${timestamp} [${service}] ${level}: ${message}${metaStr}`;
                })
            ),
        }),
    ],
});

module.exports = logger;
