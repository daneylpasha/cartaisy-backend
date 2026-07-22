import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import * as shopifyOAuth from '../services/shopifyOAuthService';
import Store from '../models/Store';

/**
 * Shopify OAuth Controller
 * Handles Shopify OAuth flow and credential management
 */

/**
 * Initiates Shopify OAuth flow
 * GET /shopify/oauth/connect?shop=store-name.myshopify.com
 */
export const initiateOAuth = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    // Accept shop from query params (GET) or body (POST)
    const shop = (req.query as any)?.shop || (req.body as any)?.shop as string | undefined;

    if (!shop) {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required',
      });
    }

    // Generate state token for CSRF protection (include storeId)
    const state = shopifyOAuth.generateStateToken(shop, req.storeId.toString());

    // Get authorization URL
    const authorizationUrl = shopifyOAuth.getAuthorizationUrl(shop, state);

    res.status(200).json({
      success: true,
      data: {
        authorizationUrl: authorizationUrl,
        state: state,
      },
    });
  } catch (error: any) {
    console.error('Initiate OAuth error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to initiate OAuth',
    });
  }
};

/**
 * Handles Shopify OAuth callback
 * GET /shopify/oauth/callback?code=...&hmac=...&shop=...&state=...
 * Note: This route is public (no auth middleware) because Shopify redirects here directly.
 * The storeId is retrieved from the state token that was generated during initiateOAuth.
 */
export const handleCallback = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const code = (req.query as any)?.code as string | undefined;
    const state = (req.query as any)?.state as string | undefined;
    const shop = (req.query as any)?.shop as string | undefined;
    const hmac = (req.query as any)?.hmac as string | undefined;

    // Validate all required parameters
    if (!code || !state || !shop) {
      return res.status(400).json({
        success: false,
        error: 'Missing required OAuth parameters (code, state, shop)',
      });
    }

    // Verify state token to prevent CSRF attacks and retrieve storeId
    const validatedData = shopifyOAuth.validateStateToken(state);
    if (!validatedData || validatedData.shop !== shop) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired state token',
      });
    }

    // Get storeId from validated state token
    const storeId = validatedData.storeId;
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID not found in state token',
      });
    }

    // Exchange code for access token
    const tokenResponse = await shopifyOAuth.exchangeCodeForToken(shop, code);

    if (!tokenResponse.accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Failed to obtain access token from Shopify',
      });
    }

    // Get shop information from Shopify
    const shopInfo = await shopifyOAuth.getShopInfo(shop, tokenResponse.accessToken);

    // Save encrypted credentials to Store document
    await shopifyOAuth.saveCredentials(
      storeId,
      shop,
      tokenResponse.accessToken,
      tokenResponse.scope
    );

    // Sync currency and timezone from Shopify to Store.settings
    await Store.findByIdAndUpdate(storeId, {
      $set: {
        'settings.currency': shopInfo.currency || 'USD',
        'settings.timezone': shopInfo.timezone || 'UTC',
      },
    });

    // Best-effort: provision a per-store Storefront API access token so
    // store-scoped mobile product/cart/checkout paths work for this store.
    // A failure here must NOT fail the OAuth flow — the store stays
    // Admin-connected and an operator can retry via POST /shopify/storefront-token.
    try {
      await shopifyOAuth.createStorefrontAccessToken(storeId);
    } catch (storefrontError: any) {
      console.warn(
        `[Shopify OAuth] Storefront access token provisioning failed for store ${storeId}; ` +
          `store remains Admin-connected:`,
        storefrontError?.message || 'Unknown error'
      );
    }

    // Return success with shop info (but NOT the access token)
    res.status(200).json({
      success: true,
      data: {
        shop: shopInfo,
        message: 'Shopify store connected successfully',
      },
    });
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'OAuth callback failed',
    });
  }
};

/**
 * Gets Shopify connection status
 * GET /shopify/status
 */
export const getConnectionStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    const store = await Store.findById(req.storeId).select('shopify');

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found',
      });
    }

    const isConnected = shopifyOAuth.isConnected(req.storeId.toString());

    res.status(200).json({
      success: true,
      data: {
        isConnected: await isConnected,
        shop: store.shopify?.shop || null,
        scope: store.shopify?.scope || null,
        connectedAt: store.shopify?.connectedAt || null,
        lastSyncAt: store.shopify?.lastSyncAt || null,
      },
    });
  } catch (error: any) {
    console.error('Get connection status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get connection status',
    });
  }
};

/**
 * Disconnects Shopify store
 * POST /shopify/disconnect
 */
export const disconnectStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    await shopifyOAuth.disconnect(req.storeId.toString());

    res.status(200).json({
      success: true,
      data: {
        message: 'Shopify store disconnected successfully',
      },
    });
  } catch (error: any) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect Shopify store',
    });
  }
};

/**
 * Gets collections from connected Shopify store
 * GET /shopify/collections
 */
export const getCollections = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    const isConnectedFlag = await shopifyOAuth.isConnected(req.storeId.toString());
    if (!isConnectedFlag) {
      return res.status(400).json({
        success: false,
        error: 'Store is not connected to Shopify',
      });
    }

    const collections = await shopifyOAuth.getCollections(req.storeId.toString());

    res.status(200).json({
      success: true,
      data: {
        collections: collections,
        count: collections.length,
      },
    });
  } catch (error: any) {
    console.error('Get collections error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch collections',
    });
  }
};
