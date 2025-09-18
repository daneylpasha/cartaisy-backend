import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  completeProfile,
  changePassword
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validatePasswordResetConfirm,
  validateProfileUpdate,
  handleValidationErrors
} from '../middleware/validation';

const router = Router();

// Rate limiting for auth routes (production settings)
const authLimiter = rateLimit({
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
const passwordResetLimiter = rateLimit({
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
router.post(
  '/register',
  authLimiter,
  validateRegister,
  handleValidationErrors,
  register
);

// User login
router.post(
  '/login',
  authLimiter,
  validateLogin,
  handleValidationErrors,
  login
);

// Request password reset
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validatePasswordReset,
  handleValidationErrors,
  forgotPassword
);

// Reset password with token
router.post(
  '/reset-password',
  passwordResetLimiter,
  validatePasswordResetConfirm,
  handleValidationErrors,
  resetPassword
);

/**
 * Protected routes (authentication required)
 */

// Get current user profile
router.get(
  '/profile',
  authenticate,
  getProfile
);

// Update user profile
router.patch(
  '/profile',
  authenticate,
  validateProfileUpdate,
  handleValidationErrors,
  updateProfile
);

// Complete profile step-by-step (for new users)
router.post(
  '/complete-profile',
  authenticate,
  completeProfile
);

// Change password (for authenticated users)
router.post(
  '/change-password',
  authenticate,
  authLimiter,
  [
    // Custom validation for change password
    ...validatePasswordResetConfirm.slice(1), // Use newPassword validation
    // Add currentPassword validation
    ...[
      require('express-validator').body('currentPassword')
        .notEmpty().withMessage('Current password is required')
    ]
  ],
  handleValidationErrors,
  changePassword
);

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

export default router;