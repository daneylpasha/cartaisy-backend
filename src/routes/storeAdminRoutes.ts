import express, { Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
import { getSyncStatus } from '../services/syncService';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Order from '../models/Order';
import Store from '../models/Store';

const router = express.Router();

/**
 * Store Admin Routes
 *
 * Admin endpoints for store-specific operations.
 * Mounted at /api/v1 to support paths like /stores/:storeId/admin/...
 */

/**
 * GET /stores/:storeId/admin/sync/status
 *
 * Get Shopify sync status for dashboard display
 *
 * Returns:
 * - status: healthy | syncing | error | unknown
 * - lastSync: timestamp and type of last sync
 * - nextScheduledSync: when next sync will run
 * - resources: counts for products, customers, orders, inventory
 */
router.get(
  '/stores/:storeId/admin/sync/status',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  async (req: Request, res: Response) => {
    try {
      const { storeId } = req.params;

      // Get this store's sync status from the in-memory tracker
      const syncStatus = getSyncStatus(storeId);

      // Get resource counts for this store (in parallel)
      const [productCount, customerCount, orderCount, store] = await Promise.all([
        Product.countDocuments({ storeId }),
        Customer.countDocuments({ storeId }),
        Order.countDocuments({ storeId }),
        Store.findById(storeId).select('shopify.lastSyncAt name'),
      ]);

      // Calculate next scheduled sync (incremental runs every 4 hours)
      const now = new Date();
      const nextSync = new Date(now);
      nextSync.setHours(nextSync.getHours() + (4 - (nextSync.getHours() % 4)));
      nextSync.setMinutes(0, 0, 0);

      // Get last sync info - prefer store-specific, fallback to global
      const storeLastSync = store?.shopify?.lastSyncAt;
      const lastSyncDate = storeLastSync || syncStatus.lastIncrementalSync || syncStatus.lastFullSync;

      // Determine overall status
      let status: 'healthy' | 'syncing' | 'error' | 'unknown' = 'unknown';
      if (syncStatus.inProgress) {
        status = 'syncing';
      } else if (syncStatus.errors.length > 0) {
        status = 'error';
      } else if (lastSyncDate) {
        // Check if last sync was within 24 hours
        const hoursSinceSync = (Date.now() - new Date(lastSyncDate).getTime()) / (1000 * 60 * 60);
        status = hoursSinceSync < 24 ? 'healthy' : 'error'; // Stale data = error
      }

      const lastSyncType = syncStatus.lastIncrementalSync
        ? (syncStatus.lastIncrementalSync > (syncStatus.lastFullSync || new Date(0)) ? 'incremental' : 'full')
        : (syncStatus.lastFullSync ? 'full' : null);

      res.json({
        success: true,
        data: {
          status,
          lastSync: {
            completedAt: lastSyncDate?.toISOString() || null,
            type: lastSyncType,
          },
          nextScheduledSync: nextSync.toISOString(),
          resources: {
            products: {
              count: productCount,
              lastUpdated: lastSyncDate?.toISOString() || null,
            },
            customers: {
              count: customerCount,
              lastUpdated: lastSyncDate?.toISOString() || null,
            },
            orders: {
              count: orderCount,
              lastUpdated: lastSyncDate?.toISOString() || null,
            },
            inventory: {
              count: productCount,
              lastUpdated: lastSyncDate?.toISOString() || null,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error getting sync status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sync status',
      });
    }
  }
);

export default router;
