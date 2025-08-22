"use strict";
/**
 * Custom Error Classes and Error Handling Utilities
 *
 * This module provides comprehensive error handling with custom error types,
 * consistent API responses, and proper error logging.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUncaughtException = exports.handleUnhandledRejection = exports.logError = exports.withErrorHandling = exports.catchAsync = exports.translateDatabaseError = exports.formatErrorResponse = exports.isOperationalError = exports.BusinessLogicError = exports.ExternalServiceError = exports.DatabaseError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.ApiError = void 0;
// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================
/**
 * Base API Error class with status code and additional context
 */
class ApiError extends Error {
    constructor(message, statusCode = 500, isOperational = true, context) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.context = context;
        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ApiError = ApiError;
/**
 * Validation Error for input validation failures
 */
class ValidationError extends ApiError {
    constructor(message, fields, context) {
        super(message, 400, true, context);
        this.fields = fields;
    }
    static fromExpressValidator(errors, message = 'Validation failed') {
        const fields = errors.map(error => ({
            field: error.type === 'field' ? error.path : 'unknown',
            message: error.msg,
            value: error.type === 'field' ? error.value : undefined,
        }));
        return new ValidationError(message, fields);
    }
}
exports.ValidationError = ValidationError;
/**
 * Authentication Error for auth failures
 */
class AuthenticationError extends ApiError {
    constructor(message = 'Authentication failed', context) {
        super(message, 401, true, context);
    }
}
exports.AuthenticationError = AuthenticationError;
/**
 * Authorization Error for permission failures
 */
class AuthorizationError extends ApiError {
    constructor(message = 'Insufficient permissions', context) {
        super(message, 403, true, context);
    }
}
exports.AuthorizationError = AuthorizationError;
/**
 * Not Found Error for missing resources
 */
class NotFoundError extends ApiError {
    constructor(message = 'Resource not found', resource, resourceId, context) {
        super(message, 404, true, context);
        this.resource = resource;
        this.resourceId = resourceId;
    }
}
exports.NotFoundError = NotFoundError;
/**
 * Conflict Error for resource conflicts
 */
class ConflictError extends ApiError {
    constructor(message, context) {
        super(message, 409, true, context);
    }
}
exports.ConflictError = ConflictError;
/**
 * Rate Limit Error for too many requests
 */
class RateLimitError extends ApiError {
    constructor(message = 'Rate limit exceeded', retryAfter, context) {
        super(message, 429, true, context);
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
/**
 * Database Error for database-related issues
 */
class DatabaseError extends ApiError {
    constructor(message, operation, collection, context) {
        super(message, 500, true, context);
        this.operation = operation;
        this.collection = collection;
    }
}
exports.DatabaseError = DatabaseError;
/**
 * External Service Error for third-party API failures
 */
class ExternalServiceError extends ApiError {
    constructor(message, service, originalError, context) {
        super(message, 502, true, context);
        this.service = service;
        this.originalError = originalError;
    }
}
exports.ExternalServiceError = ExternalServiceError;
/**
 * Business Logic Error for domain-specific failures
 */
class BusinessLogicError extends ApiError {
    constructor(message, code, statusCode = 400, context) {
        super(message, statusCode, true, context);
        this.code = code;
    }
}
exports.BusinessLogicError = BusinessLogicError;
// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================
/**
 * Determines if an error is operational (expected) or programming error
 */
const isOperationalError = (error) => {
    if (error instanceof ApiError) {
        return error.isOperational;
    }
    return false;
};
exports.isOperationalError = isOperationalError;
/**
 * Formats error for API response
 */
const formatErrorResponse = (error, path, method, isDevelopment = false) => {
    const timestamp = new Date().toISOString();
    if (error instanceof ValidationError) {
        const response = {
            success: false,
            error: 'VALIDATION_ERROR',
            message: error.message,
            statusCode: error.statusCode,
            timestamp,
            validation: error.fields,
        };
        if (path !== undefined)
            response.path = path;
        if (method !== undefined)
            response.method = method;
        if (error.context !== undefined)
            response.context = error.context;
        if (isDevelopment && error.stack)
            response.stack = error.stack;
        return response;
    }
    if (error instanceof ApiError) {
        const response = {
            success: false,
            error: error.name.replace('Error', '').toUpperCase(),
            message: error.message,
            statusCode: error.statusCode,
            timestamp,
        };
        if (path !== undefined)
            response.path = path;
        if (method !== undefined)
            response.method = method;
        if (error.context !== undefined)
            response.context = error.context;
        if (isDevelopment && error.stack)
            response.stack = error.stack;
        return response;
    }
    // Handle MongoDB errors
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
        const dbError = (0, exports.translateDatabaseError)(error);
        return (0, exports.formatErrorResponse)(dbError, path, method, isDevelopment);
    }
    // Handle JWT errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        const authError = new AuthenticationError('Invalid or expired token');
        return (0, exports.formatErrorResponse)(authError, path, method, isDevelopment);
    }
    // Default error response
    const response = {
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: isDevelopment ? error.message : 'Something went wrong',
        statusCode: 500,
        timestamp,
    };
    if (path !== undefined)
        response.path = path;
    if (method !== undefined)
        response.method = method;
    if (isDevelopment && error.stack)
        response.stack = error.stack;
    return response;
};
exports.formatErrorResponse = formatErrorResponse;
/**
 * Translates database errors to appropriate API errors
 */
const translateDatabaseError = (error) => {
    const message = error.message;
    // Duplicate key error
    if (message.includes('E11000') || message.includes('duplicate key')) {
        const field = extractFieldFromDuplicateError(message);
        return new ConflictError(`${field ? `${field} already exists` : 'Duplicate entry detected'}`, { originalError: message, field });
    }
    // Validation error
    if (error.name === 'ValidationError') {
        return new ValidationError('Database validation failed', [{ field: 'general', message: error.message }]);
    }
    // Cast error (invalid ObjectId, etc.)
    if (error.name === 'CastError') {
        return new ValidationError('Invalid data format', [{ field: 'id', message: 'Invalid ID format' }]);
    }
    // Connection errors
    if (message.includes('connection') || message.includes('timeout')) {
        return new DatabaseError('Database connection failed', 'connection');
    }
    // Default database error
    return new DatabaseError('Database operation failed', 'unknown');
};
exports.translateDatabaseError = translateDatabaseError;
/**
 * Extracts field name from MongoDB duplicate key error
 */
const extractFieldFromDuplicateError = (message) => {
    const match = message.match(/index: (\w+)_/);
    return match ? match[1] : null;
};
/**
 * Async wrapper for route handlers to catch errors automatically
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};
exports.catchAsync = catchAsync;
/**
 * Wraps async functions to handle errors with custom error transformation
 */
const withErrorHandling = (fn, errorTransformer) => {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            if (errorTransformer && error instanceof Error) {
                throw errorTransformer(error);
            }
            throw error;
        }
    };
};
exports.withErrorHandling = withErrorHandling;
/**
 * Creates a standardized error logger
 */
const logError = (error, context) => {
    const logData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        context,
    };
    if (error instanceof ApiError) {
        logData.context = { ...logData.context, ...error.context };
    }
    // In production, you would send this to a logging service
    console.error('Error:', JSON.stringify(logData, null, 2));
};
exports.logError = logError;
/**
 * Handles unhandled promise rejections
 */
const handleUnhandledRejection = (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    (0, exports.logError)(new Error('Unhandled Promise Rejection'), { reason: String(reason), promise: promise.toString() });
};
exports.handleUnhandledRejection = handleUnhandledRejection;
/**
 * Handles uncaught exceptions
 */
const handleUncaughtException = (error) => {
    console.error('Uncaught Exception:', error);
    (0, exports.logError)(error, { type: 'uncaught_exception' });
    // In production, you might want to gracefully shutdown the process
    process.exit(1);
};
exports.handleUncaughtException = handleUncaughtException;
// =============================================================================
// EXPORTS
// =============================================================================
exports.default = ApiError;
//# sourceMappingURL=errors.js.map