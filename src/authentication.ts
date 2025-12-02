import { Request } from 'express';
import jwt from 'jsonwebtoken';
import User from './models/User';
import Customer from './models/Customer';

/**
 * Express Authentication Handler for TSOA
 * This function is called by tsoa-generated routes when @Security decorator is used
 * Supports both User (admin/web) and Customer (mobile app) authentication
 */
export async function expressAuthentication(
  request: Request,
  securityName: string,
  scopes?: string[]
): Promise<any> {
  if (securityName === 'jwt') {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      const userId = decoded.userId || decoded.id;

      // First try to find in User model (admin/web users)
      let user = await User.findById(userId).select('-password');

      if (user) {
        // Check if user is active
        if (!user.isActive) {
          throw new Error('Account has been deactivated');
        }

        // Return full user object that will be available as request.user in controllers
        return {
          _id: user._id,
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          isActive: user.isActive,
          isVerified: user.isVerified,
          phone: user.phone,
          profile: user.profile,
          addresses: user.addresses,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        };
      }

      // If not found in User model, try Customer model (mobile app users)
      const customer = await Customer.findById(userId).select('-password');

      if (customer) {
        // Check if customer is active
        if (!customer.isActive) {
          throw new Error('Account has been deactivated');
        }

        // Return customer object in same format as user for controller compatibility
        return {
          _id: customer._id,
          id: customer._id.toString(),
          email: customer.email,
          role: 'customer',
          name: customer.name,
          isActive: customer.isActive,
          isVerified: customer.isVerified,
          phone: customer.phone,
          addresses: customer.addresses,
          createdAt: customer.createdAt,
          storeId: customer.storeId
        };
      }

      // Not found in either model
      throw new Error('User not found');
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Invalid or expired token');
    }
  }

  if (securityName === 'jwt-optional') {
    // Optional JWT authentication - doesn't throw errors if token is missing/invalid
    // Returns null for guest users, user object for authenticated users
    // Supports both User (admin/web) and Customer (mobile app) authentication
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - return null for guest user
      return null;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      const userId = decoded.userId || decoded.id;

      // First try to find in User model (admin/web users)
      const user = await User.findById(userId).select('-password');

      if (user && user.isActive) {
        // Return full user object that will be available as request.user in controllers
        return {
          _id: user._id,
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          isActive: user.isActive,
          isVerified: user.isVerified,
          phone: user.phone,
          profile: user.profile,
          addresses: user.addresses,
          preferences: user.preferences,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        };
      }

      // If not found in User model, try Customer model (mobile app users)
      const customer = await Customer.findById(userId).select('-password');

      if (customer && customer.isActive) {
        // Return customer object in same format as user for controller compatibility
        return {
          _id: customer._id,
          id: customer._id.toString(),
          email: customer.email,
          role: 'customer',
          name: customer.name,
          isActive: customer.isActive,
          isVerified: customer.isVerified,
          phone: customer.phone,
          addresses: customer.addresses,
          createdAt: customer.createdAt,
          storeId: customer.storeId
        };
      }

      // User/Customer not found or inactive - return null for guest user
      return null;
    } catch (error) {
      // Invalid token - return null for guest user
      return null;
    }
  }

  throw new Error('Unknown security scheme');
}
