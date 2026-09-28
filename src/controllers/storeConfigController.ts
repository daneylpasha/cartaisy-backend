import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Store from '../models/Store';

/**
 * Store Config Controller
 *
 * Public endpoints for mobile app to get store configuration
 * No authentication required - these are read-only store settings
 */

export interface StoreConfigResponse {
  currency: string;
  timezone: string;
  name: string;
  language: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  /** App icon. `appIconUrl` is the same value when present. */
  iconUrl?: string;
  appIconUrl?: string;
  /** Splash image. `splashImageUrl` is the same value when present. */
  splashUrl?: string;
  splashImageUrl?: string;
}

// =============================================================================
// BRANDING VALIDATION HELPERS
// =============================================================================

/**
 * Mirrors the hex validation StoreBrandingSchema already applies on write.
 * Re-applied on read so legacy or directly-edited documents that bypassed
 * schema validation can never emit a malformed color to the mobile app.
 */
const HEX_COLOR_PATTERN = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

const sanitizeHexColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : undefined;
};

/**
 * Brand image URLs have no format validation at the schema level, so the
 * response is the only place a malformed value can be filtered out. Only
 * well-formed absolute http(s) URLs are exposed. Token-shaped values are
 * omitted so a Shopify secret stored in a branding URL cannot leave this
 * public route. Same markers as the admin branding read.
 */
const TOKEN_SHAPED_URL = /shpat_|shpss_|shpca_|shpct_|shpua_|access_token|bearer\s/i;

const sanitizeBrandImageUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || TOKEN_SHAPED_URL.test(trimmed)) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
};

// =============================================================================
// GET STORE CONFIG (PUBLIC)
// =============================================================================

/**
 * GET /api/v1/store/config
 *
 * Get store configuration for mobile app
 * Uses X-Store-ID header to identify store
 */
export const getStoreConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = req.headers['x-store-id'] as string;

    if (!storeId) {
      res.status(400).json({
        success: false,
        error: 'X-Store-ID header is required',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const store = await Store.findById(storeId)
      .select('settings name isActive branding')
      .lean();

    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    if (!store.isActive) {
      res.status(403).json({
        success: false,
        error: 'Store is not active',
      });
      return;
    }

    const data: StoreConfigResponse = {
      currency: store.settings?.currency || 'USD',
      timezone: store.settings?.timezone || 'UTC',
      language: store.settings?.language || 'en',
      name: store.name || '',
    };

    // Branding fields are omitted (never null) when unset or invalid so the
    // mobile app falls back to its bundled defaults. Bad branding data must
    // never break the rest of the config response.
    const primaryColor = sanitizeHexColor(store.branding?.primaryColor);
    if (primaryColor) {
      data.primaryColor = primaryColor;
    }

    const secondaryColor = sanitizeHexColor(store.branding?.secondaryColor);
    if (secondaryColor) {
      data.secondaryColor = secondaryColor;
    }

    const logoUrl = sanitizeBrandImageUrl(store.branding?.logoUrl);
    if (logoUrl) {
      data.logoUrl = logoUrl;
    }

    const iconUrl = sanitizeBrandImageUrl(store.branding?.iconUrl);
    if (iconUrl) {
      data.iconUrl = iconUrl;
      data.appIconUrl = iconUrl;
    }

    const splashUrl = sanitizeBrandImageUrl(store.branding?.splashUrl);
    if (splashUrl) {
      data.splashUrl = splashUrl;
      data.splashImageUrl = splashUrl;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error getting store config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store configuration',
    });
  }
};
