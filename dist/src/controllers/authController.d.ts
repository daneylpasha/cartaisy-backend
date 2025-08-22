import { Request, Response } from 'express';
import { IUser } from '../models/User';
interface AuthRequest extends Request {
    user?: IUser;
}
/**
 * Register a new user
 */
export declare const register: (req: Request, res: Response) => Promise<void>;
/**
 * Login user
 */
export declare const login: (req: Request, res: Response) => Promise<void>;
/**
 * Request password reset
 */
export declare const forgotPassword: (req: Request, res: Response) => Promise<void>;
/**
 * Reset password with token
 */
export declare const resetPassword: (req: Request, res: Response) => Promise<void>;
/**
 * Get current user profile
 */
export declare const getProfile: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * Update user profile
 */
export declare const updateProfile: (req: AuthRequest, res: Response) => Promise<void>;
/**
 * Change password
 */
export declare const changePassword: (req: AuthRequest, res: Response) => Promise<void>;
export {};
//# sourceMappingURL=authController.d.ts.map