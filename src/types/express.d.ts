import { ObjectId } from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: ObjectId;
        email: string;
        role: string;
        name: string;
        isActive: boolean;
      };
      sessionID?: string;
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      _id: ObjectId;
      email: string;
      role: string;
      name: string;
      isActive: boolean;
    };
    sessionID?: string;
  }
}

export {};