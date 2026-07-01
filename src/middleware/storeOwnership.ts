import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import User from '../models/User';
import { AuthenticatedRequest } from '../types';

interface StoreOwnershipOptions {
  paramName?: string;
  allowSuperAdmin?: boolean;
}

const normalizeObjectId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  const stringValue = value.toString();
  return Types.ObjectId.isValid(stringValue) ? stringValue : null;
};

/**
 * Ensures an authenticated admin/staff user can only access their own :storeId.
 *
 * Super admins are allowed to target the requested store explicitly, and req.storeId
 * is always set from the validated route param so downstream handlers use the same
 * effective store context.
 */
export const requireOwnedStoreParam = (options: StoreOwnershipOptions = {}) => {
  const paramName = options.paramName || 'storeId';
  const allowSuperAdmin = options.allowSuperAdmin ?? true;

  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      const requestedStoreId = normalizeObjectId(req.params[paramName]);
      if (!requestedStoreId) {
        res.status(400).json({
          success: false,
          error: 'Invalid store ID',
        });
        return;
      }

      const user = await User.findById(req.user._id).select('storeId role isActive');
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({
          success: false,
          error: 'User account is inactive',
        });
        return;
      }

      req.userRole = user.role;

      if (allowSuperAdmin && user.role === 'super_admin') {
        req.storeId = requestedStoreId;
        next();
        return;
      }

      const ownedStoreId = normalizeObjectId(user.storeId);
      if (!ownedStoreId || ownedStoreId !== requestedStoreId) {
        res.status(403).json({
          success: false,
          error: 'Store access denied',
        });
        return;
      }

      req.storeId = requestedStoreId;
      next();
    } catch (error) {
      console.error('Store ownership authorization error:', error);
      res.status(500).json({
        success: false,
        error: 'Store ownership authorization failed',
      });
    }
  };
};
