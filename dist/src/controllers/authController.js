"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changePassword = exports.updateProfile = exports.getProfile = exports.resetPassword = exports.forgotPassword = exports.login = exports.register = void 0;
const crypto_1 = __importDefault(require("crypto"));
const User_1 = __importDefault(require("../models/User"));
const jwt_1 = require("../utils/jwt");
const email_1 = require("../utils/email");
const constants_1 = require("../utils/constants");
/**
 * Register a new user
 */
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        // Check if user already exists
        const existingUser = await User_1.default.findOne({ email });
        if (existingUser) {
            res.status(400).json({
                status: 'error',
                message: constants_1.ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
            });
            return;
        }
        // Create new user
        const user = new User_1.default({
            name,
            email,
            password,
            role: 'customer' // Default role for new registrations
        });
        await user.save();
        // Generate JWT token
        const token = (0, jwt_1.generateToken)(user._id.toString());
        const refreshToken = (0, jwt_1.generateRefreshToken)(user._id.toString());
        // Send welcome email (don't wait for it)
        (0, email_1.sendWelcomeEmail)(email, name).catch(err => console.error('Failed to send welcome email:', err));
        // Prepare user data (exclude sensitive fields)
        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isVerified,
            isActive: user.isActive,
            createdAt: user.createdAt
        };
        res.status(201).json({
            status: 'success',
            message: constants_1.SUCCESS_MESSAGES.REGISTRATION_SUCCESS,
            data: {
                user: userData,
                token,
                refreshToken
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Registration failed. Please try again.'
        });
    }
};
exports.register = register;
/**
 * Login user
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Find user by email (include password field)
        const user = await User_1.default.findOne({ email }).select('+password');
        if (!user) {
            res.status(401).json({
                status: 'error',
                message: 'Invalid email or password'
            });
            return;
        }
        // Check if user is active
        if (!user.isActive) {
            res.status(403).json({
                status: 'error',
                message: 'Your account has been deactivated. Please contact support.'
            });
            return;
        }
        // Check password
        const isPasswordCorrect = await user.comparePassword(password);
        if (!isPasswordCorrect) {
            res.status(401).json({
                status: 'error',
                message: 'Invalid email or password'
            });
            return;
        }
        // Update login tracking
        await user.updateLastLogin();
        // Generate JWT token
        const token = (0, jwt_1.generateToken)(user._id.toString());
        const refreshToken = (0, jwt_1.generateRefreshToken)(user._id.toString());
        // Prepare user data (exclude sensitive fields)
        const userData = {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isVerified,
            isActive: user.isActive,
            avatar: user.profile.avatar,
            lastLoginAt: user.lastLoginAt
        };
        res.status(200).json({
            status: 'success',
            message: 'Login successful',
            data: {
                user: userData,
                token,
                refreshToken
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Login failed. Please try again.'
        });
    }
};
exports.login = login;
/**
 * Request password reset
 */
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        // Find user by email
        const user = await User_1.default.findOne({ email });
        // Always return success message (don't reveal if email exists)
        if (!user) {
            res.status(200).json({
                status: 'success',
                message: 'If an account exists with this email, you will receive a password reset link shortly.'
            });
            return;
        }
        // Generate password reset token
        const resetToken = user.createPasswordResetToken();
        await user.save({ validateBeforeSave: false });
        // Send password reset email
        const emailSent = await (0, email_1.sendPasswordResetEmail)(email, resetToken);
        if (!emailSent) {
            // If email fails, clear the reset token
            user.passwordResetToken = undefined;
            user.passwordResetExpires = undefined;
            await user.save({ validateBeforeSave: false });
            res.status(500).json({
                status: 'error',
                message: 'Failed to send reset email. Please try again later.'
            });
            return;
        }
        res.status(200).json({
            status: 'success',
            message: 'If an account exists with this email, you will receive a password reset link shortly.'
        });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to process password reset request. Please try again.'
        });
    }
};
exports.forgotPassword = forgotPassword;
/**
 * Reset password with token
 */
const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        // Hash the token to match stored version
        const hashedToken = crypto_1.default
            .createHash('sha256')
            .update(token)
            .digest('hex');
        // Find user with matching token that hasn't expired
        const user = await User_1.default.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });
        if (!user) {
            res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token'
            });
            return;
        }
        // Update password and clear reset token fields
        user.password = newPassword;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        // Generate new JWT token (auto-login after reset)
        const authToken = (0, jwt_1.generateToken)(user._id.toString());
        res.status(200).json({
            status: 'success',
            message: 'Password reset successful',
            data: {
                token: authToken
            }
        });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to reset password. Please try again.'
        });
    }
};
exports.resetPassword = resetPassword;
/**
 * Get current user profile
 */
const getProfile = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                status: 'error',
                message: 'User not authenticated'
            });
            return;
        }
        // Prepare user data (exclude sensitive fields)
        const userData = {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            isEmailVerified: req.user.isVerified,
            isActive: req.user.isActive,
            avatar: req.user.profile.avatar,
            phone: req.user.phone,
            dateOfBirth: req.user.profile.dateOfBirth,
            addresses: req.user.addresses,
            preferences: req.user.preferences,
            totalOrdersCount: req.user.totalOrdersCount,
            totalSpent: req.user.totalSpent,
            createdAt: req.user.createdAt,
            lastLoginAt: req.user.lastLoginAt
        };
        res.status(200).json({
            status: 'success',
            data: {
                user: userData
            }
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch profile. Please try again.'
        });
    }
};
exports.getProfile = getProfile;
/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                status: 'error',
                message: 'User not authenticated'
            });
            return;
        }
        // Fields that can be updated
        const allowedUpdates = ['name', 'phone', 'dateOfBirth', 'avatar'];
        const updates = Object.keys(req.body)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
            obj[key] = req.body[key];
            return obj;
        }, {});
        // Update user
        const user = await User_1.default.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
        if (!user) {
            res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
            return;
        }
        res.status(200).json({
            status: 'success',
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    dateOfBirth: user.profile.dateOfBirth,
                    avatar: user.profile.avatar
                }
            }
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update profile. Please try again.'
        });
    }
};
exports.updateProfile = updateProfile;
/**
 * Change password
 */
const changePassword = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                status: 'error',
                message: 'User not authenticated'
            });
            return;
        }
        const { currentPassword, newPassword } = req.body;
        // Get user with password field
        const user = await User_1.default.findById(req.user._id).select('+password');
        if (!user) {
            res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
            return;
        }
        // Check current password
        const isPasswordCorrect = await user.comparePassword(currentPassword);
        if (!isPasswordCorrect) {
            res.status(401).json({
                status: 'error',
                message: 'Current password is incorrect'
            });
            return;
        }
        // Update password
        user.password = newPassword;
        await user.save();
        // Generate new token
        const token = (0, jwt_1.generateToken)(user._id.toString());
        res.status(200).json({
            status: 'success',
            message: 'Password changed successfully',
            data: {
                token
            }
        });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to change password. Please try again.'
        });
    }
};
exports.changePassword = changePassword;
//# sourceMappingURL=authController.js.map