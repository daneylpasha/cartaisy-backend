import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import User, { IUser } from '../models/User';
import { AuthenticatedRequest } from '../types';

type AuthRequest = AuthenticatedRequest;

/**
 * Authentication middleware
 * Extracts and verifies JWT token from Authorization header
 * Attaches user to request object
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        message: 'No token provided. Please authenticate.'
      });
      return;
    }

    // Get token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid token';
      res.status(401).json({
        status: 'error',
        message: errorMessage
      });
      return;
    }

    // Find user by ID from token payload
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'User not found. Please authenticate again.'
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

    // Attach user to request object with proper typing
    req.user = {
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
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed. Please try again.'
    });
  }
};

/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't fail if no token is provided
 * Useful for routes that can work with or without authentication
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = {
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
    } catch (error) {
      // Invalid token, continue without user
      console.log('Optional auth: Invalid token provided');
    }
    
    next();
  } catch (error) {
    // Error in optional auth, continue without user
    console.error('Optional authentication error:', error);
    next();
  }
};

/**
 * Role-based authorization middleware
 * Must be used after authenticate middleware
 */
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action'
      });
      return;
    }

    next();
  };
};

// Convenience aliases for common middleware combinations
export const requireAuth = authenticate;
export const optionalAuth = optionalAuthenticate;
export const requireAdmin = [authenticate, authorize('admin')];
export const requireModerator = [authenticate, authorize('admin', 'moderator')];
export const authenticateAdmin = requireAdmin;