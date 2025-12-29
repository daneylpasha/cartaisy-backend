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
}

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
      .select('settings name isActive')
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

    res.json({
      success: true,
      data: {
        currency: store.settings?.currency || 'USD',
        timezone: store.settings?.timezone || 'UTC',
        language: store.settings?.language || 'en',
        name: store.name || '',
      },
    });
  } catch (error) {
    console.error('Error getting store config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store configuration',
    });
  }
};
