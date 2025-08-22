import Shopify from '@shopify/shopify-api';
import { IShopifyProduct, IAddress, IOrderLineItem } from '../types/index';
interface SyncResult {
    synced: number;
    errors: string[];
}
interface InventoryLevel {
    variantId: string;
    quantity: number;
    policy: string;
    tracked: boolean;
}
interface InventoryLevelsResponse {
    productId: string;
    totalQuantity: number;
    variants: InventoryLevel[];
}
/**
 * Initialize Shopify Admin API client using tenant configuration
 */
export declare const getShopifyClient: () => Shopify.Clients.Rest;
/**
 * Test Shopify API connectivity
 */
export declare const testShopifyConnection: () => Promise<boolean>;
/**
 * Fetch all products from Shopify and sync with our Product model
 */
export declare const syncProducts: () => Promise<SyncResult>;
/**
 * Sync single product with enhanced mobile features
 */
export declare const syncProduct: (productId: string, shopifyProduct?: IShopifyProduct) => Promise<void>;
/**
 * Import Shopify customers and merge with our User model
 */
export declare const syncCustomers: () => Promise<SyncResult>;
/**
 * Import recent orders and enhance with our tracking system
 */
export declare const syncOrders: (daysBack?: number) => Promise<SyncResult>;
/**
 * Get real-time inventory levels for a product
 */
export declare const getInventoryLevels: (productId: string) => Promise<InventoryLevelsResponse>;
/**
 * Update Shopify inventory for a variant
 */
export declare const updateInventory: (variantId: string, quantity: number) => Promise<void>;
/**
 * Create order in Shopify from mobile app
 */
export declare const createOrder: (orderData: {
    email: string;
    lineItems: IOrderLineItem[];
    shippingAddress: IAddress;
    billingAddress: IAddress;
    specialInstructions?: string;
}) => Promise<IShopifyProduct>;
/**
 * Update order status and sync
 */
export declare const updateOrderStatus: (shopifyOrderId: string, status: string) => Promise<void>;
/**
 * Generate and verify webhook signature for Shopify webhooks
 */
export declare const getShopifyWebhookSignature: (body: string, secret: string) => string;
/**
 * Verify webhook signature
 */
export declare const verifyWebhookSignature: (body: string, signature: string, secret: string) => boolean;
export {};
//# sourceMappingURL=shopifyService.d.ts.map