import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Store from '../../models/Store';
import { cloudinaryService } from '../../services/cloudinaryService';

/**
 * Store Branding Controller
 *
 * Provides admin endpoints for:
 * - Uploading store logo
 * - Updating store branding (colors)
 * - Getting store branding
 * - Deleting store logo
 */

// =============================================================================
// GET STORE BRANDING
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/branding
 *
 * Get store branding settings (logo, colors)
 */
export const getStoreBranding = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const store = await Store.findById(storeId).select('branding name').lean();

    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        logoUrl: store.branding?.logoUrl || null,
        primaryColor: store.branding?.primaryColor || '#FF6B6B',
        secondaryColor: store.branding?.secondaryColor || null,
      },
    });
  } catch (error) {
    console.error('Error getting store branding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store branding',
    });
  }
};

// =============================================================================
// UPDATE STORE BRANDING
// =============================================================================

/**
 * PATCH /api/v1/admin/stores/:storeId/branding
 *
 * Update store branding settings (colors)
 * Note: Use POST /branding/logo for logo upload
 *
 * Contract for `primaryColor`/`secondaryColor` in the request body, each
 * evaluated independently (see cartaisy-dashboard PR #13's
 * docs/ARCHITECTURE.md known-gap entry this closes):
 *   - Key absent from the body entirely  -> field is left untouched (today's
 *     existing "not provided" behavior, unchanged).
 *   - Key present, a valid hex string    -> field is set to that value
 *     (today's existing behavior, unchanged).
 *   - Key present, JSON `null`           -> field is explicitly cleared via
 *     `$unset` (new — this is what this ticket adds).
 *   - Key present, any other falsy value ("", 0, false) -> 400, same as the
 *     existing hex-validation-failure path for a malformed string. Empty
 *     string is deliberately NOT treated as "clear" — only an explicit
 *     `null` means that, so there's no ambiguity between "the caller
 *     cleared the input" and "the caller sent nothing."
 */
export const updateStoreBranding = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

    const setFields: Record<string, string> = {};
    const unsetFields: Record<string, 1> = {};

    if ('primaryColor' in req.body) {
      const { primaryColor } = req.body;
      if (primaryColor === null) {
        unsetFields['branding.primaryColor'] = 1;
      } else if (colorRegex.test(primaryColor)) {
        setFields['branding.primaryColor'] = primaryColor;
      } else {
        res.status(400).json({
          success: false,
          error: 'Primary color must be a valid hex color (e.g., #FF6B6B)',
        });
        return;
      }
    }

    if ('secondaryColor' in req.body) {
      const { secondaryColor } = req.body;
      if (secondaryColor === null) {
        unsetFields['branding.secondaryColor'] = 1;
      } else if (colorRegex.test(secondaryColor)) {
        setFields['branding.secondaryColor'] = secondaryColor;
      } else {
        res.status(400).json({
          success: false,
          error: 'Secondary color must be a valid hex color (e.g., #4ECDC4)',
        });
        return;
      }
    }

    if (Object.keys(setFields).length === 0 && Object.keys(unsetFields).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid fields provided for update',
      });
      return;
    }

    // Only include $set/$unset when non-empty — a request can be a pure
    // clear (only $unset), a pure set (only $set), or a mix of both across
    // the two fields, as long as no single field appears in both.
    const update: Record<string, Record<string, unknown>> = {};
    if (Object.keys(setFields).length > 0) {
      update.$set = setFields;
    }
    if (Object.keys(unsetFields).length > 0) {
      update.$unset = unsetFields;
    }

    const store = await Store.findByIdAndUpdate(storeId, update, { new: true }).select(
      'branding name'
    );

    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        logoUrl: store.branding?.logoUrl || null,
        primaryColor: store.branding?.primaryColor || '#FF6B6B',
        secondaryColor: store.branding?.secondaryColor || null,
      },
      message: 'Store branding updated successfully',
    });
  } catch (error) {
    console.error('Error updating store branding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update store branding',
    });
  }
};

// =============================================================================
// UPLOAD STORE LOGO
// =============================================================================

/**
 * POST /api/v1/admin/stores/:storeId/branding/logo
 *
 * Upload store logo image
 * Accepts: JPG, PNG, WebP (max 2MB)
 */
export const uploadStoreLogo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded. Please provide an image file.',
      });
      return;
    }

    // Check if Cloudinary is configured
    if (!cloudinaryService.isConfigured()) {
      res.status(500).json({
        success: false,
        error: 'Image upload service is not configured',
      });
      return;
    }

    // Find the store
    const store = await Store.findById(storeId);
    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    // Upload to Cloudinary with logo-specific folder
    const uploadResult = await cloudinaryService.uploadImage(
      req.file.buffer,
      storeId,
      `logo_${req.file.originalname}`
    );

    // Update store branding with new logo URL
    store.branding = {
      ...store.branding,
      logoUrl: uploadResult.secureUrl,
    };
    await store.save();

    res.json({
      success: true,
      data: {
        logoUrl: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        size: uploadResult.size,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
      },
      message: 'Store logo uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading store logo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload store logo',
    });
  }
};

// =============================================================================
// DELETE STORE LOGO
// =============================================================================

/**
 * DELETE /api/v1/admin/stores/:storeId/branding/logo
 *
 * Delete store logo
 */
export const deleteStoreLogo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Find the store
    const store = await Store.findById(storeId);
    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    // Check if logo exists
    if (!store.branding?.logoUrl) {
      res.status(400).json({
        success: false,
        error: 'No logo to delete',
      });
      return;
    }

    // Extract public ID from URL and delete from Cloudinary
    const logoUrl = store.branding.logoUrl;
    const publicIdMatch = logoUrl.match(/\/stores\/[^/]+\/[^/]+\/([^.]+)/);

    if (publicIdMatch && cloudinaryService.isConfigured()) {
      // Try to delete from Cloudinary (don't fail if deletion fails)
      const fullPublicId = logoUrl
        .split('/upload/')[1]
        ?.split('.')[0]
        ?.replace(/^v\d+\//, '');

      if (fullPublicId) {
        await cloudinaryService.deleteImage(fullPublicId);
      }
    }

    // Remove logo URL from store
    store.branding.logoUrl = undefined;
    await store.save();

    res.json({
      success: true,
      data: {
        logoUrl: null,
        primaryColor: store.branding?.primaryColor || '#FF6B6B',
        secondaryColor: store.branding?.secondaryColor || null,
      },
      message: 'Store logo deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting store logo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete store logo',
    });
  }
};
