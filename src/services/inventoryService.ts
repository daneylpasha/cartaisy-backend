import mongoose from 'mongoose';
import Product from '../models/Product';
import Order from '../models/Order';
import { getInventoryLevels, updateInventory } from './shopifyService';
import { IProduct, IOrder } from '../types/index';
import { ApiError } from '../utils/errors';

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

// In-memory inventory reservations (in production, use Redis)
const inventoryReservations = new Map<string, Array<{
  orderId: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
}>>();

/**
 * Check real-time inventory availability for a product
 */
export const checkInventoryAvailability = async (
  productId: string, 
  quantity: number, 
  variantId?: string
): Promise<InventoryAvailability> => {
  try {
    // Get current product data
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    let currentStock = 0;
    let reservedStock = 0;

    if (variantId) {
      // Check specific variant inventory
      const variant = product.variants.find(v => v.id === variantId);
      if (!variant) {
        throw new Error('Product variant not found');
      }
      currentStock = variant.inventory.quantity;
      
      // Get reserved stock for this variant
      const reservations = inventoryReservations.get(`${productId}-${variantId}`) || [];
      reservedStock = reservations
        .filter(r => r.expiresAt > new Date())
        .reduce((total, r) => total + r.quantity, 0);
    } else {
      // Check total product inventory
      currentStock = product.inventoryTracking.totalQuantity;
      
      // Get reserved stock for entire product
      const reservations = inventoryReservations.get(productId) || [];
      reservedStock = reservations
        .filter(r => r.expiresAt > new Date())
        .reduce((total, r) => total + r.quantity, 0);
    }

    const availableStock = currentStock - reservedStock;
    const available = availableStock >= quantity;

    return {
      available,
      currentStock,
      reservedStock
    };
  } catch (error) {
    console.error('Error checking inventory availability:', error);
    throw new ApiError('Failed to check inventory availability', 500);
  }
};

/**
 * Reserve inventory for checkout process
 */
export const reserveInventory = async (
  productId: string, 
  quantity: number, 
  orderId: string,
  variantId?: string,
  reservationMinutes: number = 15
): Promise<ReservationResult> => {
  try {
    // Check availability first
    const availability = await checkInventoryAvailability(productId, quantity, variantId);
    
    if (!availability.available) {
      return { success: false };
    }

    // Create reservation
    const reservationKey = variantId ? `${productId}-${variantId}` : productId;
    const reservation = {
      orderId,
      quantity,
      reservedAt: new Date(),
      expiresAt: new Date(Date.now() + reservationMinutes * 60 * 1000)
    };

    // Add to reservations
    const existing = inventoryReservations.get(reservationKey) || [];
    existing.push(reservation);
    inventoryReservations.set(reservationKey, existing);

    // Schedule cleanup of expired reservations
    setTimeout(() => {
      cleanupExpiredReservations(reservationKey);
    }, reservationMinutes * 60 * 1000);

    console.log(`📦 Reserved ${quantity} units of product ${productId} for order ${orderId}`);
    return { 
      success: true, 
      reservationId: `${reservationKey}-${orderId}-${Date.now()}` 
    };
  } catch (error) {
    console.error('Error reserving inventory:', error);
    throw new ApiError('Failed to reserve inventory', 500);
  }
};

/**
 * Release held inventory (on order cancellation or timeout)
 */
export const releaseInventory = async (
  productId: string, 
  quantity: number, 
  orderId: string,
  variantId?: string
): Promise<void> => {
  try {
    const reservationKey = variantId ? `${productId}-${variantId}` : productId;
    const reservations = inventoryReservations.get(reservationKey) || [];

    // Find and remove the reservation
    const updatedReservations = reservations.filter(r => 
      !(r.orderId === orderId && r.quantity === quantity)
    );

    if (updatedReservations.length < reservations.length) {
      inventoryReservations.set(reservationKey, updatedReservations);
      console.log(`📦 Released ${quantity} units of product ${productId} for order ${orderId}`);
    } else {
      console.warn(`⚠️ No matching reservation found for product ${productId}, order ${orderId}`);
    }
  } catch (error) {
    console.error('Error releasing inventory:', error);
    throw new ApiError('Failed to release inventory', 500);
  }
};

/**
 * Sync inventory levels from Shopify
 */
export const updateInventoryLevels = async (productId?: string, storeId?: string): Promise<void> => {
  try {
    if (productId) {
      // Update specific product
      const product = await Product.findById(productId);
      if (!product || !product.shopifyProductId) {
        throw new Error('Product not found or not synced with Shopify');
      }

      // The product's own storeId is the trusted store context; fail closed
      // without it, and enforce ownership when a caller store is supplied
      if (!product.storeId) {
        throw new Error('Product has no storeId; run the product tenancy backfill before syncing inventory');
      }
      if (storeId && product.storeId.toString() !== storeId) {
        throw new Error('Product does not belong to the requested store');
      }

      const shopifyInventory = await getInventoryLevels(product.shopifyProductId, product.storeId.toString());
      
      // Update product inventory
      let totalQuantity = 0;
      for (const variant of product.variants) {
        const shopifyVariant = shopifyInventory.variants.find((v: any) => v.variantId === variant.id);
        if (shopifyVariant) {
          const oldQuantity = variant.inventory.quantity;
          variant.inventory.quantity = shopifyVariant.quantity;
          totalQuantity += shopifyVariant.quantity;

          // Add to inventory history
          if (oldQuantity !== shopifyVariant.quantity) {
            product.inventoryTracking.history.push({
              date: new Date(),
              change: shopifyVariant.quantity - oldQuantity,
              newQuantity: shopifyVariant.quantity,
              reason: 'shopify_sync',
              note: `Synced from Shopify: ${oldQuantity} → ${shopifyVariant.quantity}`
            });
          }
        }
      }

      product.inventoryTracking.totalQuantity = totalQuantity;
      await product.save();

      console.log(`📦 Updated inventory for product: ${product.title}`);
    } else {
      // Update all products with Shopify IDs, scoped to the caller's store
      // when one is supplied (scheduled jobs iterate every store's products,
      // each resolved through its own storeId)
      const products = await Product.find({
        shopifyProductId: { $exists: true },
        status: 'active',
        ...(storeId ? { storeId } : {})
      });

      for (const product of products) {
        try {
          await updateInventoryLevels(product._id.toString(), storeId);
        } catch (error) {
          console.error(`Error updating inventory for product ${product._id}:`, error);
        }
      }

      console.log(`📦 Updated inventory for ${products.length} products`);
    }
  } catch (error) {
    console.error('Error updating inventory levels:', error);
    throw new ApiError('Failed to update inventory levels', 500);
  }
};

/**
 * Get products with low stock levels. When a validated storeId is supplied
 * (merchant admin analytics, issue #79), results are scoped to that store;
 * without one the query stays platform-wide (background jobs, super admin).
 */
export const getLowStockProducts = async (threshold?: number, storeId?: string): Promise<IProduct[]> => {
  try {
    const pipeline = [
      {
        $match: {
          // Aggregation $match does not auto-cast, so convert explicitly
          ...(storeId ? { storeId: new mongoose.Types.ObjectId(storeId) } : {}),
          status: 'active',
          'inventoryTracking.tracked': true
        }
      },
      {
        $addFields: {
          isLowStock: {
            $and: [
              { $gt: ['$inventoryTracking.lowStockThreshold', 0] },
              { $lte: ['$inventoryTracking.totalQuantity', '$inventoryTracking.lowStockThreshold'] }
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { isLowStock: true },
            ...(threshold ? [{ 'inventoryTracking.totalQuantity': { $lte: threshold } }] : [])
          ]
        }
      },
      {
        $project: {
          title: 1,
          handle: 1,
          'inventoryTracking.totalQuantity': 1,
          'inventoryTracking.lowStockThreshold': 1,
          'analytics.viewCount': 1,
          'mobileDisplay.thumbnailUrl': 1,
          shopifyProductId: 1
        }
      },
      {
        $sort: { 'inventoryTracking.totalQuantity': 1 }
      }
    ];

    const lowStockProducts = await Product.aggregate(pipeline as any);
    
    console.log(`📦 Found ${lowStockProducts.length} low stock products`);
    return lowStockProducts;
  } catch (error) {
    console.error('Error getting low stock products:', error);
    throw new ApiError('Failed to get low stock products', 500);
  }
};

/**
 * Get inventory change history for a product
 */
export const getInventoryHistory = async (
  productId: string, 
  limit: number = 50
): Promise<InventoryHistoryEntry[]> => {
  try {
    const product = await Product.findById(productId)
      .select('inventoryTracking.history title');

    if (!product) {
      throw new Error('Product not found');
    }

    // Sort history by date (newest first) and limit
    const history = product.inventoryTracking.history
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);

    return history.map(entry => ({
      date: entry.date,
      change: entry.change,
      newQuantity: entry.newQuantity,
      reason: entry.reason,
      note: entry.note,
      productTitle: product.title
    }));
  } catch (error) {
    console.error('Error getting inventory history:', error);
    throw new ApiError('Failed to get inventory history', 500);
  }
};

/**
 * Handle backorder scenarios for out-of-stock products
 */
export const handleBackorders = async (productId: string): Promise<BackorderInfo> => {
  try {
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Check if product allows backorders (based on Shopify inventory policy)
    const allowBackorders = product.variants.some(v => 
      v.inventory.policy === 'continue'
    );

    if (!allowBackorders) {
      return {
        allowBackorders: false,
        backorderCount: 0
      };
    }

    // Count pending orders for out-of-stock items
    const backorderCount = await Order.aggregate([
      {
        $match: {
          'lineItems.productId': productId,
          'mobileStatus.current': { $in: ['placed', 'confirmed', 'processing'] }
        }
      },
      {
        $unwind: '$lineItems'
      },
      {
        $match: {
          'lineItems.productId': productId
        }
      },
      {
        $group: {
          _id: null,
          totalBackordered: { $sum: '$lineItems.quantity' }
        }
      }
    ]);

    const totalBackordered = backorderCount[0]?.totalBackordered || 0;

    // Estimate restock date based on historical patterns
    const estimatedRestockDate = await estimateRestockDate(productId);

    return {
      allowBackorders,
      estimatedRestockDate,
      backorderCount: totalBackordered
    };
  } catch (error) {
    console.error('Error handling backorders:', error);
    throw new ApiError('Failed to handle backorders', 500);
  }
};

/**
 * Update Shopify inventory levels
 */
export const updateShopifyInventory = async (
  productId: string,
  variantId: string,
  quantity: number,
  expectedStoreId?: string
): Promise<void> => {
  try {
    const product = await Product.findById(productId);
    if (!product || !product.shopifyProductId) {
      throw new Error('Product not found or not synced with Shopify');
    }

    // The product's own storeId is the trusted store context; fail closed
    // without it, and enforce ownership when a caller store is supplied
    if (!product.storeId) {
      throw new Error('Product has no storeId; run the product tenancy backfill before updating inventory');
    }
    if (expectedStoreId && product.storeId.toString() !== expectedStoreId) {
      throw new Error('Product does not belong to the requested store');
    }

    // Update Shopify
    await updateInventory(variantId, quantity, product.storeId.toString());

    // Update local database
    const variant = product.variants.find(v => v.id === variantId);
    if (variant) {
      const oldQuantity = variant.inventory.quantity;
      variant.inventory.quantity = quantity;

      // Update total quantity
      product.inventoryTracking.totalQuantity = product.variants.reduce(
        (total, v) => total + (v.inventory.quantity || 0), 0
      );

      // Add to history
      product.inventoryTracking.history.push({
        date: new Date(),
        change: quantity - oldQuantity,
        newQuantity: quantity,
        reason: 'manual_update',
        note: `Manually updated inventory: ${oldQuantity} → ${quantity}`
      });

      await product.save();
      console.log(`📦 Updated inventory for ${product.title} variant ${variantId}: ${quantity}`);
    }
  } catch (error) {
    console.error('Error updating Shopify inventory:', error);
    throw new ApiError('Failed to update Shopify inventory', 500);
  }
};

/**
 * Get current inventory reservations
 */
export const getInventoryReservations = (productId: string, variantId?: string): InventoryReservation[] => {
  const reservationKey = variantId ? `${productId}-${variantId}` : productId;
  const reservations = inventoryReservations.get(reservationKey) || [];
  
  // Filter out expired reservations
  const activeReservations = reservations.filter(r => r.expiresAt > new Date());
  
  // Update the map with only active reservations
  if (activeReservations.length !== reservations.length) {
    inventoryReservations.set(reservationKey, activeReservations);
  }
  
  return activeReservations;
};

/**
 * Cleanup expired inventory reservations
 */
const cleanupExpiredReservations = (reservationKey: string): void => {
  const reservations = inventoryReservations.get(reservationKey) || [];
  const activeReservations = reservations.filter(r => r.expiresAt > new Date());
  
  if (activeReservations.length !== reservations.length) {
    inventoryReservations.set(reservationKey, activeReservations);
    console.log(`🧹 Cleaned up expired reservations for ${reservationKey}`);
  }
};

/**
 * Estimate restock date based on historical inventory patterns
 */
const estimateRestockDate = async (productId: string): Promise<Date | undefined> => {
  try {
    const product = await Product.findById(productId);
    if (!product) return undefined;

    // Look at historical restock patterns
    const restockEvents = product.inventoryTracking.history
      .filter(entry => entry.change > 0 && entry.reason === 'shopify_sync')
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5); // Last 5 restock events

    if (restockEvents.length < 2) {
      // Not enough data, estimate 7-14 days
      const estimatedDays = 7 + Math.random() * 7;
      return new Date(Date.now() + estimatedDays * 24 * 60 * 60 * 1000);
    }

    // Calculate average time between restocks
    const intervals = [];
    for (let i = 0; i < restockEvents.length - 1; i++) {
      const interval = restockEvents[i].date.getTime() - restockEvents[i + 1].date.getTime();
      intervals.push(interval);
    }

    const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const lastRestockDate = restockEvents[0].date;
    
    return new Date(lastRestockDate.getTime() + averageInterval);
  } catch (error) {
    console.error('Error estimating restock date:', error);
    return undefined;
  }
};

/**
 * Bulk inventory update for multiple products
 */
export const bulkUpdateInventory = async (updates: BulkInventoryUpdate[], expectedStoreId?: string): Promise<BulkUpdateResult> => {
  const errors: string[] = [];
  let success = 0;

  for (const update of updates) {
    try {
      if (update.variantId) {
        await updateShopifyInventory(update.productId, update.variantId, update.quantity, expectedStoreId);
      } else {
        // Update all variants proportionally
        const product = await Product.findById(update.productId);
        if (product && product.variants.length > 0) {
          const quantityPerVariant = Math.floor(update.quantity / product.variants.length);
          for (const variant of product.variants) {
            await updateShopifyInventory(update.productId, variant.id, quantityPerVariant, expectedStoreId);
          }
        }
      }
      success++;
    } catch (error) {
      errors.push(`Failed to update ${update.productId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { success, errors };
};