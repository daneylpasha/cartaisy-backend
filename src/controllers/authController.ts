import { Request, Response } from 'express';
import crypto from 'crypto';
import User from '../models/User';
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
 * Update user profile - Comprehensive profile update API
 * Accepts an object with key/value pairs to update existing fields or add new fields
 * Restricted fields cannot be updated for security reasons
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

    const updates = req.body;

    // Validate that we have data to update
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'No data provided for update'
      });
      return;
    }

    // Define restricted fields that cannot be updated through this API
    const restrictedFields = [
      '_id',
      'email',
      'password',
      'role',
      'isVerified',
      'isActive',
      'passwordResetToken',
      'passwordResetExpires',
      'createdAt',
      'updatedAt',
      'lastLoginAt',
      'loginAttempts',
      'lockUntil'
    ];

    // Check if any restricted fields are being updated
    const restrictedFieldsFound = Object.keys(updates).filter(field =>
      restrictedFields.includes(field)
    );

    if (restrictedFieldsFound.length > 0) {
      res.status(400).json({
        status: 'error',
        message: `Cannot update restricted fields: ${restrictedFieldsFound.join(', ')}`
      });
      return;
    }

    // Build update object - handle nested fields properly
    const updateObj: Record<string, any> = {};

    // Lists of fields that belong to subdocuments
    const profileFields = [
      'avatar',
      'dateOfBirth',
      'gender',
      'interests',
      'bio',
      'occupation',
      'company',
      'website',
      'socialLinks'
    ];

    const preferencesFields = [
      'currency',
      'language',
      'theme',
      'notifications'
    ];

    // Process each field in the updates
    Object.keys(updates).forEach(field => {
      const value = updates[field as keyof typeof updates];

      // Handle nested fields
      if (profileFields.includes(field)) {
        updateObj[`profile.${field}`] = value;
      } else if (preferencesFields.includes(field)) {
        // Handle preferences - if notifications is an object, set it properly
        if (field === 'notifications' && typeof value === 'object') {
          Object.keys(value).forEach(notifType => {
            updateObj[`preferences.notifications.${notifType}`] = value[notifType];
          });
        } else {
          updateObj[`preferences.${field}`] = value;
        }
      } else if (field === 'addresses' && Array.isArray(value)) {
        // Handle addresses array
        updateObj.addresses = value;
      } else {
        // Direct field on user document (name, phone, or any custom field)
        updateObj[field] = value;
      }
    });

    // Update user with strict: false to allow dynamic fields
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateObj },
      {
        new: true,
        runValidators: true,
        strict: false  // Allow fields not defined in schema
      }
    );

    if (!user) {
      res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
      return;
    }

    // Get updated user object including dynamic fields
    const userObj = user.toObject();

    // Check if profile is complete (minimum required fields)
    const isProfileComplete = !!(userObj.name && userObj.phone);

    // Build response data including all updated fields
    const responseData: any = {
      id: user._id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isVerified,
      isActive: user.isActive,
      isProfileComplete
    };

    // Add all non-restricted fields from the user object
    Object.keys(userObj).forEach(key => {
      if (!restrictedFields.includes(key) && !key.startsWith('_')) {
        responseData[key] = (userObj as any)[key];
      }
    });

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: responseData,
        updatedFields: Object.keys(updates)
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

/**
 * Delete user account
 * Requires password verification for security
 */
export const deleteAccount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated'
      });
      return;
    }

    const { password } = req.body as { password: string };

    if (!password) {
      res.status(400).json({
        status: 'error',
        message: 'Password is required to delete account'
      });
      return;
    }

    // Get user with password field
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
      return;
    }

    // Verify password
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      res.status(401).json({
        status: 'error',
        message: 'Incorrect password. Account deletion cancelled.'
      });
      return;
    }

    // Soft delete: deactivate account instead of hard delete
    // This preserves order history and allows account recovery if needed
    user.isActive = false;
    user.name = 'Deleted User';
    user.email = `deleted_${user._id}@cartaisy.com`; // Prevent email conflicts
    await user.save();

    // Note: Consider adding background job to:
    // - Clean up user data after 30 days
    // - Send confirmation email
    // - Cancel active subscriptions
    // - Remove from mailing lists

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully. We\'re sorry to see you go.'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete account. Please try again.'
    });
  }
};