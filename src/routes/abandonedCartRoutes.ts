import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  listAbandonedCarts,
  getAbandonedCartStats,
  getSettings,
  updateSettings,
  getSchedulerStatus,
  triggerProcessing,
  triggerGlobalProcessing,
  resetNotificationCount,
} from '../controllers/admin/abandonedCartController';

const router = express.Router();

/**
 * Abandoned Cart Admin Routes
 *
 * Admin endpoints for managing abandoned cart notifications.
 * All routes require authentication and admin role.
 *
 * Routes:
 * Store-specific:
 * - GET  /stores/:storeId/abandoned-carts           - List abandoned carts
 * - GET  /stores/:storeId/abandoned-carts/stats     - Get statistics
 * - POST /stores/:storeId/abandoned-carts/process   - Trigger processing
 * - GET  /stores/:storeId/settings/abandoned-cart   - Get settings
 * - PATCH /stores/:storeId/settings/abandoned-cart  - Update settings
 *
 * Global:
 * - GET  /abandoned-carts/scheduler/status          - Get scheduler status
 * - POST /abandoned-carts/scheduler/trigger         - Trigger global processing
 */

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// =============================================================================
// STORE-SPECIFIC ROUTES
// =============================================================================

/**
 * GET /stores/:storeId/abandoned-carts
 *
 * List currently abandoned carts for manual review
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - minHours: number (default: 1) - minimum hours since last cart update
 */
router.get('/stores/:storeId/abandoned-carts', listAbandonedCarts);

/**
 * GET /stores/:storeId/abandoned-carts/stats
 *
 * Get abandoned cart statistics for a store
 *
 * Returns:
 * - Overview (total abandoned, by time period)
 * - Notification stats (sent, recovered, recovery rate)
 * - Total abandoned cart value
 */
router.get('/stores/:storeId/abandoned-carts/stats', getAbandonedCartStats);

/**
 * POST /stores/:storeId/abandoned-carts/process
 *
 * Manually trigger abandoned cart processing for a specific store
 *
 * Returns:
 * - Number of carts processed
 * - Number of notifications sent/failed/skipped
 * - Any errors encountered
 */
router.post('/stores/:storeId/abandoned-carts/process', triggerProcessing);

/**
 * GET /stores/:storeId/settings/abandoned-cart
 *
 * Get abandoned cart notification settings for a store
 *
 * Returns:
 * - enabled: boolean
 * - abandonmentThresholdMinutes: number
 * - quietHoursStart: number (0-23)
 * - quietHoursEnd: number (0-23)
 * - templateId: string (optional)
 * - maxNotificationsPerCart: number
 */
router.get('/stores/:storeId/settings/abandoned-cart', getSettings);

/**
 * PATCH /stores/:storeId/settings/abandoned-cart
 *
 * Update abandoned cart notification settings for a store
 *
 * Body (all optional):
 * - enabled: boolean
 * - abandonmentThresholdMinutes: number (15-1440)
 * - quietHoursStart: number (0-23)
 * - quietHoursEnd: number (0-23)
 * - templateId: string
 * - maxNotificationsPerCart: number (1-3)
 */
router.patch('/stores/:storeId/settings/abandoned-cart', updateSettings);

/**
 * POST /stores/:storeId/abandoned-carts/reset-notification-count
 *
 * Reset notification count for a customer's cart (for testing)
 *
 * Body:
 * - email: string (customer email) OR
 * - customerId: string (customer ID)
 */
router.post('/stores/:storeId/abandoned-carts/reset-notification-count', resetNotificationCount);

// =============================================================================
// GLOBAL ROUTES
// =============================================================================

/**
 * GET /abandoned-carts/scheduler/status
 *
 * Get abandoned cart scheduler status (global)
 *
 * Returns:
 * - isRunning: boolean
 * - lastRunAt: Date
 * - lastRunStats: array of per-store stats
 * - nextRunIn: milliseconds until next run
 */
router.get('/abandoned-carts/scheduler/status', getSchedulerStatus);

/**
 * POST /abandoned-carts/scheduler/trigger
 *
 * Manually trigger abandoned cart processing for all stores
 *
 * Returns:
 * - duration: processing time in ms
 * - storeCount: number of stores processed
 * - totalSent: total notifications sent
 * - totalFailed: total failed sends
 * - stores: array of per-store results
 */
router.post('/abandoned-carts/scheduler/trigger', triggerGlobalProcessing);

export default router;
