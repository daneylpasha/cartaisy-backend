import { IOrder, IProduct, IMobileStatusHistory } from '../types/index';
interface ProcessedCartItem {
    product: IProduct;
    variant?: any;
    variantId?: string;
    quantity: number;
    price: number;
    customizations?: {
        [key: string]: string;
    };
}
interface PaymentResult {
    success: boolean;
    transactionId?: string;
    error?: string;
}
interface TrackingInfo {
    trackingNumber: string;
    carrier?: string;
    trackingUrl?: string;
    estimatedDelivery?: Date;
}
interface ICartItem {
    productId: string;
    variantId?: string;
    quantity: number;
    customizations?: {
        [key: string]: string;
    };
}
interface IShippingAddress {
    firstName: string;
    lastName: string;
    company?: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    phone?: string;
}
interface IOrderTotals {
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
    currency: string;
}
/**
 * Create a mobile order with full processing pipeline
 */
export declare const createMobileOrder: (userId: string, cartData: {
    items: ICartItem[];
    billingAddress: IShippingAddress;
    shippingAddress: IShippingAddress;
    shippingMethod: string;
    specialInstructions?: string;
    deliveryPreferences?: any;
    paymentToken?: string;
    campaignId?: string;
}) => Promise<{
    order: IOrder;
    shopifyOrder?: any;
}>;
/**
 * Calculate comprehensive order totals including taxes and shipping
 */
export declare const calculateOrderTotals: (items: ProcessedCartItem[], shippingAddress: IShippingAddress) => Promise<IOrderTotals>;
/**
 * Process payment using configured payment provider
 */
export declare const processPayment: (paymentData: {
    amount: number;
    currency: string;
    paymentToken: string;
    userId: string;
    email: string;
}) => Promise<PaymentResult>;
/**
 * Mark order as fulfilled with tracking information
 */
export declare const fulfillOrder: (orderId: string, trackingInfo: TrackingInfo) => Promise<void>;
/**
 * Process order refund
 */
export declare const handleOrderRefund: (orderId: string, amount: number, reason: string, items?: Array<{
    lineItemId: string;
    quantity: number;
}>) => Promise<void>;
/**
 * Send order confirmation email/notification
 */
export declare const sendOrderConfirmation: (orderId: string) => Promise<void>;
/**
 * Enhanced order tracking with real-time updates
 */
interface OrderTrackingResponse {
    order: {
        id: string;
        orderNumber: string;
        status: string;
        totalPrice: number;
        currency: string;
        placedAt: Date;
        estimatedDelivery?: Date;
    };
    tracking: any;
    timeline: IMobileStatusHistory[];
    canBeCancelled: boolean;
    canBeReturned: boolean;
}
export declare const trackOrderProgress: (orderId: string) => Promise<OrderTrackingResponse>;
/**
 * Handle order cancellation
 */
export declare const handleOrderCancellation: (orderId: string, reason: string, userId?: string) => Promise<void>;
export {};
//# sourceMappingURL=orderService.d.ts.map