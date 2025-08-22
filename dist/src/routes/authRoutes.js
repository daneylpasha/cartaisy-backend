"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
// Rate limiting for auth routes (production settings)
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per windowMs (production limit)
    message: {
        status: 'error',
        message: 'Too many authentication attempts. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests from rate limiting
    skipSuccessfulRequests: false
});
// Rate limiting for password reset (production settings)
const passwordResetLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour (production limit)
    message: {
        status: 'error',
        message: 'Too many password reset attempts. Please try again later.'
    }
});
/**
 * Public routes (no authentication required)
 */
// User registration
router.post('/register', authLimiter, validation_1.validateRegister, validation_1.handleValidationErrors, authController_1.register);
// User login
router.post('/login', authLimiter, validation_1.validateLogin, validation_1.handleValidationErrors, authController_1.login);
// Request password reset
router.post('/forgot-password', passwordResetLimiter, validation_1.validatePasswordReset, validation_1.handleValidationErrors, authController_1.forgotPassword);
// Reset password with token
router.post('/reset-password', passwordResetLimiter, validation_1.validatePasswordResetConfirm, validation_1.handleValidationErrors, authController_1.resetPassword);
/**
 * Protected routes (authentication required)
 */
// Get current user profile
router.get('/profile', auth_1.authenticate, authController_1.getProfile);
// Update user profile
router.patch('/profile', auth_1.authenticate, validation_1.validateProfileUpdate, validation_1.handleValidationErrors, authController_1.updateProfile);
// Change password (for authenticated users)
router.post('/change-password', auth_1.authenticate, authLimiter, [
    // Custom validation for change password
    ...validation_1.validatePasswordResetConfirm.slice(1), // Use newPassword validation
    // Add currentPassword validation
    ...[
        require('express-validator').body('currentPassword')
            .notEmpty().withMessage('Current password is required')
    ]
], validation_1.handleValidationErrors, authController_1.changePassword);
/**
 * Health check for auth service
 */
router.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Auth service is running',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=authRoutes.js.map