import { Response, NextFunction } from 'express';
import User from '../models/User';
import { AuthenticatedRequest } from '../types';

/**
 * Store Authentication Middleware
 *
 * Ensures that authenticated users have a valid storeId and attaches it to the request.
 * This middleware should be used after the authenticate middleware on all protected routes
 * that need to filter data by store.
 */
export const storeAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Get user with storeId
    const user = await User.findById(req.user._id).select('storeId role isActive');

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        error: 'User account is inactive'
      });
      return;
    }

    if (!user.storeId) {
      res.status(403).json({
        success: false,
        error: 'No store access. Please contact administrator.'
      });
      return;
    }

    // Attach storeId to request for use in controllers
    req.storeId = user.storeId as any;
    req.userRole = user.role;

    next();
  } catch (error) {
    console.error('Store authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Store authentication failed'
    });
  }
};

/**
 * Admin Authorization Middleware
 *
 * Ensures user has admin role within their store.
 * Should be used after storeAuth middleware.
 */
export const storeAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.storeId) {
    res.status(401).json({
      success: false,
      error: 'Store authentication required'
    });
    return;
  }

  const adminRoles = ['admin', 'super_admin'];
  if (!req.userRole || !adminRoles.includes(req.userRole)) {
    res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
    return;
  }

  next();
};

/**
 * Super Admin Authorization Middleware
 *
 * Ensures user is a super_admin (global administrator).
 * Should be used after storeAuth middleware.
 */
export const superAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.storeId) {
    res.status(401).json({
      success: false,
      error: 'Store authentication required'
    });
    return;
  }

  if (req.userRole !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Super admin access required'
    });
    return;
  }

  next();
};

/**
 * Utility function to get storeId from request (with fallback to query/header)
 *
 * This is useful for public endpoints that need to know which store to fetch data for.
 * Attempts to get storeId from:
 * 1. req.storeId (set by storeAuth middleware)
 * 2. query parameter: ?storeId=xxx
 * 3. header: X-Store-ID header
 *
 * Returns null if storeId cannot be determined.
 */
export const getStoreIdFromRequest = (req: AuthenticatedRequest): string | null => {
  // First try from storeAuth middleware
  if (req.storeId) {
    return typeof req.storeId === 'string' ? req.storeId : req.storeId.toString();
  }

  // Try query parameter
  const queryStoreId = (req.query as any)?.storeId;
  if (typeof queryStoreId === 'string') {
    return queryStoreId;
  }

  // Try header
  const headerStoreId = req.headers['x-store-id'];
  if (typeof headerStoreId === 'string') {
    return headerStoreId;
  }

  return null;
};
