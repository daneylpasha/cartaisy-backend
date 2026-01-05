import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Store from '../../models/Store';
import * as shopifyOAuth from '../../services/shopifyOAuthService';

/**
 * Store Settings Admin Controller
 *
 * Provides admin endpoints for:
 * - Getting store settings (currency, timezone, language)
 * - Updating store settings
 */

// Valid currency codes (ISO 4217)
const VALID_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'BRL', 'MXN',
  'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'SGD', 'HKD', 'KRW', 'ZAR', 'AED',
  'SAR', 'PLN', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'TRY', 'RUB', 'PKR',
];

// Common timezones
const VALID_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Stockholm', 'Europe/Warsaw',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Bangkok', 'Asia/Jakarta',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos',
];

export interface StoreSettingsResponse {
  currency: string;
  timezone: string;
  language: string;
}

export interface UpdateStoreSettingsRequest {
  currency?: string;
  timezone?: string;
  language?: string;
}

// =============================================================================
// GET STORE SETTINGS
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/settings
 *
 * Get store settings (currency, timezone, language)
 */
export const getStoreSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const store = await Store.findById(storeId).select('settings name').lean();

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
        currency: store.settings?.currency || 'USD',
        timezone: store.settings?.timezone || 'UTC',
        language: store.settings?.language || 'en',
      },
    });
  } catch (error) {
    console.error('Error getting store settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store settings',
    });
  }
};

// =============================================================================
// UPDATE STORE SETTINGS
// =============================================================================

/**
 * PATCH /api/v1/admin/stores/:storeId/settings
 *
 * Update store settings (language only)
 * Note: Currency and timezone are synced from Shopify and cannot be changed manually.
 * Use POST /settings/sync-from-shopify to refresh currency/timezone from Shopify.
 */
export const updateStoreSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const updates: UpdateStoreSettingsRequest = req.body;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Currency and timezone are managed by Shopify sync - ignore if provided
    if (updates.currency !== undefined || updates.timezone !== undefined) {
      console.log('Ignoring currency/timezone update - these are synced from Shopify');
    }

    // Validate language
    if (updates.language !== undefined) {
      const language = updates.language.toLowerCase();
      if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language) && !/^[a-z]{2}$/.test(language)) {
        res.status(400).json({
          success: false,
          error: 'Invalid language code. Use ISO 639-1 format (e.g., "en", "es", "fr")',
        });
        return;
      }
      updates.language = language;
    }

    // Build update object - only language is allowed
    const updateFields: Record<string, any> = {};
    if (updates.language) updateFields['settings.language'] = updates.language;

    if (Object.keys(updateFields).length === 0) {
      // No language update, just return current settings
      const store = await Store.findById(storeId).select('settings name').lean();

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
          currency: store.settings?.currency || 'USD',
          timezone: store.settings?.timezone || 'UTC',
          language: store.settings?.language || 'en',
        },
        message: 'No changes made. Currency and timezone are synced from Shopify.',
      });
      return;
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      { $set: updateFields },
      { new: true }
    ).select('settings name');

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
        currency: store.settings?.currency || 'USD',
        timezone: store.settings?.timezone || 'UTC',
        language: store.settings?.language || 'en',
      },
      message: 'Store settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating store settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update store settings',
    });
  }
};

// =============================================================================
// GET AVAILABLE OPTIONS
// =============================================================================

/**
 * GET /api/v1/admin/stores/settings/options
 *
 * Get available currencies and timezones for dropdown selection
 */
export const getSettingsOptions = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({
      success: true,
      data: {
        currencies: VALID_CURRENCIES,
        timezones: VALID_TIMEZONES,
      },
    });
  } catch (error) {
    console.error('Error getting settings options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings options',
    });
  }
};

// =============================================================================
// SYNC FROM SHOPIFY
// =============================================================================

/**
 * POST /api/v1/admin/stores/:storeId/settings/sync-from-shopify
 *
 * Sync currency and timezone from connected Shopify store
 * This fetches fresh data from Shopify and updates Store.settings
 */
export const syncFromShopify = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Get store with Shopify connection info
    const store = await Store.findById(storeId).select('shopify settings name');

    if (!store) {
      res.status(404).json({
        success: false,
        error: 'Store not found',
      });
      return;
    }

    // Check if store is connected to Shopify
    if (!store.shopify?.isConnected || !store.shopify?.shop) {
      res.status(400).json({
        success: false,
        error: 'Store is not connected to Shopify. Please connect your Shopify store first.',
      });
      return;
    }

    // Get access token
    const accessToken = await shopifyOAuth.getAccessToken(storeId);

    if (!accessToken) {
      res.status(400).json({
        success: false,
        error: 'Unable to retrieve Shopify access token. Please reconnect your Shopify store.',
      });
      return;
    }

    // Fetch fresh shop info from Shopify
    const shopInfo = await shopifyOAuth.getShopInfo(store.shopify.shop, accessToken);

    // Update store settings with Shopify data
    const updatedStore = await Store.findByIdAndUpdate(
      storeId,
      {
        $set: {
          'settings.currency': shopInfo.currency || 'USD',
          'settings.timezone': shopInfo.timezone || 'UTC',
        },
      },
      { new: true }
    ).select('settings name');

    res.json({
      success: true,
      data: {
        currency: updatedStore?.settings?.currency || 'USD',
        timezone: updatedStore?.settings?.timezone || 'UTC',
        language: updatedStore?.settings?.language || 'en',
      },
      message: 'Settings synced from Shopify successfully',
    });
  } catch (error) {
    console.error('Error syncing settings from Shopify:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync settings from Shopify',
    });
  }
};
