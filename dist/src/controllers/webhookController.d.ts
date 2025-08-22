import { Request, Response } from 'express';
/**
 * Middleware to verify Shopify webhook signature
 */
export declare const verifyWebhookSignature: (req: Request, res: Response, next: any) => Response<any, Record<string, any>> | undefined;
/**
 * Handle product update webhook from Shopify
 */
export declare const handleProductUpdate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle product creation webhook from Shopify
 */
export declare const handleProductCreate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle product deletion webhook from Shopify
 */
export declare const handleProductDelete: (req: Request, res: Response) => Promise<void>;
/**
 * Handle order creation webhook from Shopify
 */
export declare const handleOrderCreate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle order update webhook from Shopify
 */
export declare const handleOrderUpdate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle order payment webhook from Shopify
 */
export declare const handleOrderPaid: (req: Request, res: Response) => Promise<void>;
/**
 * Handle customer creation webhook from Shopify
 */
export declare const handleCustomerCreate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle customer update webhook from Shopify
 */
export declare const handleCustomerUpdate: (req: Request, res: Response) => Promise<void>;
/**
 * Handle inventory level update webhook from Shopify
 */
export declare const handleInventoryUpdate: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=webhookController.d.ts.map