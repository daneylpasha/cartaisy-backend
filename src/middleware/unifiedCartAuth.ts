import { Request, Response, NextFunction } from 'express';
import mongoose, { ObjectId } from 'mongoose';
import { verifyToken } from '../utils/jwt';
import Customer from '../models/Customer';
import GuestSession, { IGuestSession } from '../models/GuestSession';
import { findStoreProductById } from '../utils/productOwnership';

// Type augmentation for Express Request (to complement express.d.ts)
declare module 'express-serve-static-core' {
  interface Request {
    cartUser?: UnifiedCartUser;
    customer?: {
      id: string;
      storeId: string;
      email: string;
    };
    storeId?: ObjectId | string;
  }
}

/**
 * Unified Cart Authentication Middleware
 *
 * Handles both authenticated customers and guest users with a single API.
 * Features:
 * - Automatic detection of user type (customer vs guest)
 * - Auto-merge guest cart when customer logs in
 * - Session creation for new guests
 * - Transparent handling for both user types
 *
 * Headers:
 * - X-Store-ID: Required (always)
 * - Authorization: Bearer <token>: Optional (if present = registered customer)
 * - X-Session-ID: Optional (if no auth = guest session)
 * - X-Device-ID: Recommended (for analytics and multi-session tracking)
 */

export interface UnifiedCartUser {
  userType: 'customer' | 'guest';
  userId: string; // customerId or sessionId
  storeId: string;
  customer?: {
    id: string;
    email: string;
    storeId: string;
  };
  guestSession?: IGuestSession;
}


/**
 * Merge guest cart into customer account
 * Called when a customer logs in with an existing guest session
 */
async function mergeGuestCartToCustomer(
  sessionId: string,
  customerId: string,
  storeId: string
): Promise<void> {
  try {
    const guestSession = await GuestSession.findOne({
      sessionId,
      storeId,
      expiresAt: { $gt: new Date() },
      convertedToCustomerId: { $exists: false },
    });

    if (!guestSession || guestSession.cart.items.length === 0) {
      return; // Nothing to merge
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return;

    // Merge cart items
    for (const guestItem of guestSession.cart.items) {
      const product = await findStoreProductById(
        guestItem.product.toString(),
        customer.storeId.toString()
      );
      if (!product) {
        continue;
      }

      const existingItemIndex = customer.cart.items.findIndex(
        (item) =>
          item.productId.toString() === guestItem.product.toString() &&
          item.variantId === guestItem.variantId
      );

      if (existingItemIndex > -1) {
        // Merge quantities (cap at reasonable max)
        customer.cart.items[existingItemIndex].quantity = Math.min(
          customer.cart.items[existingItemIndex].quantity + guestItem.quantity,
          99
        );
      } else {
        // Add new item
        customer.cart.items.push({
          productId: guestItem.product,
          variantId: guestItem.variantId,
          quantity: guestItem.quantity,
          addedAt: guestItem.addedAt,
        });
      }
    }

    // Merge wishlist (avoid duplicates)
    for (const wishlistItem of guestSession.wishlist) {
      const exists = customer.wishlist.some(
        (item) => item.toString() === wishlistItem.toString()
      );
      if (!exists) {
        customer.wishlist.push(wishlistItem);
      }
    }

    customer.cart.updatedAt = new Date();
    await customer.save();

    // Mark session as converted
    guestSession.cart.items = [];
    guestSession.cart.updatedAt = new Date();
    guestSession.convertedToCustomerId = customer._id as mongoose.Types.ObjectId;
    guestSession.convertedAt = new Date();
    await guestSession.save();

    console.log(`Merged guest session ${sessionId} to customer ${customerId}`);
  } catch (error) {
    console.error('Cart merge error:', error);
    // Don't throw - merging is best-effort
  }
}

/**
 * Unified middleware that handles both authenticated customers and guest users
 * Automatically merges guest cart when customer logs in
 */
export const authenticateCart = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get storeId (required for all requests)
    const storeId =
      (req.headers['x-store-id'] as string) ||
      (req.query.storeId as string) ||
      req.body?.storeId;

    if (!storeId) {
      res.status(400).json({
        status: 'error',
        message:
          'Store ID is required. Provide X-Store-ID header, storeId query param, or storeId in body.',
      });
      return;
    }

    // Check for authentication token
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
    const sessionId = req.headers['x-session-id'] as string;
    const deviceId = req.headers['x-device-id'] as string;

    if (token) {
      // AUTHENTICATED CUSTOMER FLOW
      try {
        const decoded = verifyToken(token);
        const userId = decoded.userId;

        if (!userId) {
          res.status(401).json({
            status: 'error',
            message: 'Invalid token',
          });
          return;
        }

        const customer = await Customer.findById(userId).select(
          'isActive storeId email'
        );

        if (!customer) {
          res.status(401).json({
            status: 'error',
            message: 'User not found. Please register or login again.',
          });
          return;
        }

        if (!customer.isActive) {
          res.status(401).json({
            status: 'error',
            message:
              'Your account has been deactivated. Please contact support.',
          });
          return;
        }

        // Set up cart user info
        req.cartUser = {
          userType: 'customer',
          userId: customer._id.toString(),
          storeId: customer.storeId.toString(),
          customer: {
            id: customer._id.toString(),
            email: customer.email,
            storeId: customer.storeId.toString(),
          },
        };

        // Also set standard customer/storeId for compatibility
        req.customer = {
          id: customer._id.toString(),
          storeId: customer.storeId.toString(),
          email: customer.email,
        };
        req.storeId = customer.storeId.toString();

        // AUTO-MERGE: If there's a session ID, merge guest cart
        if (sessionId) {
          await mergeGuestCartToCustomer(
            sessionId,
            customer._id.toString(),
            customer.storeId.toString()
          );
        }

        next();
      } catch (error: any) {
        if (error.message === 'Token has expired') {
          res.status(401).json({
            status: 'error',
            message: 'Token has expired. Please login again.',
          });
          return;
        }
        res.status(401).json({
          status: 'error',
          message: 'Invalid authentication token',
        });
        return;
      }
    } else {
      // GUEST FLOW
      const { session, isNew } = await GuestSession.findOrCreateSession(
        sessionId,
        storeId,
        deviceId
      );

      // Set up cart user info
      req.cartUser = {
        userType: 'guest',
        userId: session.sessionId,
        storeId: storeId,
        guestSession: session,
      };
      req.storeId = storeId;

      // Return new session ID in header if created
      if (isNew || !sessionId) {
        res.setHeader('X-Session-ID', session.sessionId);
      }

      next();
    }
  } catch (error) {
    console.error('Cart authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional cart auth - similar to authenticateCart but doesn't fail if no session
 * Useful for endpoints that work differently for guests vs customers
 */
export const optionalCartAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const storeId =
      (req.headers['x-store-id'] as string) ||
      (req.query.storeId as string) ||
      req.body?.storeId;

    if (!storeId) {
      // No store ID, continue without cart user
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;
    const sessionId = req.headers['x-session-id'] as string;
    // deviceId is captured but not used in optional auth (used for logging only)
    const _deviceId = req.headers['x-device-id'] as string;

    if (token) {
      // Try to authenticate customer
      try {
        const decoded = verifyToken(token);
        const userId = decoded.userId;

        if (userId) {
          const customer = await Customer.findById(userId).select(
            'isActive storeId email'
          );

          if (customer && customer.isActive) {
            req.cartUser = {
              userType: 'customer',
              userId: customer._id.toString(),
              storeId: customer.storeId.toString(),
              customer: {
                id: customer._id.toString(),
                email: customer.email,
                storeId: customer.storeId.toString(),
              },
            };
            req.customer = {
              id: customer._id.toString(),
              storeId: customer.storeId.toString(),
              email: customer.email,
            };
            req.storeId = customer.storeId.toString();

            // Auto-merge if session ID present
            if (sessionId) {
              await mergeGuestCartToCustomer(
                sessionId,
                customer._id.toString(),
                customer.storeId.toString()
              );
            }
          }
        }
      } catch {
        // Invalid token, continue without auth
      }
    } else if (sessionId) {
      // Try to find existing guest session
      const session = await GuestSession.findOne({
        sessionId,
        storeId,
        expiresAt: { $gt: new Date() },
      });

      if (session) {
        session.lastActivityAt = new Date();
        await session.save();

        req.cartUser = {
          userType: 'guest',
          userId: session.sessionId,
          storeId: storeId,
          guestSession: session,
        };
        req.storeId = storeId;
      }
    }

    next();
  } catch (error) {
    console.error('Optional cart auth error:', error);
    // Don't fail, just continue without cart user
    next();
  }
};

/**
 * Middleware to require either customer auth or guest session
 * Similar to authenticateCart but explicitly requires one or the other
 */
export const requireCartUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  await authenticateCart(req, res, () => {
    if (!req.cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or guest session required',
      });
      return;
    }
    next();
  });
};

export { mergeGuestCartToCustomer };
