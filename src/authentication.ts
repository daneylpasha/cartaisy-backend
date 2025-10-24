import { Request } from 'express';
import jwt from 'jsonwebtoken';
import User from './models/User';

/**
 * Express Authentication Handler for TSOA
 * This function is called by tsoa-generated routes when @Security decorator is used
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

      // Fetch full user object from database (excluding password)
      const user = await User.findById(userId).select('-password');

      if (!user) {
        throw new Error('User not found');
      }

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
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Invalid or expired token');
    }
  }

  if (securityName === 'jwt-optional') {
    // Optional JWT authentication - doesn't throw errors if token is missing/invalid
    // Returns null for guest users, user object for authenticated users
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - return null for guest user
      return null;
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      const userId = decoded.userId || decoded.id;

      // Fetch full user object from database (excluding password)
      const user = await User.findById(userId).select('-password');

      if (!user || !user.isActive) {
        // User not found or inactive - return null for guest user
        return null;
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
    } catch (error) {
      // Invalid token - return null for guest user
      return null;
    }
  }

  throw new Error('Unknown security scheme');
}
