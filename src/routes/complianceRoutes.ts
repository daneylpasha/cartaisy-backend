import express, { Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  exportCustomerData,
  exportAllCustomersData,
  getExportStatus,
  getExportHistory,
  deleteCustomerData,
  downloadExportData,
} from '../controllers/admin/complianceController';
import Product from '../models/Product';
import Customer from '../models/Customer';
import Order from '../models/Order';
import Store from '../models/Store';
import { getSyncStatus, validateSyncIntegrity } from '../services/syncService';

const router = express.Router();

/**
 * GDPR Compliance Routes
 *
 * Admin endpoints for GDPR data export and deletion.
 * All routes require authentication and admin role.
 *
 * Routes:
 * - POST /stores/:storeId/compliance/export/customer/:customerId  - Export single customer
 * - POST /stores/:storeId/compliance/export/all                   - Export all customers
 * - GET  /stores/:storeId/compliance/export/:exportId             - Get export status
 * - GET  /stores/:storeId/compliance/export/:exportId/download    - Download export
 * - GET  /stores/:storeId/compliance/exports                      - Get export history
 * - POST /stores/:storeId/compliance/delete/customer/:customerId  - Delete customer data
 */

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// =============================================================================
// DATA EXPORT ENDPOINTS
// =============================================================================

/**
 * POST /stores/:storeId/compliance/export/customer/:customerId
 *
 * Export all data for a specific customer (GDPR Article 20 - Data Portability)
 *
 * Returns:
 * - Export ID and status
 * - Complete customer data export
 */
router.post('/stores/:storeId/compliance/export/customer/:customerId', exportCustomerData);

/**
 * POST /stores/:storeId/compliance/export/all
 *
 * Export all customer data for the entire store (bulk export)
 *
 * WARNING: This can be resource-intensive for large stores.
 * Consider implementing pagination or background processing for production.
 *
 * Returns:
 * - Export ID
 * - Array of all customer data exports
 */
router.post('/stores/:storeId/compliance/export/all', exportAllCustomersData);

/**
 * GET /stores/:storeId/compliance/export/:exportId
 *
 * Get status of a specific export request
 *
 * Returns:
 * - Export status (pending, processing, completed, failed, expired)
 * - Export metadata (size, categories, dates)
 * - Download URL if completed
 */
router.get('/stores/:storeId/compliance/export/:exportId', getExportStatus);

/**
 * GET /stores/:storeId/compliance/export/:exportId/download
 *
 * Download the exported data as JSON file
 *
 * Returns:
 * - JSON file with all customer data
 */
router.get('/stores/:storeId/compliance/export/:exportId/download', downloadExportData);

/**
 * GET /stores/:storeId/compliance/exports
 *
 * Get all export requests for the store
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
 *
 * Returns:
 * - Paginated list of export requests
 */
router.get('/stores/:storeId/compliance/exports', getExportHistory);

// =============================================================================
// DATA DELETION ENDPOINTS (RIGHT TO BE FORGOTTEN)
// =============================================================================

/**
 * POST /stores/:storeId/compliance/delete/customer/:customerId
 *
 * Delete all personal data for a customer (GDPR Article 17 - Right to be Forgotten)
 *
 * Body:
 * - confirmDelete: boolean (required, must be true)
 * - reason: string (optional, for audit purposes)
 *
 * This will:
 * - Anonymize orders (preserve for financial records)
 * - Delete payment methods
 * - Delete search history
 * - Delete product views
 * - Delete cart activity
 * - Delete wishlists
 * - Delete notification data
 * - Anonymize audit logs
 * - Delete customer account
 *
 * Returns:
 * - Deletion summary with counts
 */
router.post('/stores/:storeId/compliance/delete/customer/:customerId', deleteCustomerData);

// =============================================================================
// SYNC STATUS ENDPOINT
// =============================================================================

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
router.get('/stores/:storeId/admin/sync/status', async (req: Request, res: Response) => {
  try {
    const { storeId } = req.params;

    // Get global sync status from in-memory tracker
    const syncStatus = getSyncStatus();

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
});

export default router;
