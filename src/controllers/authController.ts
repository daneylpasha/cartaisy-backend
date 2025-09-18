import { Request, Response } from 'express';
import crypto from 'crypto';
import User, { IUser } from '../models/User';
import { generateToken, generateRefreshToken } from '../utils/jwt';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../utils/email';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../utils/constants';
import { AuthenticatedRequest } from '../types';

// Use AuthenticatedRequest for consistency
type AuthRequest = AuthenticatedRequest;

/**
 * Register a new user
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        status: 'error',
        message: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
      });
      return;
    }

    // Create new user (name will be added later via updateProfile)
    const user = new User({
      email,
      password,
      role: 'customer' // Default role for new registrations
    });

    await user.save();

    // Generate JWT token
    const token = generateToken((user._id as any).toString());
    const refreshToken = generateRefreshToken((user._id as any).toString());

    // Send welcome email (don't wait for it)
    sendWelcomeEmail(email, email).catch(err =>
      console.error('Failed to send welcome email:', err)
    );

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
      message: SUCCESS_MESSAGES.REGISTRATION_SUCCESS,
      data: {
        user: userData,
        token,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Registration failed. Please try again.'
    });
  }
};

/**
 * Login user
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find user by email (include password field)
    const user = await User.findOne({ email }).select('+password');
    
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
    const token = generateToken((user._id as any).toString());
    const refreshToken = generateRefreshToken((user._id as any).toString());

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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * Request password reset
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });

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
    const emailSent = await sendPasswordResetEmail(email, resetToken);

    if (!emailSent) {
      // If email fails, clear the reset token
      (user as any).passwordResetToken = undefined;
      (user as any).passwordResetExpires = undefined;
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
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process password reset request. Please try again.'
    });
  }
};

/**
 * Reset password with token
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    // Hash the token to match stored version
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with matching token that hasn't expired
    const user = await User.findOne({
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
    (user as any).passwordResetToken = undefined;
    (user as any).passwordResetExpires = undefined;
    await user.save();

    // Generate new JWT token (auto-login after reset)
    const authToken = generateToken((user._id as any).toString());

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful',
      data: {
        token: authToken
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password. Please try again.'
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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
      totalOrdersCount: (req.user as any).totalOrdersCount,
      totalSpent: (req.user as any).totalSpent,
      createdAt: req.user.createdAt,
      lastLoginAt: req.user.lastLoginAt
    };

    res.status(200).json({
      status: 'success',
      data: {
        user: userData
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch profile. Please try again.'
    });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
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
      .reduce((obj: any, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

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
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile. Please try again.'
    });
  }
};

/**
 * Complete Profile - Step by step profile completion after registration
 * Can be called multiple times to update different fields
 */
export const completeProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
      return;
    }

    const { field, value } = req.body;

    // Validate input
    if (!field || value === undefined) {
      res.status(400).json({
        status: 'error',
        message: 'Field and value are required'
      });
      return;
    }

    // Define allowed fields for profile completion
    const allowedFields = ['name', 'phone'];

    if (!allowedFields.includes(field)) {
      res.status(400).json({
        status: 'error',
        message: `Invalid field. Allowed fields: ${allowedFields.join(', ')}`
      });
      return;
    }

    // Get current user to check if field already exists
    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
      return;
    }

    // Check if field already has a value
    const fieldValue = currentUser[field as keyof typeof currentUser];
    if (fieldValue && fieldValue !== '') {
      res.status(400).json({
        status: 'error',
        message: `${field} is already set. Cannot update existing ${field}.`,
        data: {
          field,
          currentValue: fieldValue,
          isProfileComplete: !!(currentUser.name && currentUser.phone)
        }
      });
      return;
    }

    // Build update object
    const updateObj: Record<string, any> = {};
    updateObj[field] = value;

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateObj },
      { new: true, runValidators: true }
    );

    if (!user) {
      res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
      return;
    }

    // Check if profile is complete
    const isProfileComplete = !!(user.name && user.phone);

    res.status(200).json({
      status: 'success',
      message: `${field} added successfully`,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          isProfileComplete
        }
      }
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile. Please try again.'
    });
  }
};

/**
 * Change password
 */
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
      return;
    }

    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    // Get user with password field
    const user = await User.findById(req.user._id).select('+password');
    
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
    const token = generateToken((user._id as any).toString());

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully',
      data: {
        token
      }
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to change password. Please try again.'
    });
  }
};