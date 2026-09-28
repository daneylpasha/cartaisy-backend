import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
import {
  getStoreBranding,
  updateStoreBranding,
  uploadStoreLogo,
  uploadStoreIcon,
  uploadStoreSplash,
  deleteStoreLogo,
} from '../controllers/admin/storeBrandingController';

const router = express.Router();

/**
 * Store Branding Routes
 *
 * Admin endpoints for managing store branding (logo, icon, splash, colors)
 * Mounted at /api/v1/admin
 */

// Configure multer for brand image uploads (memory storage, max 2MB)
const brandImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WebP are allowed.'));
    }
  },
});

// =============================================================================
// BRANDING ROUTES (require admin authentication)
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/branding
 * Get store branding (logo, icon, splash, colors)
 */
router.get(
  '/stores/:storeId/branding',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  getStoreBranding
);

/**
 * PATCH /api/v1/admin/stores/:storeId/branding
 * Update store branding (colors only)
 */
router.patch(
  '/stores/:storeId/branding',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  updateStoreBranding
);

/**
 * POST /api/v1/admin/stores/:storeId/branding/logo
 * Upload store logo
 * Accepts: multipart/form-data with 'logo' field
 * Max size: 2MB
 * Allowed types: JPG, PNG, WebP
 */
router.post(
  '/stores/:storeId/branding/logo',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  brandImageUpload.single('logo'),
  uploadStoreLogo
);

/**
 * POST /api/v1/admin/stores/:storeId/branding/icon
 * Upload the app icon
 * Accepts: multipart/form-data with 'image' field
 * Max size: 2MB
 * Allowed types: JPG, PNG, WebP
 */
router.post(
  '/stores/:storeId/branding/icon',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  brandImageUpload.single('image'),
  uploadStoreIcon
);

/**
 * POST /api/v1/admin/stores/:storeId/branding/splash
 * Upload the splash image
 * Accepts: multipart/form-data with 'image' field
 * Max size: 2MB
 * Allowed types: JPG, PNG, WebP
 */
router.post(
  '/stores/:storeId/branding/splash',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  brandImageUpload.single('image'),
  uploadStoreSplash
);

/**
 * DELETE /api/v1/admin/stores/:storeId/branding/logo
 * Delete store logo
 */
router.delete(
  '/stores/:storeId/branding/logo',
  authenticate,
  authorize('admin', 'super_admin'),
  requireOwnedStoreParam(),
  deleteStoreLogo
);

export default router;
