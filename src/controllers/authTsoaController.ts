import { Controller, Post, Get, Patch, Delete, Body, Request, Route, Tags, Response, Security, SuccessResponse } from 'tsoa';
import crypto from 'crypto';
import User from '../models/User';
import { generateToken, generateRefreshToken } from '../utils/jwt';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../utils/email';
import { SUCCESS_MESSAGES, ERROR_MESSAGES } from '../utils/constants';
import { AuthenticatedRequest } from '../types';
import {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  GetProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  DeleteAccountRequest,
  DeleteAccountResponse
} from '../types/api/auth';

/**
 * Authentication and User Management Controller
 * Handles user registration, login, profile management, and account operations
 */
@Route('auth')
@Tags('Authentication')
export class AuthController extends Controller {
  /**
   * Register a new user
   * @summary Register a new user account
   * @param requestBody User registration data
   * @returns User data with authentication tokens
   */
  @Post('register')
  @SuccessResponse(201, 'User registered successfully')
  @Response(400, 'Bad Request - Email already exists')
  @Response(500, 'Internal Server Error')
  public async register(@Body() requestBody: RegisterRequest): Promise<RegisterResponse> {
    try {
      const { email, password } = requestBody;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        this.setStatus(400);
        return {
          status: 'error',
          message: ERROR_MESSAGES.EMAIL_ALREADY_EXISTS
        };
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
        id: (user._id as any).toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isVerified,
        isActive: user.isActive,
        createdAt: user.createdAt
      };

      this.setStatus(201);
      return {
        status: 'success',
        message: SUCCESS_MESSAGES.REGISTRATION_SUCCESS,
        data: {
          user: userData,
          token,
          refreshToken
        }
      };
    } catch (error) {
      console.error('Registration error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Registration failed. Please try again.'
      };
    }
  }

  /**
   * Login user
   * @summary Authenticate user and get access token
   * @param requestBody User login credentials
   * @returns User data with authentication tokens
   */
  @Post('login')
  @SuccessResponse(200, 'Login successful')
  @Response(401, 'Unauthorized - Invalid credentials')
  @Response(403, 'Forbidden - Account deactivated')
  @Response(500, 'Internal Server Error')
  public async login(@Body() requestBody: LoginRequest): Promise<LoginResponse> {
    try {
      const { email, password } = requestBody;

      // Find user by email (include password field)
      const user = await User.findOne({ email }).select('+password');

      if (!user) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid email or password'
        };
      }

      // Check if user is active
      if (!user.isActive) {
        this.setStatus(403);
        return {
          status: 'error',
          message: 'Your account has been deactivated. Please contact support.'
        };
      }

      // Check password
      const isPasswordCorrect = await user.comparePassword(password);

      if (!isPasswordCorrect) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid email or password'
        };
      }

      // Update login tracking
      await user.updateLastLogin();

      // Generate JWT token
      const token = generateToken((user._id as any).toString());
      const refreshToken = generateRefreshToken((user._id as any).toString());

      // Prepare user data (exclude sensitive fields)
      const userData = {
        id: (user._id as any).toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isVerified,
        isActive: user.isActive,
        avatar: user.profile.avatar,
        lastLoginAt: user.lastLoginAt
      };

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Login successful',
        data: {
          user: userData,
          token,
          refreshToken
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Login failed. Please try again.'
      };
    }
  }

  /**
   * Request password reset
   * @summary Send password reset email
   * @param requestBody Email address for password reset
   * @returns Success message (always returns success for security)
   */
  @Post('forgot-password')
  @SuccessResponse(200, 'Password reset email sent if account exists')
  @Response(500, 'Internal Server Error')
  public async forgotPassword(@Body() requestBody: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    try {
      const { email } = requestBody;

      // Find user by email
      const user = await User.findOne({ email });

      // Always return success message (don't reveal if email exists)
      if (!user) {
        this.setStatus(200);
        return {
          status: 'success',
          message: 'If an account exists with this email, you will receive a password reset link shortly.'
        };
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

        this.setStatus(500);
        return {
          status: 'error',
          message: 'Failed to send reset email. Please try again later.'
        };
      }

      this.setStatus(200);
      return {
        status: 'success',
        message: 'If an account exists with this email, you will receive a password reset link shortly.'
      };
    } catch (error) {
      console.error('Forgot password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to process password reset request. Please try again.'
      };
    }
  }

  /**
   * Reset password with token
   * @summary Reset password using reset token from email
   * @param requestBody Reset token and new password
   * @returns Authentication token for auto-login
   */
  @Post('reset-password')
  @SuccessResponse(200, 'Password reset successful')
  @Response(400, 'Bad Request - Invalid or expired token')
  @Response(500, 'Internal Server Error')
  public async resetPassword(@Body() requestBody: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    try {
      const { token, newPassword } = requestBody;

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
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Invalid or expired reset token'
        };
      }

      // Update password and clear reset token fields
      user.password = newPassword;
      (user as any).passwordResetToken = undefined;
      (user as any).passwordResetExpires = undefined;
      await user.save();

      // Generate new JWT token (auto-login after reset)
      const authToken = generateToken((user._id as any).toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Password reset successful',
        data: {
          token: authToken
        }
      };
    } catch (error) {
      console.error('Reset password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to reset password. Please try again.'
      };
    }
  }

  /**
   * Get current user profile
   * @summary Get authenticated user's profile data
   * @param request Express request with authenticated user
   * @returns User profile data
   */
  @Get('profile')
  @Security('jwt')
  @SuccessResponse(200, 'Profile retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async getProfile(@Request() request: AuthenticatedRequest): Promise<GetProfileResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated'
        };
      }

      // Find default address
      const defaultAddress = request.user.addresses?.find((addr: any) => addr.isDefault === true) ||
                            (request.user.addresses && request.user.addresses.length > 0 ? request.user.addresses[0] : null);

      // Get country from default address or from user's country field or empty string
      const country = defaultAddress?.country || (request.user as any).country || '';

      // Prepare user data with all required fields (empty strings if missing)
      const userData = {
        id: (request.user._id as any).toString(),
        fullName: request.user.name || '',
        email: request.user.email,
        phoneNumber: request.user.phone || '',
        country: country,
        gender: request.user.profile?.gender || '',
        dateOfBirth: request.user.profile?.dateOfBirth ? new Date(request.user.profile.dateOfBirth).toISOString() : '',
        defaultAddress: defaultAddress || null,
        role: request.user.role,
        isEmailVerified: request.user.isVerified,
        isActive: request.user.isActive,
        avatar: request.user.profile?.avatar,
        addresses: request.user.addresses,
        preferences: request.user.preferences,
        totalOrdersCount: (request.user as any).totalOrdersCount,
        totalSpent: (request.user as any).totalSpent,
        createdAt: request.user.createdAt,
        lastLoginAt: request.user.lastLoginAt
      };

      this.setStatus(200);
      return {
        status: 'success',
        data: {
          user: userData
        }
      };
    } catch (error) {
      console.error('Get profile error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to fetch profile. Please try again.'
      };
    }
  }

  /**
   * Update user profile
   * @summary Update authenticated user's profile
   * @param requestBody Profile fields to update
   * @param request Express request with authenticated user
   * @returns Updated user profile data
   */
  @Patch('profile')
  @Security('jwt')
  @SuccessResponse(200, 'Profile updated successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'User not found')
  @Response(500, 'Internal Server Error')
  public async updateProfile(
    @Body() requestBody: UpdateProfileRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<UpdateProfileResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated'
        };
      }

      const updates = requestBody;

      // Validate that we have data to update
      if (!updates || Object.keys(updates).length === 0) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'No data provided for update'
        };
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
        this.setStatus(400);
        return {
          status: 'error',
          message: `Cannot update restricted fields: ${restrictedFieldsFound.join(', ')}`
        };
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

      // Handle firstName and lastName combination
      if (updates.firstName || updates.lastName) {
        const firstName = updates.firstName || '';
        const lastName = updates.lastName || '';
        // Combine firstName and lastName into name field
        updateObj.name = `${firstName} ${lastName}`.trim();
      }

      // Process each field in the updates
      Object.keys(updates).forEach(field => {
        const value = updates[field as keyof typeof updates];

        // Skip firstName and lastName as we already handled them
        if (field === 'firstName' || field === 'lastName') {
          return;
        }

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
          // Direct field on user document (name, phone, country, or any custom field)
          updateObj[field] = value;
        }
      });

      // Update user with strict: false to allow dynamic fields
      const user = await User.findByIdAndUpdate(
        request.user._id,
        { $set: updateObj },
        {
          new: true,
          runValidators: true,
          strict: false  // Allow fields not defined in schema
        }
      );

      if (!user) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'User not found'
        };
      }

      // Get updated user object including dynamic fields
      const userObj = user.toObject();

      // Check if profile is complete (minimum required fields)
      const isProfileComplete = !!(userObj.name && userObj.phone);

      // Build response data including all updated fields
      const responseData: any = {
        id: (user._id as any).toString(),
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

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Profile updated successfully',
        data: {
          user: responseData,
          updatedFields: Object.keys(updates)
        }
      };
    } catch (error) {
      console.error('Update profile error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to update profile. Please try again.'
      };
    }
  }

  /**
   * Change password
   * @summary Change authenticated user's password
   * @param requestBody Current password and new password
   * @param request Express request with authenticated user
   * @returns New authentication token
   */
  @Post('change-password')
  @Security('jwt')
  @SuccessResponse(200, 'Password changed successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'User not found')
  @Response(500, 'Internal Server Error')
  public async changePassword(
    @Body() requestBody: ChangePasswordRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<ChangePasswordResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated'
        };
      }

      const { currentPassword, newPassword } = requestBody;

      // Get user with password field
      const user = await User.findById(request.user._id).select('+password');

      if (!user) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'User not found'
        };
      }

      // Check current password
      const isPasswordCorrect = await user.comparePassword(currentPassword);

      if (!isPasswordCorrect) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Current password is incorrect'
        };
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Generate new token
      const token = generateToken((user._id as any).toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Password changed successfully',
        data: {
          token
        }
      };
    } catch (error) {
      console.error('Change password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to change password. Please try again.'
      };
    }
  }

  /**
   * Delete user account
   * @summary Soft delete user account (requires password verification)
   * @param requestBody Password for verification
   * @param request Express request with authenticated user
   * @returns Success message
   */
  @Delete('account')
  @Security('jwt')
  @SuccessResponse(200, 'Account deleted successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'User not found')
  @Response(500, 'Internal Server Error')
  public async deleteAccount(
    @Body() requestBody: DeleteAccountRequest,
    @Request() request: AuthenticatedRequest
  ): Promise<DeleteAccountResponse> {
    try {
      if (!request.user) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated'
        };
      }

      const { password } = requestBody;

      if (!password) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Password is required to delete account'
        };
      }

      // Get user with password field
      const user = await User.findById(request.user._id).select('+password');

      if (!user) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'User not found'
        };
      }

      // Verify password
      const isPasswordCorrect = await user.comparePassword(password);

      if (!isPasswordCorrect) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Incorrect password. Account deletion cancelled.'
        };
      }

      // Soft delete: deactivate account instead of hard delete
      // This preserves order history and allows account recovery if needed
      user.isActive = false;
      user.name = 'Deleted User';
      user.email = `deleted_${user._id}@cartaisy.com`; // Prevent email conflicts
      await user.save();

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Account deleted successfully. We\'re sorry to see you go.'
      };
    } catch (error) {
      console.error('Delete account error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to delete account. Please try again.'
      };
    }
  }
}
