import { Request, Response, NextFunction } from 'express';
/**
 * Validation rules for user registration
 */
export declare const validateRegister: import("express-validator").ValidationChain[];
/**
 * Validation rules for user login
 */
export declare const validateLogin: import("express-validator").ValidationChain[];
/**
 * Validation rules for password reset request
 */
export declare const validatePasswordReset: import("express-validator").ValidationChain[];
/**
 * Validation rules for password reset confirmation
 */
export declare const validatePasswordResetConfirm: import("express-validator").ValidationChain[];
/**
 * Validation rules for email verification
 */
export declare const validateEmailVerification: import("express-validator").ValidationChain[];
/**
 * Validation rules for profile update
 */
export declare const validateProfileUpdate: import("express-validator").ValidationChain[];
/**
 * Validation rules for address
 */
export declare const validateAddress: import("express-validator").ValidationChain[];
/**
 * Middleware to handle validation errors
 * Returns 400 error with validation details if validation fails
 */
export declare const handleValidationErrors: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Custom validation middleware for checking password strength
 */
export declare const validatePasswordStrength: import("express-validator").ValidationChain[];
/**
 * Sanitize input middleware
 * Removes any HTML tags and trims whitespace
 */
export declare const sanitizeInput: import("express-validator").ValidationChain[];
/**
 * Validate MongoDB ObjectId parameter
 */
export declare const validateObjectId: (paramName: string) => (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=validation.d.ts.map