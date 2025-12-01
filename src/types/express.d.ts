import { ObjectId } from 'mongoose';

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
      userRole?: string;
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
    userRole?: string;
  }
}

export {};