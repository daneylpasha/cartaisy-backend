import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import Customer from '../models/Customer';

export interface CustomerInfo {
  id: string;
  storeId: string;
  email: string;
}

/**
 * Required authentication middleware for customers
 * Extracts and verifies JWT token from Authorization header
 * Uses shared JWT format with { userId } payload
 * Attaches customer info to request object
 */
export const authenticateCustomer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        message: 'No token provided. Please authenticate.',
      });
      return;
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = verifyToken(token);
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
        message: 'Invalid token',
      });
      return;
    }

    // Get userId from token payload (shared JWT format)
    const userId = decoded.userId;

    if (!userId) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid token',
      });
      return;
    }

    // Verify customer exists and is active
    const customer = await Customer.findById(userId).select('isActive storeId email');

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
        message: 'Your account has been deactivated. Please contact support.',
      });
      return;
    }

    // Attach customer info to request
    req.customer = {
      id: userId,
      storeId: customer.storeId.toString(),
      email: customer.email,
    };
    req.storeId = customer.storeId.toString();

    next();
  } catch (error) {
    console.error('Customer authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication failed. Please try again.',
    });
  }
};

/**
 * Optional authentication middleware for customers
 * Similar to authenticateCustomer but doesn't fail if no token is provided
 * If token is invalid, continues without attaching customer info
 * Useful for routes that can work with or without authentication
 */
export const optionalCustomerAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      // Invalid token, continue without customer
      return next();
    }

    const userId = decoded.userId;

    if (!userId) {
      return next();
    }

    // Verify customer exists and is active
    const customer = await Customer.findById(userId).select('isActive storeId email');

    if (customer && customer.isActive) {
      req.customer = {
        id: userId,
        storeId: customer.storeId.toString(),
        email: customer.email,
      };
      req.storeId = customer.storeId.toString();
    }

    next();
  } catch (error) {
    // Error in optional auth, continue without customer
    console.error('Optional customer authentication error:', error);
    next();
  }
};

/**
 * Middleware to extract storeId from request for public endpoints
 * Checks X-Store-ID header, query param, or body
 * Returns 400 if no storeId is found
 */
export const extractStoreId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const storeId =
    (req.headers['x-store-id'] as string) ||
    (req.query.storeId as string) ||
    req.body?.storeId;

  if (!storeId) {
    res.status(400).json({
      status: 'error',
      message: 'Store ID is required. Provide X-Store-ID header, storeId query param, or storeId in body.',
    });
    return;
  }

  req.storeId = storeId;
  next();
};
