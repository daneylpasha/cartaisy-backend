import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User';
interface AuthRequest extends Request {
    user?: IUser;
}
/**
 * Authentication middleware
 * Extracts and verifies JWT token from Authorization header
 * Attaches user to request object
 */
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't fail if no token is provided
 * Useful for routes that can work with or without authentication
 */
export declare const optionalAuthenticate: (req: AuthRequest, _res: Response, next: NextFunction) => Promise<void>;
/**
 * Role-based authorization middleware
 * Must be used after authenticate middleware
 */
export declare const authorize: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void;
export declare const requireAuth: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>;
export declare const optionalAuth: (req: AuthRequest, _res: Response, next: NextFunction) => Promise<void>;
export declare const requireAdmin: ((req: AuthRequest, res: Response, next: NextFunction) => void)[];
export declare const requireModerator: ((req: AuthRequest, res: Response, next: NextFunction) => void)[];
export {};
//# sourceMappingURL=auth.d.ts.map