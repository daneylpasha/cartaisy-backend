import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Strict validation that storeId cannot be manipulated
 * Prevents security vulnerability where user changes X-Store-ID header
 */
export const strictStoreValidation = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const headerStoreId = req.headers['x-store-id'] as string;
    const token = req.headers.authorization?.replace('Bearer ', '');

    // If user is authenticated, verify storeId matches their token
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        // If token has storeId and header has storeId, they MUST match
        if (decoded.storeId && headerStoreId && decoded.storeId !== headerStoreId) {
          // SECURITY VIOLATION: User trying to access different store
          console.error(`🚨 SECURITY: StoreId manipulation attempt detected`);
          console.error(`  Token storeId: ${decoded.storeId}`);
          console.error(`  Header storeId: ${headerStoreId}`);
          console.error(`  User: ${decoded.userId}`);
          console.error(`  IP: ${req.ip}`);
          console.error(`  Path: ${req.path}`);

          res.status(403).json({
            status: 'error',
            message: 'Store ID mismatch - access denied',
          });
          return;
        }

        // Use storeId from token (more secure than header)
        req.storeId = decoded.storeId || headerStoreId;
        req.userId = decoded.userId;
      } catch (error) {
        // Invalid token - but allow if guest with valid header
        if (headerStoreId) {
          req.storeId = headerStoreId;
        }
        // Don't fail here - let subsequent auth middleware handle invalid tokens
      }
    } else if (headerStoreId) {
      // Guest user with store header
      req.storeId = headerStoreId;
    }

    // Validate storeId format (MongoDB ObjectId) if provided
    if (req.storeId && typeof req.storeId === 'string' && !/^[0-9a-fA-F]{24}$/.test(req.storeId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid Store ID format',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Store validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Validation failed',
    });
  }
};

/**
 * Middleware to require storeId on specific routes
 * Use this for routes that absolutely require a store context
 */
export const requireStoreId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.storeId) {
    res.status(400).json({
      status: 'error',
      message: 'Store ID is required',
    });
    return;
  }
  next();
};

export default strictStoreValidation;
