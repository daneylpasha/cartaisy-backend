import { Request, Response } from 'express';
import Customer, { ICustomer } from '../models/Customer';
import Store from '../models/Store';
import { generateToken, generateRefreshToken } from '../utils/jwt';

/**
 * Format customer object for response (exclude sensitive fields)
 * Note: Using 'user' key to match the existing auth format
 */
const formatCustomerResponse = (customer: ICustomer) => {
  return {
    id: customer._id.toString(),
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    avatar: customer.avatar,
    storeId: customer.storeId.toString(),
    addresses: customer.addresses,
    preferences: customer.preferences,
    isVerified: customer.isVerified,
    isActive: customer.isActive,
    createdAt: customer.createdAt,
    lastLoginAt: customer.lastLoginAt,
  };
};

/**
 * Register a new customer
 * POST /api/v1/customer/auth/register
 */
export const registerCustomer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password, name, phone } = req.body;
    const storeId = req.storeId;

    // Validate required fields (name is optional, can be added later via profile update)
    if (!email || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Email and password are required.',
      });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters.',
      });
      return;
    }

    // Validate storeId
    if (!storeId) {
      res.status(400).json({
        status: 'error',
        message: 'Store ID is required.',
      });
      return;
    }

    // Verify store exists and is active
    const store = await Store.findById(storeId).select('isActive');
    if (!store) {
      res.status(404).json({
        status: 'error',
        message: 'Store not found.',
      });
      return;
    }

    if (!store.isActive) {
      res.status(403).json({
        status: 'error',
        message: 'Store is not active.',
      });
      return;
    }

    // Check if customer already exists for this store
    const existingCustomer = await Customer.findOne({
      storeId,
      email: email.toLowerCase(),
    });

    if (existingCustomer) {
      res.status(409).json({
        status: 'error',
        message: 'An account with this email already exists.',
      });
      return;
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

    // Generate tokens using shared JWT utilities (payload: { userId })
    const token = generateToken(customer._id.toString());
    const refreshToken = generateRefreshToken(customer._id.toString());

    res.status(201).json({
      status: 'success',
      message: 'Registration successful',
      data: {
        user: formatCustomerResponse(customer),
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register. Please try again.',
    });
  }
};

/**
 * Login customer
 * POST /api/v1/customer/auth/login
 */
export const loginCustomer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password } = req.body;
    const storeId = req.storeId;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Email and password are required.',
      });
      return;
    }

    // Validate storeId
    if (!storeId) {
      res.status(400).json({
        status: 'error',
        message: 'Store ID is required.',
      });
      return;
    }

    // Find customer by storeId and email, include password field
    const customer = await Customer.findOne({
      storeId,
      email: email.toLowerCase(),
    }).select('+password');

    if (!customer) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check if customer is active
    if (!customer.isActive) {
      res.status(403).json({
        status: 'error',
        message: 'Your account has been deactivated. Please contact support.',
      });
      return;
    }

    // Verify password
    const isPasswordValid = await customer.comparePassword(password);
    if (!isPasswordValid) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
      return;
    }

    // Update lastLoginAt
    customer.lastLoginAt = new Date();
    await customer.save();

    // Generate tokens using shared JWT utilities (payload: { userId })
    const token = generateToken(customer._id.toString());
    const refreshToken = generateRefreshToken(customer._id.toString());

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: formatCustomerResponse(customer),
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error('Customer login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed. Please try again.',
    });
  }
};

/**
 * Get customer profile
 * GET /api/v1/customer/auth/profile
 */
export const getCustomerProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: formatCustomerResponse(customer),
      },
    });
  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch profile. Please try again.',
    });
  }
};

/**
 * Update customer profile
 * PATCH /api/v1/customer/auth/profile
 */
export const updateCustomerProfile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    // Support both field name formats (name/fullName, phone/phoneNumber)
    const { name, fullName, phone, phoneNumber, avatar, preferences } = req.body;
    const actualName = name || fullName;
    const actualPhone = phone || phoneNumber;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
      return;
    }

    // Update only provided fields
    if (actualName !== undefined) {
      customer.name = actualName;
    }
    if (actualPhone !== undefined) {
      customer.phone = actualPhone;
    }
    if (avatar !== undefined) {
      customer.avatar = avatar;
    }
    if (preferences !== undefined) {
      // Merge preferences to allow partial updates
      if (preferences.currency !== undefined) {
        customer.preferences.currency = preferences.currency;
      }
      if (preferences.language !== undefined) {
        customer.preferences.language = preferences.language;
      }
      if (preferences.notifications !== undefined) {
        customer.preferences.notifications = {
          ...customer.preferences.notifications,
          ...preferences.notifications,
        };
      }
    }

    await customer.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: formatCustomerResponse(customer),
      },
    });
  } catch (error) {
    console.error('Update customer profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile. Please try again.',
    });
  }
};

/**
 * Logout customer
 * POST /api/v1/customer/auth/logout
 */
export const logoutCustomer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { deviceToken } = req.body;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    // If deviceToken provided, remove it from customer's deviceTokens array
    if (deviceToken) {
      await Customer.findByIdAndUpdate(customerId, {
        $pull: { deviceTokens: { token: deviceToken } },
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Customer logout error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to logout. Please try again.',
    });
  }
};

/**
 * Update device token for push notifications
 * POST /api/v1/customer/auth/device-token
 */
export const updateDeviceToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { token, platform } = req.body;

    if (!customerId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    if (!token || !platform) {
      res.status(400).json({
        status: 'error',
        message: 'Token and platform are required.',
      });
      return;
    }

    if (!['ios', 'android'].includes(platform)) {
      res.status(400).json({
        status: 'error',
        message: 'Platform must be either ios or android.',
      });
      return;
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

    res.status(200).json({
      status: 'success',
      message: 'Device token updated',
    });
  } catch (error) {
    console.error('Update device token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update device token. Please try again.',
    });
  }
};
