import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../types';

interface StoreOwnershipOptions {
  paramName?: string;
  allowSuperAdmin?: boolean;
}

interface StoreContextOptions {
  allowSuperAdmin?: boolean;
  /**
   * When false, a super admin with no requested store keeps req.storeId
   * unset (explicit global access). Non-super-admin users always resolve
   * to their own store. Defaults to true (a store is always required).
   */
  required?: boolean;
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

      if (!req.user.isActive) {
        res.status(403).json({
          success: false,
          error: 'User account is inactive',
        });
        return;
      }

      req.userRole = req.user.role;

      if (allowSuperAdmin && req.user.role === 'super_admin') {
        req.storeId = requestedStoreId;
        next();
        return;
      }

      const ownedStoreId = normalizeObjectId(req.user.storeId);
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

/**
 * Ensures an authenticated admin/staff user can only act on their own store,
 * for routes where the store ID may arrive via route param, query, body, or
 * X-Store-ID header - or not at all.
 *
 * - A supplied store ID must match the authenticated user's store (403 otherwise).
 * - No supplied store ID defaults to the user's own store.
 * - Super admins may target any supplied store; req.storeId is set from the
 *   request (never silently from their own record), per
 *   docs/STORE_OWNERSHIP_VALIDATION_POLICY.md.
 *
 * Always overwrites req.storeId, so the untrusted value the global
 * strictStoreValidation layer may have derived from a raw header is never
 * used for authenticated admin access.
 */
export const requireOwnedStoreContext = (options: StoreContextOptions = {}) => {
  const allowSuperAdmin = options.allowSuperAdmin ?? true;
  const required = options.required ?? true;

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

      if (!req.user.isActive) {
        res.status(403).json({
          success: false,
          error: 'User account is inactive',
        });
        return;
      }

      const rawRequested =
        (req.params as Record<string, unknown> | undefined)?.storeId ??
        (req.query as Record<string, unknown> | undefined)?.storeId ??
        (req.body as Record<string, unknown> | undefined)?.storeId ??
        req.headers['x-store-id'];

      const requestedStoreId = normalizeObjectId(rawRequested);
      if (rawRequested !== undefined && rawRequested !== null && rawRequested !== '' && !requestedStoreId) {
        res.status(400).json({
          success: false,
          error: 'Invalid store ID',
        });
        return;
      }

      req.userRole = req.user.role;

      if (allowSuperAdmin && req.user.role === 'super_admin') {
        if (requestedStoreId) {
          req.storeId = requestedStoreId;
        } else if (!required) {
          req.storeId = undefined;
        } else {
          // Super admins must always name the target store explicitly;
          // never silently fall back to their own record
          res.status(400).json({
            success: false,
            error: 'Store ID required',
          });
          return;
        }
        next();
        return;
      }

      const ownedStoreId = normalizeObjectId(req.user.storeId);
      if (!ownedStoreId || (requestedStoreId && requestedStoreId !== ownedStoreId)) {
        res.status(403).json({
          success: false,
          error: 'Store access denied',
        });
        return;
      }

      req.storeId = ownedStoreId;
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
