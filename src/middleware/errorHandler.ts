/**
 * Global Error Handler Middleware
 * 
 * This middleware handles all errors thrown in the application,
 * formats them consistently, and returns appropriate HTTP responses.
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { derivedConfig } from '../config/tenant';
import {
  ApiError,
  ValidationError,
  formatErrorResponse,
  isOperationalError,
  logError,
  translateDatabaseError,
  AuthenticationError,
} from '../utils/errors';

/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
export const globalErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  // Log the error for monitoring
  logError(error, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?._id?.toString(),
  });

  // Translate known error types
  if (error.name === 'MongoError' || error.name === 'MongooseError') {
    error = translateDatabaseError(error);
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    error = new AuthenticationError('Invalid or expired token');
  }

  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    error = new ValidationError('Invalid JSON in request body', [
      { field: 'body', message: 'Invalid JSON format' }
    ]);
  }

  // Format error response
  const errorResponse = formatErrorResponse(
    error,
    req.path,
    req.method,
    derivedConfig.isDevelopment
  );

  // Set status code
  const statusCode = error instanceof ApiError ? error.statusCode : 500;

  res.status(statusCode).json(errorResponse);
};

/**
 * Handle 404 errors for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new ApiError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};

/**
 * Handle async route errors
 * Wrapper function for async route handlers
 */
export const asyncHandler = <T extends unknown[]>(
  fn: (req: Request, res: Response, next: NextFunction, ...args: T) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction, ...args: T) => {
    Promise.resolve(fn(req, res, next, ...args)).catch(next);
  };
};

/**
 * Handle validation errors from express-validator
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction): void => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const validationError = ValidationError.fromExpressValidator(
      errors.array(),
      'Request validation failed'
    );
    return next(validationError);
  }

  next();
};

/**
 * Development error handler - shows full error details
 */
export const developmentErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
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

  globalErrorHandler(err, req, res, next);
};

/**
 * Production error handler - hides sensitive details
 */
export const productionErrorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Only log operational errors in production
  if (isOperationalError(err)) {
    logError(err, {
      url: req.url,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id?.toString(),
    });
  } else {
    // Log programming errors but don't expose details
    logError(
      new ApiError('Internal server error', 500, false),
      {
        originalError: err.name,
        url: req.url,
        method: req.method,
      }
    );
  }

  globalErrorHandler(err, req, res, next);
};

/**
 * Get appropriate error handler based on environment
 */
export const getErrorHandler = (): ErrorRequestHandler => {
  return derivedConfig.isDevelopment ? developmentErrorHandler : productionErrorHandler;
};

/**
 * Handle specific MongoDB errors
 */
export const handleMongooseValidationError = (err: any): ValidationError => {
  const fields = Object.keys(err.errors).map(key => ({
    field: key,
    message: err.errors[key].message,
    value: err.errors[key].value,
  }));

  return new ValidationError('Database validation failed', fields, {
    model: err.model?.modelName,
  });
};

/**
 * Handle MongoDB duplicate key errors
 */
export const handleMongoDuplicateError = (err: any): ApiError => {
  const field = Object.keys(err.keyValue)?.[0];
  if (!field) {
    return new ApiError('Duplicate key error', 409, true, { originalError: err });
  }
  
  const value = err.keyValue[field];

  return new ApiError(
    `${field.charAt(0).toUpperCase() + field.slice(1)} '${value}' already exists`,
    409,
    true,
    { field, value }
  );
};

/**
 * Handle JWT errors
 */
export const handleJWTError = (err: Error): AuthenticationError => {
  if (err.name === 'TokenExpiredError') {
    return new AuthenticationError('Token has expired, please log in again');
  }
  if (err.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token, please log in again');
  }
  return new AuthenticationError('Authentication failed');
};

/**
 * Rate limiting error handler
 */
export const handleRateLimitError = (req: Request, res: Response): void => {
  const error = new ApiError('Too many requests, please try again later', 429);
  const errorResponse = formatErrorResponse(
    error,
    req.path,
    req.method,
    derivedConfig.isDevelopment
  );

  res.status(429).json(errorResponse);
};

/**
 * CORS error handler
 */
export const handleCORSError = (req: Request, res: Response): void => {
  const error = new ApiError('CORS policy violation', 403);
  const errorResponse = formatErrorResponse(
    error,
    req.path,
    req.method,
    derivedConfig.isDevelopment
  );

  res.status(403).json(errorResponse);
};

export default globalErrorHandler;