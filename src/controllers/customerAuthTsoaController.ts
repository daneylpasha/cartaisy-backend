import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Response,
  SuccessResponse,
  Header,
} from '@tsoa/runtime';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Customer, { ICustomer } from '../models/Customer';
import Store from '../models/Store';
import { generateToken, generateRefreshToken } from '../utils/jwt';
import { sendPasswordResetEmail, StoreEmailConfig } from '../utils/email';

/**
 * Customer data response interface
 */
interface CustomerData {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  avatar?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: Date;
  country?: string;
  storeId: string;
  addresses: any[];
  preferences: any;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  shopifyCartId?: string;  // Shopify cart ID for cart persistence
  totalSpent?: number;
  totalOrdersCount?: number;
}

/**
 * Format customer object for response (exclude sensitive fields)
 */
const formatCustomerResponse = (customer: ICustomer): CustomerData => {
  return {
    id: customer._id.toString(),
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    avatar: customer.avatar,
    gender: customer.gender,
    dateOfBirth: customer.dateOfBirth,
    country: customer.country,
    storeId: customer.storeId.toString(),
    addresses: customer.addresses || [],
    preferences: customer.preferences,
    isVerified: customer.isVerified,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt,
    shopifyCartId: customer.shopifyCartId,  // Include saved Shopify cart ID
    totalSpent: customer.totalSpent || 0,
    totalOrdersCount: customer.orderCount || 0,
  };
};

interface CustomerRegisterRequest {
  /** Customer email address */
  email: string;
  /** Password (minimum 6 characters) */
  password: string;
  /** Customer full name (optional) */
  name?: string;
  /** Customer phone number (optional) */
  phone?: string;
}

interface CustomerLoginRequest {
  /** Customer email address */
  email: string;
  /** Customer password */
  password: string;
}

interface CustomerUpdateProfileRequest {
  /** Customer full name */
  name?: string;
  /** Alternative field name for full name */
  fullName?: string;
  /** Customer phone number */
  phone?: string;
  /** Alternative field name for phone number */
  phoneNumber?: string;
  /** Avatar URL */
  avatar?: string;
  /** Gender */
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  /** Date of birth (ISO string) */
  dateOfBirth?: string;
  /** Country */
  country?: string;
  /** Notification and other preferences */
  preferences?: {
    currency?: string;
    language?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
      promotions?: boolean;
      orderUpdates?: boolean;
    };
  };
}

interface CustomerDeviceTokenRequest {
  /** Push notification token (preferred) */
  token?: string;
  /** Push notification token (alternative name for mobile compatibility) */
  deviceToken?: string;
  /** Device platform */
  platform: 'ios' | 'android';
}

interface CustomerLogoutRequest {
  /** Device token to remove (optional) */
  deviceToken?: string;
}

interface CustomerRefreshTokenRequest {
  /** Refresh token from login/register response */
  refreshToken: string;
}

interface CustomerDeleteAccountRequest {
  /** Customer's password for verification */
  password: string;
}

interface CustomerForgotPasswordRequest {
  /** Customer email address */
  email: string;
}

interface CustomerResetPasswordRequest {
  /** Reset token from email */
  token: string;
  /** New password (minimum 6 characters) */
  newPassword: string;
}

interface CustomerChangePasswordRequest {
  /** Current password */
  currentPassword: string;
  /** New password (minimum 6 characters) */
  newPassword: string;
}

/**
 * Customer Authentication Controller
 * Handles customer registration, login, profile management for mobile app
 */
@Route('customer/auth')
@Tags('Customer Authentication')
export class CustomerAuthTsoaController extends Controller {
  /**
   * Register a new customer account
   * @summary Register new customer
   * @param storeId Store ID from header
   * @param requestBody Registration data
   */
  @Post('register')
  @SuccessResponse(201, 'Registration successful')
  @Response(400, 'Bad Request')
  @Response(403, 'Store not active')
  @Response(404, 'Store not found')
  @Response(409, 'Email already exists')
  @Response(500, 'Internal Server Error')
  public async customerRegister(
    @Header('x-store-id') storeId: string,
    @Body() requestBody: CustomerRegisterRequest
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      user: CustomerData;
      token: string;
      refreshToken: string;
    };
  }> {
    try {
      const { email, password, name, phone } = requestBody;

      // Validate required fields
      if (!email || !password) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Email and password are required.',
        };
      }

      // Validate password length
      if (password.length < 6) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Password must be at least 6 characters.',
        };
      }

      // Validate storeId
      if (!storeId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Store ID is required.',
        };
      }

      // Verify store exists and is active
      const store = await Store.findById(storeId).select('isActive');
      if (!store) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Store not found.',
        };
      }

      if (!store.isActive) {
        this.setStatus(403);
        return {
          status: 'error',
          message: 'Store is not active.',
        };
      }

      // Check if customer already exists for this store
      const existingCustomer = await Customer.findOne({
        storeId,
        email: email.toLowerCase(),
      });

      if (existingCustomer) {
        this.setStatus(409);
        return {
          status: 'error',
          message: 'An account with this email already exists.',
        };
      }

      // Create new customer with default preferences
      const customer = new Customer({
        storeId,
        email: email.toLowerCase(),
        password,
        name,
        phone,
        addresses: [],
        wishlist: [],
        cart: {
          items: [],
          updatedAt: new Date(),
        },
        preferences: {
          notifications: {
            email: true,
            push: true,
            sms: false,
            promotions: true,
            orderUpdates: true,
          },
        },
        deviceTokens: [],
        isActive: true,
        isVerified: false,
      });

      await customer.save();

      // Generate tokens
      const token = generateToken(customer._id.toString());
      const refreshToken = generateRefreshToken(customer._id.toString());

      this.setStatus(201);
      return {
        status: 'success',
        message: 'Registration successful',
        data: {
          user: formatCustomerResponse(customer),
          token,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Customer registration error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to register. Please try again.',
      };
    }
  }

  /**
   * Login customer
   * @summary Customer login
   * @param storeId Store ID from header
   * @param requestBody Login credentials
   */
  @Post('login')
  @SuccessResponse(200, 'Login successful')
  @Response(400, 'Bad Request')
  @Response(401, 'Invalid credentials')
  @Response(403, 'Account deactivated')
  @Response(500, 'Internal Server Error')
  public async customerLogin(
    @Header('x-store-id') storeId: string,
    @Body() requestBody: CustomerLoginRequest
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      user: CustomerData;
      token: string;
      refreshToken: string;
    };
  }> {
    try {
      const { email, password } = requestBody;

      // Validate required fields
      if (!email || !password) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Email and password are required.',
        };
      }

      // Validate storeId
      if (!storeId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Store ID is required.',
        };
      }

      // Find customer by storeId and email, include password field
      const customer = await Customer.findOne({
        storeId,
        email: email.toLowerCase(),
      }).select('+password');

      if (!customer) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid email or password',
        };
      }

      // Check if customer is active
      if (!customer.isActive) {
        this.setStatus(403);
        return {
          status: 'error',
          message: 'Your account has been deactivated. Please contact support.',
        };
      }

      // Verify password
      const isPasswordValid = await customer.comparePassword(password);
      if (!isPasswordValid) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid email or password',
        };
      }

      // Update lastLoginAt
      customer.lastLoginAt = new Date();
      await customer.save();

      // Generate tokens
      const token = generateToken(customer._id.toString());
      const refreshToken = generateRefreshToken(customer._id.toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Login successful',
        data: {
          user: formatCustomerResponse(customer),
          token,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Customer login error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Login failed. Please try again.',
      };
    }
  }

  /**
   * Refresh access token for customer
   * @summary Refresh customer access token
   * @param requestBody Refresh token
   * @returns New access token and refresh token
   */
  @Post('refresh-token')
  @SuccessResponse(200, 'Token refreshed successfully')
  @Response(400, 'Bad Request - Refresh token required')
  @Response(401, 'Unauthorized - Invalid or expired refresh token')
  @Response(403, 'Forbidden - Account deactivated')
  @Response(500, 'Internal Server Error')
  public async customerRefreshToken(
    @Body() requestBody: CustomerRefreshTokenRequest
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      user: CustomerData;
      token: string;
      refreshToken: string;
    };
  }> {
    try {
      const { refreshToken: token } = requestBody;

      if (!token) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Refresh token is required',
        };
      }

      // Verify the refresh token
      const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret-key';

      let decoded: any;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (error) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid or expired refresh token',
        };
      }

      // Verify it's a refresh token (not an access token)
      if (decoded.type !== 'refresh') {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Invalid token type',
        };
      }

      // Find the customer
      const customer = await Customer.findById(decoded.userId);

      if (!customer) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Check if customer is active
      if (!customer.isActive) {
        this.setStatus(403);
        return {
          status: 'error',
          message: 'Account is inactive',
        };
      }

      // Generate new tokens
      const newAccessToken = generateToken(customer._id.toString());
      const newRefreshToken = generateRefreshToken(customer._id.toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Token refreshed successfully',
        data: {
          user: formatCustomerResponse(customer),
          token: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };
    } catch (error) {
      console.error('Customer refresh token error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to refresh token. Please try again.',
      };
    }
  }

  /**
   * Request password reset - sends email with reset link
   * Supports multi-tenant branding based on store configuration
   * @summary Request password reset
   * @param storeId Store ID from header
   * @param requestBody Email address for password reset
   */
  @Post('forgot-password')
  @SuccessResponse(200, 'Password reset email sent if account exists')
  @Response(500, 'Internal Server Error')
  public async customerForgotPassword(
    @Header('x-store-id') storeId: string,
    @Body() requestBody: CustomerForgotPasswordRequest
  ): Promise<{
    status: 'success' | 'error';
    message: string;
  }> {
    try {
      const { email } = requestBody;

      // Validate required fields
      if (!email) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Email is required.',
        };
      }

      // Validate storeId
      if (!storeId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Store ID is required.',
        };
      }

      // Fetch store first for branding
      const store = await Store.findById(storeId);

      // If store not found, return generic success (don't reveal store existence)
      if (!store) {
        this.setStatus(200);
        return {
          status: 'success',
          message: 'If an account with that email exists, a password reset link has been sent.',
        };
      }

      // Find customer by email and store
      const customer = await Customer.findOne({
        storeId,
        email: email.toLowerCase(),
      });

      // Always return success message (don't reveal if email exists)
      if (!customer) {
        this.setStatus(200);
        return {
          status: 'success',
          message: 'If an account with that email exists, a password reset link has been sent.',
        };
      }

      // Check if customer is active
      if (!customer.isActive) {
        this.setStatus(200);
        return {
          status: 'success',
          message: 'If an account with that email exists, a password reset link has been sent.',
        };
      }

      // Generate reset token
      const resetToken = customer.createPasswordResetToken();
      await customer.save({ validateBeforeSave: false });

      // Get store's email configuration using the model method
      const emailConfig = store.getEmailConfig();

      // Build store config for branded email
      const storeEmailConfig: StoreEmailConfig = {
        storeName: store.name,
        logoUrl: store.branding?.logoUrl,
        primaryColor: store.branding?.primaryColor || '#FF6B6B',
        fromName: emailConfig.fromName,
        fromAddress: emailConfig.fromAddress,
        replyTo: emailConfig.replyTo,
      };

      // Send password reset email with store branding
      const emailSent = await sendPasswordResetEmail(
        customer.email,
        resetToken,
        storeEmailConfig
      );

      if (!emailSent) {
        // If email fails, clear the reset token
        customer.resetPasswordToken = undefined;
        customer.resetPasswordExpires = undefined;
        await customer.save({ validateBeforeSave: false });

        console.error(`[CustomerAuth] Failed to send password reset email to ${customer.email} for store ${store.name}`);
        this.setStatus(500);
        return {
          status: 'error',
          message: 'Failed to send password reset email. Please try again later.',
        };
      }

      console.log(`[CustomerAuth] Password reset email sent to ${customer.email} for store "${store.name}"`);
      this.setStatus(200);
      return {
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    } catch (error) {
      console.error('Customer forgot password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to process password reset request. Please try again.',
      };
    }
  }

  /**
   * Reset password using token from email
   * @summary Reset password with token
   * @param storeId Store ID from header
   * @param requestBody Reset token and new password
   */
  @Post('reset-password')
  @SuccessResponse(200, 'Password reset successful')
  @Response(400, 'Bad Request - Invalid or expired token')
  @Response(500, 'Internal Server Error')
  public async customerResetPassword(
    @Header('x-store-id') storeId: string,
    @Body() requestBody: CustomerResetPasswordRequest
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      user: CustomerData;
      token: string;
      refreshToken: string;
    };
  }> {
    try {
      const { token, newPassword } = requestBody;

      // Validate required fields
      if (!token || !newPassword) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Token and new password are required.',
        };
      }

      // Validate password length
      if (newPassword.length < 6) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Password must be at least 6 characters.',
        };
      }

      // Validate storeId
      if (!storeId) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Store ID is required.',
        };
      }

      // Hash the token to match stored version
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // Find customer with matching token that hasn't expired
      const customer = await Customer.findOne({
        storeId,
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() },
      });

      if (!customer) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Invalid or expired reset token.',
        };
      }

      // Update password and clear reset token fields
      customer.password = newPassword;
      customer.resetPasswordToken = undefined;
      customer.resetPasswordExpires = undefined;
      await customer.save();

      // Generate new tokens for auto-login
      const accessToken = generateToken(customer._id.toString());
      const refreshToken = generateRefreshToken(customer._id.toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Password reset successful.',
        data: {
          user: formatCustomerResponse(customer),
          token: accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Customer reset password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to reset password. Please try again.',
      };
    }
  }

  /**
   * Change password for authenticated customer
   * @summary Change password
   * @param requestBody Current password and new password
   */
  @Post('change-password')
  @Security('jwt')
  @SuccessResponse(200, 'Password changed successfully')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerChangePassword(
    @Body() requestBody: CustomerChangePasswordRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      token: string;
      refreshToken: string;
    };
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      const { currentPassword, newPassword } = requestBody;

      // Validate required fields
      if (!currentPassword || !newPassword) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Current password and new password are required.',
        };
      }

      // Validate new password length
      if (newPassword.length < 6) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'New password must be at least 6 characters.',
        };
      }

      // Find customer with password field
      const customer = await Customer.findById(customerId).select('+password');

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Verify current password
      const isPasswordValid = await customer.comparePassword(currentPassword);
      if (!isPasswordValid) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'Current password is incorrect.',
        };
      }

      // Update password
      customer.password = newPassword;
      await customer.save();

      // Generate new tokens
      const accessToken = generateToken(customer._id.toString());
      const refreshToken = generateRefreshToken(customer._id.toString());

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Password changed successfully.',
        data: {
          token: accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      console.error('Customer change password error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to change password. Please try again.',
      };
    }
  }

  /**
   * Get current customer profile
   * @summary Get customer profile
   */
  @Get('profile')
  @Security('jwt')
  @SuccessResponse(200, 'Profile retrieved successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerGetProfile(@Request() request: any): Promise<{
    status: 'success' | 'error';
    data?: {
      user: CustomerData;
    };
    message?: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      this.setStatus(200);
      return {
        status: 'success',
        data: {
          user: formatCustomerResponse(customer),
        },
      };
    } catch (error) {
      console.error('Get customer profile error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to fetch profile. Please try again.',
      };
    }
  }

  /**
   * Update customer profile
   * @summary Update customer profile
   * @param requestBody Profile fields to update
   */
  @Patch('profile')
  @Security('jwt')
  @SuccessResponse(200, 'Profile updated successfully')
  @Response(401, 'Unauthorized')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerUpdateProfile(
    @Body() requestBody: CustomerUpdateProfileRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
    data?: {
      user: CustomerData;
    };
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      // Support both field name formats
      const actualName = requestBody.name || requestBody.fullName;
      const actualPhone = requestBody.phone || requestBody.phoneNumber;

      const customer = await Customer.findById(customerId);

      if (!customer) {
        this.setStatus(404);
        return {
          status: 'error',
          message: 'Customer not found',
        };
      }

      // Update only provided fields
      if (actualName !== undefined) {
        customer.name = actualName;
      }
      if (actualPhone !== undefined) {
        customer.phone = actualPhone;
      }
      if (requestBody.avatar !== undefined) {
        customer.avatar = requestBody.avatar;
      }
      if (requestBody.gender !== undefined) {
        customer.gender = requestBody.gender;
      }
      if (requestBody.dateOfBirth !== undefined) {
        customer.dateOfBirth = new Date(requestBody.dateOfBirth);
      }
      if (requestBody.country !== undefined) {
        customer.country = requestBody.country;
      }
      if (requestBody.preferences !== undefined) {
        // Merge preferences to allow partial updates
        if (requestBody.preferences.currency !== undefined) {
          customer.preferences.currency = requestBody.preferences.currency;
        }
        if (requestBody.preferences.language !== undefined) {
          customer.preferences.language = requestBody.preferences.language;
        }
        if (requestBody.preferences.notifications !== undefined) {
          customer.preferences.notifications = {
            ...customer.preferences.notifications,
            ...requestBody.preferences.notifications,
          };
        }
      }

      await customer.save();

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Profile updated successfully',
        data: {
          user: formatCustomerResponse(customer),
        },
      };
    } catch (error) {
      console.error('Update customer profile error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to update profile. Please try again.',
      };
    }
  }

  /**
   * Logout customer
   * @summary Customer logout
   * @param requestBody Optional device token to remove
   */
  @Post('logout')
  @Security('jwt')
  @SuccessResponse(200, 'Logged out successfully')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async customerLogout(
    @Body() requestBody: CustomerLogoutRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      // If deviceToken provided, remove it from customer's deviceTokens array
      if (requestBody.deviceToken) {
        await Customer.findByIdAndUpdate(customerId, {
          $pull: { deviceTokens: { token: requestBody.deviceToken } },
        });
      }

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Logged out successfully',
      };
    } catch (error) {
      console.error('Customer logout error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to logout. Please try again.',
      };
    }
  }

  /**
   * Update device token for push notifications
   * @summary Update device token
   * @param requestBody Device token and platform
   */
  @Post('device-token')
  @Security('jwt')
  @SuccessResponse(200, 'Device token updated')
  @Response(400, 'Bad Request')
  @Response(401, 'Unauthorized')
  @Response(500, 'Internal Server Error')
  public async customerUpdateDeviceToken(
    @Body() requestBody: CustomerDeviceTokenRequest,
    @Request() request: any
  ): Promise<{
    status: 'success' | 'error';
    message: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          status: 'error',
          message: 'User not authenticated',
        };
      }

      // Accept both 'token' and 'deviceToken' for mobile compatibility
      const token = requestBody.token || requestBody.deviceToken;
      const { platform } = requestBody;

      if (!token || !platform) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Token and platform are required.',
        };
      }

      if (!['ios', 'android'].includes(platform)) {
        this.setStatus(400);
        return {
          status: 'error',
          message: 'Platform must be either ios or android.',
        };
      }

      // Remove existing token if present (avoid duplicates)
      await Customer.findByIdAndUpdate(customerId, {
        $pull: { deviceTokens: { token } },
      });

      // Add new token with platform and createdAt
      await Customer.findByIdAndUpdate(customerId, {
        $push: {
          deviceTokens: {
            token,
            platform,
            createdAt: new Date(),
          },
        },
      });

      this.setStatus(200);
      return {
        status: 'success',
        message: 'Device token updated',
      };
    } catch (error) {
      console.error('Update device token error:', error);
      this.setStatus(500);
      return {
        status: 'error',
        message: 'Failed to update device token. Please try again.',
      };
    }
  }

  /**
   * Delete customer account
   * Soft deletes the customer account after password verification.
   * Order history is preserved for record-keeping.
   * @summary Delete customer account
   * @param requestBody Password for verification
   */
  @Delete('account')
  @Security('jwt')
  @SuccessResponse(200, 'Account deleted successfully')
  @Response(400, 'Bad Request - Password required')
  @Response(401, 'Unauthorized')
  @Response(403, 'Forbidden - Incorrect password')
  @Response(404, 'Customer not found')
  @Response(500, 'Internal Server Error')
  public async customerDeleteAccount(
    @Body() requestBody: CustomerDeleteAccountRequest,
    @Request() request: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const customerId = request.user?._id || request.user?.id;

      if (!customerId) {
        this.setStatus(401);
        return {
          success: false,
          message: 'User not authenticated',
        };
      }

      const { password } = requestBody;

      // Validate password is provided
      if (!password) {
        this.setStatus(400);
        return {
          success: false,
          message: 'Password is required for account deletion.',
        };
      }

      // Find customer with password field
      const customer = await Customer.findById(customerId).select('+password');

      if (!customer) {
        this.setStatus(404);
        return {
          success: false,
          message: 'Customer not found',
        };
      }

      // Verify password
      const isPasswordValid = await customer.comparePassword(password);
      if (!isPasswordValid) {
        this.setStatus(403);
        return {
          success: false,
          message: 'Incorrect password. Please try again.',
        };
      }

      // Soft delete: set isActive to false and add deletedAt timestamp
      customer.isActive = false;
      (customer as any).deletedAt = new Date();

      // Clear sensitive data but preserve for order history
      customer.deviceTokens = [];

      await customer.save();

      this.setStatus(200);
      return {
        success: true,
        message: 'Account deleted successfully',
      };
    } catch (error) {
      console.error('Delete customer account error:', error);
      this.setStatus(500);
      return {
        success: false,
        message: 'Failed to delete account. Please try again.',
      };
    }
  }
}
