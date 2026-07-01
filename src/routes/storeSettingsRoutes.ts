import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
import {
  getStoreSettings,
  updateStoreSettings,
  getSettingsOptions,
  syncFromShopify,
} from '../controllers/admin/storeSettingsController';

const router = express.Router();

/**
 * Store Settings Routes
 *
 * Admin endpoints for managing store settings (currency, timezone, language)
 * Mounted at /api/v1/admin
 */

// =============================================================================
// ADMIN ROUTES (require authentication)
// =============================================================================

/**
 * GET /api/v1/admin/stores/settings/options
 * Get available currencies and timezones for dropdown selection
 * Note: This must come BEFORE /:storeId routes to avoid conflict
 */
router.get(
  '/stores/settings/options',
  authenticate,
  authorize('admin', 'super_admin'),
  getSettingsOptions
);

/**
 * GET /api/v1/admin/stores/:storeId/settings
 * Get store settings (currency, timezone, language)
 */
router.get(
  '/stores/:storeId/settings',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  getStoreSettings
);

/**
 * PATCH /api/v1/admin/stores/:storeId/settings
 * Update store settings (language only - currency/timezone synced from Shopify)
 */
router.patch(
  '/stores/:storeId/settings',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  updateStoreSettings
);

/**
 * POST /api/v1/admin/stores/:storeId/settings/sync-from-shopify
 * Sync currency and timezone from connected Shopify store
 */
router.post(
  '/stores/:storeId/settings/sync-from-shopify',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  syncFromShopify
);

export default router;
