'use strict';

/**
 * Bearer token authentication middleware.
 * Validates Authorization header against OPENCLAW_TOKEN.
 *
 * @module middleware/auth
 */

const config = require('../config');
const logger = require('../services/logger');

/**
 * Express middleware that checks Bearer token.
 * Returns 401 if token is missing or invalid.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Auth failed: missing or malformed Authorization header', {
            ip: req.ip,
            path: req.path,
        });
        return res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
    }

    const token = authHeader.slice(7);

    if (token !== config.OPENCLAW_TOKEN) {
        logger.warn('Auth failed: invalid token', { ip: req.ip, path: req.path });
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }

    next();
}

module.exports = authMiddleware;
