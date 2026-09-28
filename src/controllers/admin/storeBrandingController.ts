import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Store, { IStoreBranding } from '../../models/Store';
import { cloudinaryService } from '../../services/cloudinaryService';

/**
 * Store Branding Controller
 *
 * Provides admin endpoints for:
 * - Uploading store logo, app icon, and splash
 * - Updating store branding (colors)
 * - Getting store branding
 * - Deleting store logo
 */

/**
 * Same rejection the dashboard uses before it will draw or store a brand
 * image. A URL that merely contains a Shopify token must never be persisted
 * or returned.
 */
const TOKEN_SHAPED_URL = /shpat_|shpss_|shpca_|shpct_|shpua_|access_token|bearer\s/i;

const redactSecrets = (value: unknown): string => {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? '');
  return text
    .replace(/shpat_[^\s"'&]+/gi, '[redacted]')
    .replace(/shpss_[^\s"'&]+/gi, '[redacted]')
    .replace(/shpca_[^\s"'&]+/gi, '[redacted]')
    .replace(/shpct_[^\s"'&]+/gi, '[redacted]')
    .replace(/shpua_[^\s"'&]+/gi, '[redacted]')
    .replace(/access_token(?:=|%3d)[^\s"'&]+/gi, 'access_token=[redacted]')
    .replace(/bearer\s+\S+/gi, 'bearer [redacted]');
};

/** Absolute http(s) URL safe to return. Token-shaped values become null. */
const readBrandImageUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || TOKEN_SHAPED_URL.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
};

/** Https URL safe to persist. Http, blob, and token-shaped values are rejected. */
const persistedBrandImageUrl = (value: unknown): string | null => {
  const url = readBrandImageUrl(value);
  if (!url || !url.startsWith('https:')) {
    return null;
  }
  return url;
};

const safePublicId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || TOKEN_SHAPED_URL.test(trimmed)) {
    return undefined;
  }

  return trimmed;
};

const uploadFilename = (kind: 'logo' | 'icon' | 'splash', originalName: string): string => {
  // A fresh regex so the shared TOKEN_SHAPED_URL detector keeps lastIndex at 0.
  const stripped = originalName.replace(new RegExp(TOKEN_SHAPED_URL.source, 'gi'), '');
  const base = stripped.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `${kind}_${base || 'image'}`;
};

interface BrandingResponseData {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  iconUrl: string | null;
  appIconUrl: string | null;
  splashUrl: string | null;
  splashImageUrl: string | null;
}

const brandingResponse = (branding?: IStoreBranding | null): BrandingResponseData => {
  const iconUrl = readBrandImageUrl(branding?.iconUrl);
  const splashUrl = readBrandImageUrl(branding?.splashUrl);

  return {
    logoUrl: readBrandImageUrl(branding?.logoUrl),
    primaryColor: branding?.primaryColor || '#FF6B6B',
    secondaryColor: branding?.secondaryColor || null,
    iconUrl,
    appIconUrl: iconUrl,
    splashUrl,
    splashImageUrl: splashUrl,
  };
};

// =============================================================================
// GET STORE BRANDING
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/branding
 *
 * Get store branding settings (logo, icon, splash, colors)
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
      data: brandingResponse(store.branding),
    });
  } catch (error) {
    console.error('Error getting store branding:', redactSecrets(error));
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
 * Note: Use POST /branding/logo, /branding/icon, and /branding/splash for images.
 * Image URLs in this body are ignored.
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

    // Guard before the `in` checks below: `in` throws a TypeError on a
    // non-object right-hand side (a primitive JSON body like `42`, `false`,
    // `"hello"`, or a bare `null` all reach here as-is, not coerced to
    // `{}`). Without this, any of those bodies would throw, land in this
    // function's catch block, and 500 instead of the same 400 a body with
    // no valid fields already gets below — caught in review (Greptile) on
    // PR #148, confirmed via a probe test before this fix.
    if (typeof req.body !== 'object' || req.body === null) {
      res.status(400).json({
        success: false,
        error: 'No valid fields provided for update',
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
      data: brandingResponse(store.branding),
      message: 'Store branding updated successfully',
    });
  } catch (error) {
    console.error('Error updating store branding:', redactSecrets(error));
    res.status(500).json({
      success: false,
      error: 'Failed to update store branding',
    });
  }
};

// =============================================================================
// UPLOAD BRAND IMAGES (logo, icon, splash)
// =============================================================================

type BrandImageField = 'logoUrl' | 'iconUrl' | 'splashUrl';

interface BrandImageUploadSpec {
  field: BrandImageField;
  kind: 'logo' | 'icon' | 'splash';
  successMessage: string;
  failureMessage: string;
}

/**
 * Shared upload used by logo, icon, and splash. The multipart field name is
 * chosen by the route (`logo` for the logo, `image` for icon and splash).
 * Only an https URL that is not token-shaped is stored. The Shopify admin
 * token is never selected and never copied into the response.
 */
const uploadBrandImage = async (
  req: Request,
  res: Response,
  spec: BrandImageUploadSpec
): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded. Please provide an image file.',
      });
      return;
    }

    if (!cloudinaryService.isConfigured()) {
      res.status(500).json({
        success: false,
        error: 'Image upload service is not configured',
      });
      return;
    }

    const store = await Store.findById(storeId);
    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    const uploadResult = await cloudinaryService.uploadImage(
      req.file.buffer,
      storeId,
      uploadFilename(spec.kind, req.file.originalname || 'image')
    );

    const imageUrl = persistedBrandImageUrl(uploadResult.secureUrl);
    if (!imageUrl) {
      const publicId = safePublicId(uploadResult.publicId);
      if (publicId) {
        await cloudinaryService.deleteImage(publicId);
      }
      res.status(502).json({
        success: false,
        error: spec.failureMessage,
      });
      return;
    }

    // Set only this path so sibling branding fields and the unselected
    // Shopify access token stay untouched.
    store.set(`branding.${spec.field}`, imageUrl);
    await store.save();

    const data: Record<string, unknown> = {
      size: uploadResult.size,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
    };

    if (spec.field === 'logoUrl') {
      data.logoUrl = imageUrl;
    } else if (spec.field === 'iconUrl') {
      data.url = imageUrl;
      data.iconUrl = imageUrl;
      data.appIconUrl = imageUrl;
    } else {
      data.url = imageUrl;
      data.splashUrl = imageUrl;
      data.splashImageUrl = imageUrl;
    }

    const publicId = safePublicId(uploadResult.publicId);
    if (publicId) {
      data.publicId = publicId;
    }

    res.json({
      success: true,
      data,
      message: spec.successMessage,
    });
  } catch (error) {
    console.error(`Error uploading store ${spec.kind}:`, redactSecrets(error));
    res.status(500).json({
      success: false,
      error: spec.failureMessage,
    });
  }
};

/**
 * POST /api/v1/admin/stores/:storeId/branding/logo
 *
 * Upload store logo image
 * Accepts: JPG, PNG, WebP (max 2MB), multipart field `logo`
 */
export const uploadStoreLogo = async (req: Request, res: Response): Promise<void> => {
  await uploadBrandImage(req, res, {
    field: 'logoUrl',
    kind: 'logo',
    successMessage: 'Store logo uploaded successfully',
    failureMessage: 'Failed to upload store logo',
  });
};

/**
 * POST /api/v1/admin/stores/:storeId/branding/icon
 *
 * Upload the app icon
 * Accepts: JPG, PNG, WebP (max 2MB), multipart field `image`
 */
export const uploadStoreIcon = async (req: Request, res: Response): Promise<void> => {
  await uploadBrandImage(req, res, {
    field: 'iconUrl',
    kind: 'icon',
    successMessage: 'Store icon uploaded successfully',
    failureMessage: 'Failed to upload store icon',
  });
};

/**
 * POST /api/v1/admin/stores/:storeId/branding/splash
 *
 * Upload the splash image
 * Accepts: JPG, PNG, WebP (max 2MB), multipart field `image`
 */
export const uploadStoreSplash = async (req: Request, res: Response): Promise<void> => {
  await uploadBrandImage(req, res, {
    field: 'splashUrl',
    kind: 'splash',
    successMessage: 'Store splash uploaded successfully',
    failureMessage: 'Failed to upload store splash',
  });
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

    // Extract public ID from URL and delete from Cloudinary.
    // Skip the remote delete when the stored URL is token-shaped so the
    // token is not sent to Cloudinary or written to its error log.
    const logoUrl = store.branding.logoUrl;
    const publicIdMatch = !TOKEN_SHAPED_URL.test(logoUrl)
      && /\/stores\/[^/]+\/[^/]+\/([^.]+)/.test(logoUrl);

    if (publicIdMatch && cloudinaryService.isConfigured()) {
      const fullPublicId = safePublicId(
        logoUrl.split('/upload/')[1]?.split('.')[0]?.replace(/^v\d+\//, '')
      );

      if (fullPublicId) {
        await cloudinaryService.deleteImage(fullPublicId);
      }
    }

    // Remove logo URL from store
    store.branding.logoUrl = undefined;
    await store.save();

    res.json({
      success: true,
      data: brandingResponse(store.branding),
      message: 'Store logo deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting store logo:', redactSecrets(error));
    res.status(500).json({
      success: false,
      error: 'Failed to delete store logo',
    });
  }
};
