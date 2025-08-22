import { Request, Response } from 'express';
import mongoose from 'mongoose';
interface AuthenticatedRequest extends Request {
    user?: {
        _id: mongoose.Types.ObjectId;
        email: string;
        role: string;
        name: string;
        isActive: boolean;
    };
}
export declare const getUserOrders: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const createOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const updateOrderStatus: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const cancelOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const requestReturn: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getOrderTracking: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const rateOrder: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const createSupportTicket: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export declare const getOrderAnalytics: (req: AuthenticatedRequest, res: Response) => Promise<void>;
export {};
//# sourceMappingURL=orderController.d.ts.map