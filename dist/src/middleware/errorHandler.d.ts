/**
 * Global Error Handler Middleware
 *
 * This middleware handles all errors thrown in the application,
 * formats them consistently, and returns appropriate HTTP responses.
 */
import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ApiError, ValidationError, AuthenticationError } from '../utils/errors';
/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
export declare const globalErrorHandler: ErrorRequestHandler;
/**
 * Handle 404 errors for undefined routes
 */
export declare const notFoundHandler: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Handle async route errors
 * Wrapper function for async route handlers
 */
export declare const asyncHandler: <T extends unknown[]>(fn: (req: Request, res: Response, next: NextFunction, ...args: T) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction, ...args: T) => void;
/**
 * Handle validation errors from express-validator
 */
export declare const handleValidationErrors: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Development error handler - shows full error details
 */
export declare const developmentErrorHandler: ErrorRequestHandler;
/**
 * Production error handler - hides sensitive details
 */
export declare const productionErrorHandler: ErrorRequestHandler;
/**
 * Get appropriate error handler based on environment
 */
export declare const getErrorHandler: () => ErrorRequestHandler;
/**
 * Handle specific MongoDB errors
 */
export declare const handleMongooseValidationError: (err: any) => ValidationError;
/**
 * Handle MongoDB duplicate key errors
 */
export declare const handleMongoDuplicateError: (err: any) => ApiError;
/**
 * Handle JWT errors
 */
export declare const handleJWTError: (err: Error) => AuthenticationError;
/**
 * Rate limiting error handler
 */
export declare const handleRateLimitError: (req: Request, res: Response) => void;
/**
 * CORS error handler
 */
export declare const handleCORSError: (req: Request, res: Response) => void;
export default globalErrorHandler;
//# sourceMappingURL=errorHandler.d.ts.map