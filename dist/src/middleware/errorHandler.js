"use strict";
/**
 * Global Error Handler Middleware
 *
 * This middleware handles all errors thrown in the application,
 * formats them consistently, and returns appropriate HTTP responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCORSError = exports.handleRateLimitError = exports.handleJWTError = exports.handleMongoDuplicateError = exports.handleMongooseValidationError = exports.getErrorHandler = exports.productionErrorHandler = exports.developmentErrorHandler = exports.handleValidationErrors = exports.asyncHandler = exports.notFoundHandler = exports.globalErrorHandler = void 0;
const tenant_1 = require("../config/tenant");
const errors_1 = require("../utils/errors");
/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
const globalErrorHandler = (err, req, res, _next) => {
    let error = err;
    // Log the error for monitoring
    (0, errors_1.logError)(error, {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?._id?.toString(),
    });
    // Translate known error types
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
        error = (0, errors_1.translateDatabaseError)(error);
    }
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        error = new errors_1.AuthenticationError('Invalid or expired token');
    }
    if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
        error = new errors_1.ValidationError('Invalid JSON in request body', [
            { field: 'body', message: 'Invalid JSON format' }
        ]);
    }
    // Format error response
    const errorResponse = (0, errors_1.formatErrorResponse)(error, req.path, req.method, tenant_1.derivedConfig.isDevelopment);
    // Set status code
    const statusCode = error instanceof errors_1.ApiError ? error.statusCode : 500;
    res.status(statusCode).json(errorResponse);
};
exports.globalErrorHandler = globalErrorHandler;
/**
 * Handle 404 errors for undefined routes
 */
const notFoundHandler = (req, res, next) => {
    const error = new errors_1.ApiError(`Route ${req.originalUrl} not found`, 404);
    next(error);
};
exports.notFoundHandler = notFoundHandler;
/**
 * Handle async route errors
 * Wrapper function for async route handlers
 */
const asyncHandler = (fn) => {
    return (req, res, next, ...args) => {
        Promise.resolve(fn(req, res, next, ...args)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
/**
 * Handle validation errors from express-validator
 */
const handleValidationErrors = (req, res, next) => {
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const validationError = errors_1.ValidationError.fromExpressValidator(errors.array(), 'Request validation failed');
        return next(validationError);
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
/**
 * Development error handler - shows full error details
 */
const developmentErrorHandler = (err, req, res, next) => {
    console.error('=== DEVELOPMENT ERROR DETAILS ===');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    console.error('Stack Trace:', err.stack);
    console.error('Request URL:', req.url);
    console.error('Request Method:', req.method);
    console.error('Request Body:', JSON.stringify(req.body, null, 2));
    console.error('Request Query:', JSON.stringify(req.query, null, 2));
    console.error('Request Params:', JSON.stringify(req.params, null, 2));
    console.error('=== END ERROR DETAILS ===');
    (0, exports.globalErrorHandler)(err, req, res, next);
};
exports.developmentErrorHandler = developmentErrorHandler;
/**
 * Production error handler - hides sensitive details
 */
const productionErrorHandler = (err, req, res, next) => {
    // Only log operational errors in production
    if ((0, errors_1.isOperationalError)(err)) {
        (0, errors_1.logError)(err, {
            url: req.url,
            method: req.method,
            ip: req.ip,
            userId: req.user?._id?.toString(),
        });
    }
    else {
        // Log programming errors but don't expose details
        (0, errors_1.logError)(new errors_1.ApiError('Internal server error', 500, false), {
            originalError: err.name,
            url: req.url,
            method: req.method,
        });
    }
    (0, exports.globalErrorHandler)(err, req, res, next);
};
exports.productionErrorHandler = productionErrorHandler;
/**
 * Get appropriate error handler based on environment
 */
const getErrorHandler = () => {
    return tenant_1.derivedConfig.isDevelopment ? exports.developmentErrorHandler : exports.productionErrorHandler;
};
exports.getErrorHandler = getErrorHandler;
/**
 * Handle specific MongoDB errors
 */
const handleMongooseValidationError = (err) => {
    const fields = Object.keys(err.errors).map(key => ({
        field: key,
        message: err.errors[key].message,
        value: err.errors[key].value,
    }));
    return new errors_1.ValidationError('Database validation failed', fields, {
        model: err.model?.modelName,
    });
};
exports.handleMongooseValidationError = handleMongooseValidationError;
/**
 * Handle MongoDB duplicate key errors
 */
const handleMongoDuplicateError = (err) => {
    const field = Object.keys(err.keyValue)?.[0];
    if (!field) {
        return new errors_1.ApiError('Duplicate key error', 409, true, { originalError: err });
    }
    const value = err.keyValue[field];
    return new errors_1.ApiError(`${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`, 409, true, { field, value });
};
exports.handleMongoDuplicateError = handleMongoDuplicateError;
/**
 * Handle JWT errors
 */
const handleJWTError = (err) => {
    if (err.name === 'TokenExpiredError') {
        return new errors_1.AuthenticationError('Token has expired, please log in again');
    }
    if (err.name === 'JsonWebTokenError') {
        return new errors_1.AuthenticationError('Invalid token, please log in again');
    }
    return new errors_1.AuthenticationError('Authentication failed');
};
exports.handleJWTError = handleJWTError;
/**
 * Rate limiting error handler
 */
const handleRateLimitError = (req, res) => {
    const error = new errors_1.ApiError('Too many requests, please try again later', 429);
    const errorResponse = (0, errors_1.formatErrorResponse)(error, req.path, req.method, tenant_1.derivedConfig.isDevelopment);
    res.status(429).json(errorResponse);
};
exports.handleRateLimitError = handleRateLimitError;
/**
 * CORS error handler
 */
const handleCORSError = (req, res) => {
    const error = new errors_1.ApiError('CORS policy violation', 403);
    const errorResponse = (0, errors_1.formatErrorResponse)(error, req.path, req.method, tenant_1.derivedConfig.isDevelopment);
    res.status(403).json(errorResponse);
};
exports.handleCORSError = handleCORSError;
exports.default = exports.globalErrorHandler;
//# sourceMappingURL=errorHandler.js.map