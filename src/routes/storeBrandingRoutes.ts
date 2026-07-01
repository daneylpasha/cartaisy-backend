import express from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
import {
  getStoreBranding,
  updateStoreBranding,
  uploadStoreLogo,
  deleteStoreLogo,
} from '../controllers/admin/storeBrandingController';

const router = express.Router();

/**
 * Store Branding Routes
 *
 * Admin endpoints for managing store branding (logo, colors)
 * Mounted at /api/v1/admin
 */

// Configure multer for logo uploads (memory storage, max 2MB)
const logoUpload = multer({
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
 * Get store branding (logo, colors)
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
  logoUpload.single('logo'),
  uploadStoreLogo
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
