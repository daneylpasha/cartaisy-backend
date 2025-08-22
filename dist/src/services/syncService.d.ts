interface ISyncStatus {
    lastFullSync?: Date;
    lastIncrementalSync?: Date;
    inProgress: boolean;
    errors: string[];
    stats: {
        productsSync: number;
        customersSync: number;
        ordersSync: number;
    };
}
/**
 * Perform complete data synchronization (products, customers, orders)
 */
export declare const performFullSync: () => Promise<ISyncStatus>;
/**
 * Perform incremental sync - only recent changes since last sync
 */
export declare const performIncrementalSync: () => Promise<ISyncStatus>;
/**
 * Merge Shopify product data with our enhanced features
 */
export declare const syncProductData: (shopifyProduct: any, existingProduct?: any) => Promise<any>;
/**
 * Merge Shopify customer data with our enhanced user features
 */
export declare const syncCustomerData: (shopifyCustomer: any, existingUser?: any) => Promise<any>;
/**
 * Resolve data inconsistencies between local and Shopify data
 */
export declare const handleDataConflicts: (localData: any, shopifyData: any, type: "product" | "customer" | "order") => any;
/**
 * Validate data consistency between our system and Shopify
 */
export declare const validateSyncIntegrity: () => Promise<{
    issues: any[];
    valid: boolean;
}>;
/**
 * Get current sync status and statistics
 */
export declare const getSyncStatus: () => ISyncStatus;
/**
 * Automated sync function for scheduled execution
 */
export declare const scheduledSync: (type?: "full" | "incremental") => Promise<void>;
/**
 * Reset sync status (for testing or recovery)
 */
export declare const resetSyncStatus: () => void;
export {};
//# sourceMappingURL=syncService.d.ts.map