"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateObjectId = exports.sanitizeInput = exports.validatePasswordStrength = exports.handleValidationErrors = exports.validateAddress = exports.validateProfileUpdate = exports.validateEmailVerification = exports.validatePasswordResetConfirm = exports.validatePasswordReset = exports.validateLogin = exports.validateRegister = void 0;
const express_validator_1 = require("express-validator");
/**
 * Validation rules for user registration
 */
exports.validateRegister = [
    (0, express_validator_1.body)('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces'),
    (0, express_validator_1.body)('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail(),
    (0, express_validator_1.body)('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
        .isLength({ max: 128 }).withMessage('Password must not exceed 128 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number')
];
/**
 * Validation rules for user login
 */
exports.validateLogin = [
    (0, express_validator_1.body)('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail(),
    (0, express_validator_1.body)('password')
        .notEmpty().withMessage('Password is required')
];
/**
 * Validation rules for password reset request
 */
exports.validatePasswordReset = [
    (0, express_validator_1.body)('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Please provide a valid email address')
        .normalizeEmail()
];
/**
 * Validation rules for password reset confirmation
 */
exports.validatePasswordResetConfirm = [
    (0, express_validator_1.body)('token')
        .trim()
        .notEmpty().withMessage('Reset token is required')
        .isLength({ min: 64, max: 64 }).withMessage('Invalid reset token format'),
    (0, express_validator_1.body)('newPassword')
        .notEmpty().withMessage('New password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
        .isLength({ max: 128 }).withMessage('Password must not exceed 128 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/).withMessage('Password must contain at least one letter and one number')
];
/**
 * Validation rules for email verification
 */
exports.validateEmailVerification = [
    (0, express_validator_1.body)('token')
        .trim()
        .notEmpty().withMessage('Verification token is required')
        .isLength({ min: 64, max: 64 }).withMessage('Invalid verification token format')
];
/**
 * Validation rules for profile update
 */
exports.validateProfileUpdate = [
    (0, express_validator_1.body)('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/).withMessage('Name can only contain letters and spaces'),
    (0, express_validator_1.body)('phone')
        .optional()
        .trim()
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
    (0, express_validator_1.body)('dateOfBirth')
        .optional()
        .isISO8601().withMessage('Invalid date format')
        .custom((value) => {
        const date = new Date(value);
        const today = new Date();
        const age = today.getFullYear() - date.getFullYear();
        if (age < 13) {
            throw new Error('You must be at least 13 years old');
        }
        if (age > 120) {
            throw new Error('Invalid date of birth');
        }
        return true;
    })
];
/**
 * Validation rules for address
 */
exports.validateAddress = [
    (0, express_validator_1.body)('type')
        .notEmpty().withMessage('Address type is required')
        .isIn(['shipping', 'billing']).withMessage('Address type must be either shipping or billing'),
    (0, express_validator_1.body)('firstName')
        .trim()
        .notEmpty().withMessage('First name is required')
        .isLength({ max: 50 }).withMessage('First name must not exceed 50 characters'),
    (0, express_validator_1.body)('lastName')
        .trim()
        .notEmpty().withMessage('Last name is required')
        .isLength({ max: 50 }).withMessage('Last name must not exceed 50 characters'),
    (0, express_validator_1.body)('address1')
        .trim()
        .notEmpty().withMessage('Address line 1 is required')
        .isLength({ max: 100 }).withMessage('Address line 1 must not exceed 100 characters'),
    (0, express_validator_1.body)('address2')
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage('Address line 2 must not exceed 100 characters'),
    (0, express_validator_1.body)('city')
        .trim()
        .notEmpty().withMessage('City is required')
        .isLength({ max: 50 }).withMessage('City must not exceed 50 characters'),
    (0, express_validator_1.body)('province')
        .trim()
        .notEmpty().withMessage('Province/State is required')
        .isLength({ max: 50 }).withMessage('Province/State must not exceed 50 characters'),
    (0, express_validator_1.body)('country')
        .trim()
        .notEmpty().withMessage('Country is required')
        .isLength({ min: 2, max: 2 }).withMessage('Country must be a 2-letter ISO code'),
    (0, express_validator_1.body)('zip')
        .trim()
        .notEmpty().withMessage('ZIP/Postal code is required')
        .matches(/^[A-Z0-9\s\-]+$/i).withMessage('Invalid ZIP/Postal code format'),
    (0, express_validator_1.body)('phone')
        .optional()
        .trim()
        .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
    (0, express_validator_1.body)('isDefault')
        .optional()
        .isBoolean().withMessage('isDefault must be a boolean value')
];
/**
 * Middleware to handle validation errors
 * Returns 400 error with validation details if validation fails
 */
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => ({
            field: error.type === 'field' ? error.path : undefined,
            message: error.msg
        }));
        res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: errorMessages
        });
        return;
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
/**
 * Custom validation middleware for checking password strength
 */
exports.validatePasswordStrength = [
    (0, express_validator_1.body)('password')
        .custom((value) => {
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
        if (!strongPasswordRegex.test(value)) {
            throw new Error('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
        }
        return true;
    })
];
/**
 * Sanitize input middleware
 * Removes any HTML tags and trims whitespace
 */
exports.sanitizeInput = [
    (0, express_validator_1.body)('*').trim().escape()
];
/**
 * Validate MongoDB ObjectId parameter
 */
const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!id) {
            res.status(400).json({
                status: 'error',
                message: `${paramName} parameter is required`
            });
            return;
        }
        // MongoDB ObjectId validation regex
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        if (!objectIdRegex.test(id)) {
            res.status(400).json({
                status: 'error',
                message: `Invalid ${paramName} format`
            });
            return;
        }
        next();
    };
};
exports.validateObjectId = validateObjectId;
//# sourceMappingURL=validation.js.map