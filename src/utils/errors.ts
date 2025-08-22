/**
 * Custom Error Classes and Error Handling Utilities
 * 
 * This module provides comprehensive error handling with custom error types,
 * consistent API responses, and proper error logging.
 */

import { ValidationError as ExpressValidationError } from 'express-validator';

// =============================================================================
// CUSTOM ERROR CLASSES
// =============================================================================

/**
 * Base API Error class with status code and additional context
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error for input validation failures
 */
export class ValidationError extends ApiError {
  public readonly fields: Array<{
    field: string;
    message: string;
    value?: unknown;
  }>;

  constructor(
    message: string,
    fields: Array<{ field: string; message: string; value?: unknown }>,
    context?: Record<string, unknown>
  ) {
    super(message, 400, true, context);
    this.fields = fields;
  }

  static fromExpressValidator(
    errors: ExpressValidationError[],
    message: string = 'Validation failed'
  ): ValidationError {
    const fields = errors.map(error => ({
      field: error.type === 'field' ? error.path : 'unknown',
      message: error.msg,
      value: error.type === 'field' ? error.value : undefined,
    }));

    return new ValidationError(message, fields);
  }
}

/**
 * Authentication Error for auth failures
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed', context?: Record<string, unknown>) {
    super(message, 401, true, context);
  }
}

/**
 * Authorization Error for permission failures
 */
export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
    super(message, 403, true, context);
  }
}

/**
 * Not Found Error for missing resources
 */
export class NotFoundError extends ApiError {
  public readonly resource?: string;
  public readonly resourceId?: string;

  constructor(
    message: string = 'Resource not found',
    resource?: string,
    resourceId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 404, true, context);
    this.resource = resource;
    this.resourceId = resourceId;
  }
}

/**
 * Conflict Error for resource conflicts
 */
export class ConflictError extends ApiError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 409, true, context);
  }
}

/**
 * Rate Limit Error for too many requests
 */
export class RateLimitError extends ApiError {
  public readonly retryAfter?: number;

  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 429, true, context);
    this.retryAfter = retryAfter;
  }
}

/**
 * Database Error for database-related issues
 */
export class DatabaseError extends ApiError {
  public readonly operation?: string;
  public readonly collection?: string;

  constructor(
    message: string,
    operation?: string,
    collection?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 500, true, context);
    this.operation = operation;
    this.collection = collection;
  }
}

/**
 * External Service Error for third-party API failures
 */
export class ExternalServiceError extends ApiError {
  public readonly service: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    service: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 502, true, context);
    this.service = service;
    this.originalError = originalError;
  }
}

/**
 * Business Logic Error for domain-specific failures
 */
export class BusinessLogicError extends ApiError {
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    context?: Record<string, unknown>
  ) {
    super(message, statusCode, true, context);
    this.code = code;
  }
}

// =============================================================================
// ERROR RESPONSE TYPES
// =============================================================================

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

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

/**
 * Determines if an error is operational (expected) or programming error
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
};

/**
 * Formats error for API response
 */
export const formatErrorResponse = (
  error: Error,
  path?: string,
  method?: string,
  isDevelopment: boolean = false
): ErrorResponse => {
  const timestamp = new Date().toISOString();

  if (error instanceof ValidationError) {
    const response: ErrorResponse = {
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message,
      statusCode: error.statusCode,
      timestamp,
      validation: error.fields,
    };
    if (path !== undefined) response.path = path;
    if (method !== undefined) response.method = method;
    if (error.context !== undefined) response.context = error.context;
    if (isDevelopment && error.stack) response.stack = error.stack;
    return response;
  }

  if (error instanceof ApiError) {
    const response: ErrorResponse = {
      success: false,
      error: error.name.replace('Error', '').toUpperCase(),
      message: error.message,
      statusCode: error.statusCode,
      timestamp,
    };
    if (path !== undefined) response.path = path;
    if (method !== undefined) response.method = method;
    if (error.context !== undefined) response.context = error.context;
    if (isDevelopment && error.stack) response.stack = error.stack;
    return response;
  }

  // Handle MongoDB errors
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    const dbError = translateDatabaseError(error);
    return formatErrorResponse(dbError, path, method, isDevelopment);
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    const authError = new AuthenticationError('Invalid or expired token');
    return formatErrorResponse(authError, path, method, isDevelopment);
  }

  // Default error response
  const response: ErrorResponse = {
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: isDevelopment ? error.message : 'Something went wrong',
    statusCode: 500,
    timestamp,
  };
  if (path !== undefined) response.path = path;
  if (method !== undefined) response.method = method;
  if (isDevelopment && error.stack) response.stack = error.stack;
  return response;
};

/**
 * Translates database errors to appropriate API errors
 */
export const translateDatabaseError = (error: Error): ApiError => {
  const message = error.message;

  // Duplicate key error
  if (message.includes('E11000') || message.includes('duplicate key')) {
    const field = extractFieldFromDuplicateError(message);
    return new ConflictError(
      `${field ? `${field} already exists` : 'Duplicate entry detected'}`,
      { originalError: message, field }
    );
  }

  // Validation error
  if (error.name === 'ValidationError') {
    return new ValidationError(
      'Database validation failed',
      [{ field: 'general', message: error.message }]
    );
  }

  // Cast error (invalid ObjectId, etc.)
  if (error.name === 'CastError') {
    return new ValidationError(
      'Invalid data format',
      [{ field: 'id', message: 'Invalid ID format' }]
    );
  }

  // Connection errors
  if (message.includes('connection') || message.includes('timeout')) {
    return new DatabaseError('Database connection failed', 'connection');
  }

  // Default database error
  return new DatabaseError('Database operation failed', 'unknown');
};

/**
 * Extracts field name from MongoDB duplicate key error
 */
const extractFieldFromDuplicateError = (message: string): string | null => {
  const match = message.match(/index: (\w+)_/);
  return match ? match[1] : null;
};

/**
 * Async wrapper for route handlers to catch errors automatically
 */
export const catchAsync = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Wraps async functions to handle errors with custom error transformation
 */
export const withErrorHandling = <T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  errorTransformer?: (error: Error) => Error
) => {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorTransformer && error instanceof Error) {
        throw errorTransformer(error);
      }
      throw error;
    }
  };
};

/**
 * Creates a standardized error logger
 */
export const logError = (error: Error, context?: Record<string, unknown>): void => {
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

/**
 * Handles unhandled promise rejections
 */
export const handleUnhandledRejection = (reason: unknown, promise: Promise<unknown>): void => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logError(
    new Error('Unhandled Promise Rejection'),
    { reason: String(reason), promise: promise.toString() }
  );
};

/**
 * Handles uncaught exceptions
 */
export const handleUncaughtException = (error: Error): void => {
  console.error('Uncaught Exception:', error);
  logError(error, { type: 'uncaught_exception' });
  // In production, you might want to gracefully shutdown the process
  process.exit(1);
};

// =============================================================================
// EXPORTS
// =============================================================================

export default ApiError;