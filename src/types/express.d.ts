import { ObjectId } from 'mongoose';
import { IGuestSession } from '../models/GuestSession';

/**
 * Unified cart user info - supports both customers and guests
 */
interface UnifiedCartUser {
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

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: ObjectId;
        storeId?: ObjectId;
        email: string;
        role: string;
        name: string;
        isActive: boolean;
      };
      customer?: {
        id: string;
        storeId: string;
        email: string;
      };
      sessionID?: string;
      storeId?: ObjectId | string;
      userId?: string; // For security middleware
      userRole?: string;
      // Unified cart user for guest checkout support
      cartUser?: UnifiedCartUser;
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      _id: ObjectId;
      storeId?: ObjectId;
      email: string;
      role: string;
      name: string;
      isActive: boolean;
    };
    customer?: {
      id: string;
      storeId: string;
      email: string;
    };
    sessionID?: string;
    storeId?: ObjectId | string;
    userId?: string; // For security middleware
    userRole?: string;
    // Unified cart user for guest checkout support
    cartUser?: UnifiedCartUser;
  }
}

export {};