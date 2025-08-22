import { IProduct } from '../types/index';
interface InventoryAvailability {
    available: boolean;
    currentStock: number;
    reservedStock: number;
}
interface InventoryReservation {
    orderId: string;
    quantity: number;
    reservedAt: Date;
    expiresAt: Date;
}
interface ReservationResult {
    success: boolean;
    reservationId?: string;
}
interface BackorderInfo {
    allowBackorders: boolean;
    estimatedRestockDate?: Date;
    backorderCount: number;
}
interface BulkUpdateResult {
    success: number;
    errors: string[];
}
interface InventoryHistoryEntry {
    date: Date;
    change: number;
    newQuantity: number;
    reason: string;
    note: string;
    productTitle: string;
}
interface BulkInventoryUpdate {
    productId: string;
    variantId?: string;
    quantity: number;
}
/**
 * Check real-time inventory availability for a product
 */
export declare const checkInventoryAvailability: (productId: string, quantity: number, variantId?: string) => Promise<InventoryAvailability>;
/**
 * Reserve inventory for checkout process
 */
export declare const reserveInventory: (productId: string, quantity: number, orderId: string, variantId?: string, reservationMinutes?: number) => Promise<ReservationResult>;
/**
 * Release held inventory (on order cancellation or timeout)
 */
export declare const releaseInventory: (productId: string, quantity: number, orderId: string, variantId?: string) => Promise<void>;
/**
 * Sync inventory levels from Shopify
 */
export declare const updateInventoryLevels: (productId?: string) => Promise<void>;
/**
 * Get products with low stock levels
 */
export declare const getLowStockProducts: (threshold?: number) => Promise<IProduct[]>;
/**
 * Get inventory change history for a product
 */
export declare const getInventoryHistory: (productId: string, limit?: number) => Promise<InventoryHistoryEntry[]>;
/**
 * Handle backorder scenarios for out-of-stock products
 */
export declare const handleBackorders: (productId: string) => Promise<BackorderInfo>;
/**
 * Update Shopify inventory levels
 */
export declare const updateShopifyInventory: (productId: string, variantId: string, quantity: number) => Promise<void>;
/**
 * Get current inventory reservations
 */
export declare const getInventoryReservations: (productId: string, variantId?: string) => InventoryReservation[];
/**
 * Bulk inventory update for multiple products
 */
export declare const bulkUpdateInventory: (updates: BulkInventoryUpdate[]) => Promise<BulkUpdateResult>;
export {};
//# sourceMappingURL=inventoryService.d.ts.map