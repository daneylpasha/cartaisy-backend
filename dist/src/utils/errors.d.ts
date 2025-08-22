/**
 * Custom Error Classes and Error Handling Utilities
 *
 * This module provides comprehensive error handling with custom error types,
 * consistent API responses, and proper error logging.
 */
import { ValidationError as ExpressValidationError } from 'express-validator';
/**
 * Base API Error class with status code and additional context
 */
export declare class ApiError extends Error {
    readonly statusCode: number;
    readonly isOperational: boolean;
    readonly context?: Record<string, unknown>;
    constructor(message: string, statusCode?: number, isOperational?: boolean, context?: Record<string, unknown>);
}
/**
 * Validation Error for input validation failures
 */
export declare class ValidationError extends ApiError {
    readonly fields: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>;
    constructor(message: string, fields: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>, context?: Record<string, unknown>);
    static fromExpressValidator(errors: ExpressValidationError[], message?: string): ValidationError;
}
/**
 * Authentication Error for auth failures
 */
export declare class AuthenticationError extends ApiError {
    constructor(message?: string, context?: Record<string, unknown>);
}
/**
 * Authorization Error for permission failures
 */
export declare class AuthorizationError extends ApiError {
    constructor(message?: string, context?: Record<string, unknown>);
}
/**
 * Not Found Error for missing resources
 */
export declare class NotFoundError extends ApiError {
    readonly resource?: string;
    readonly resourceId?: string;
    constructor(message?: string, resource?: string, resourceId?: string, context?: Record<string, unknown>);
}
/**
 * Conflict Error for resource conflicts
 */
export declare class ConflictError extends ApiError {
    constructor(message: string, context?: Record<string, unknown>);
}
/**
 * Rate Limit Error for too many requests
 */
export declare class RateLimitError extends ApiError {
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number, context?: Record<string, unknown>);
}
/**
 * Database Error for database-related issues
 */
export declare class DatabaseError extends ApiError {
    readonly operation?: string;
    readonly collection?: string;
    constructor(message: string, operation?: string, collection?: string, context?: Record<string, unknown>);
}
/**
 * External Service Error for third-party API failures
 */
export declare class ExternalServiceError extends ApiError {
    readonly service: string;
    readonly originalError?: Error;
    constructor(message: string, service: string, originalError?: Error, context?: Record<string, unknown>);
}
/**
 * Business Logic Error for domain-specific failures
 */
export declare class BusinessLogicError extends ApiError {
    readonly code: string;
    constructor(message: string, code: string, statusCode?: number, context?: Record<string, unknown>);
}
export interface ErrorResponse {
    success: false;
    error: string;
    message: string;
    statusCode: number;
    timestamp: string;
    path?: string;
    method?: string;
    context?: Record<string, unknown>;
    stack?: string;
    validation?: Array<{
        field: string;
        message: string;
        value?: unknown;
    }>;
}
/**
 * Determines if an error is operational (expected) or programming error
 */
export declare const isOperationalError: (error: Error) => boolean;
/**
 * Formats error for API response
 */
export declare const formatErrorResponse: (error: Error, path?: string, method?: string, isDevelopment?: boolean) => ErrorResponse;
/**
 * Translates database errors to appropriate API errors
 */
export declare const translateDatabaseError: (error: Error) => ApiError;
/**
 * Async wrapper for route handlers to catch errors automatically
 */
export declare const catchAsync: (fn: Function) => (req: any, res: any, next: any) => void;
/**
 * Wraps async functions to handle errors with custom error transformation
 */
export declare const withErrorHandling: <T extends unknown[], R>(fn: (...args: T) => Promise<R>, errorTransformer?: (error: Error) => Error) => (...args: T) => Promise<R>;
/**
 * Creates a standardized error logger
 */
export declare const logError: (error: Error, context?: Record<string, unknown>) => void;
/**
 * Handles unhandled promise rejections
 */
export declare const handleUnhandledRejection: (reason: unknown, promise: Promise<unknown>) => void;
/**
 * Handles uncaught exceptions
 */
export declare const handleUncaughtException: (error: Error) => void;
export default ApiError;
//# sourceMappingURL=errors.d.ts.map