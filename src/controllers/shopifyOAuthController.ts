import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import * as shopifyOAuth from '../services/shopifyOAuthService';
import {
  CatalogSyncInProgressError,
  CatalogSyncNotConnectedError,
  CatalogSyncStoreNotFoundError,
  getCatalogSyncStatus,
  startCatalogSyncForStore,
  syncCatalogForStore,
  toSafeSyncErrorSummary,
} from '../services/catalogSyncService';
import Store from '../models/Store';

/**
 * Shopify OAuth Controller
 *
 * Dashboard contract (backend is the only token owner):
 * - POST /shopify/oauth/connect returns an authorize URL. No access token.
 * - GET  /shopify/oauth/callback completes OAuth, stores the token, and starts
 *   the first catalog sync. The sync does not block the redirect.
 * - GET  /shopify/status reports connected or disconnected.
 * - POST /shopify/disconnect revokes and clears the backend token.
 * - GET  /shopify/sync reads durable catalog sync status for this store only.
 * - POST /shopify/sync is Sync again: the same in-request sync, with durable status.
 *
 * Client-supplied storeId values are ignored. The store comes from the
 * authenticated user, except the public callback, which trusts the signed
 * OAuth state.
 */

type OAuthQuery = {
  shop?: unknown;
  code?: unknown;
  state?: unknown;
};

const queryOf = (req: AuthenticatedRequest): OAuthQuery =>
  (req.query || {}) as OAuthQuery;

const bodyShopOf = (req: AuthenticatedRequest): unknown =>
  (req.body as { shop?: unknown } | undefined)?.shop;

const oauthStatusCode = (error: unknown, fallback: number): number => {
  if (error instanceof shopifyOAuth.ShopifyOAuthError) {
    return error.statusCode;
  }
  return fallback;
};

const oauthReasonCode = (error: unknown, fallback: string): string => {
  if (error instanceof shopifyOAuth.ShopifyOAuthError) {
    return error.reasonCode;
  }
  return fallback;
};

const safeErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  if (/shpat_|shpss_|access_token|client_secret/i.test(error.message)) {
    return fallback;
  }
  return error.message;
};

const sendCallbackResult = (
  res: Response,
  status: number,
  body: Record<string, unknown>,
  redirect: { outcome: 'connected' | 'error'; shop?: string; reason?: string }
): void => {
  const returnUrl = shopifyOAuth.buildOAuthReturnUrl(redirect.outcome, {
    shop: redirect.shop,
    reason: redirect.reason,
  });

  if (returnUrl) {
    res.redirect(302, returnUrl);
    return;
  }

  res.status(status).json(body);
};

/**
 * Initiates Shopify OAuth flow
 * GET /shopify/oauth/connect?shop=store-name.myshopify.com
 * POST /shopify/oauth/connect { shop }
 */
export const initiateOAuth = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    const query = queryOf(req);
    const rawShop = req.method === 'GET' ? query.shop : (bodyShopOf(req) ?? query.shop);
    if (typeof rawShop !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required',
      });
    }

    const shop = shopifyOAuth.normalizeShopDomain(rawShop);
    const storeId = req.storeId.toString();
    const state = await shopifyOAuth.generateStateToken(shop, storeId);
    const authorizationUrl = shopifyOAuth.getAuthorizationUrl(shop, state);

    return res.status(200).json({
      success: true,
      data: {
        authorizationUrl,
        state,
        tokenOwner: 'backend',
      },
    });
  } catch (error) {
    const message = error instanceof shopifyOAuth.ShopifyOAuthError
      ? error.message
      : 'Failed to initiate OAuth';
    console.error('Initiate OAuth error:', message);
    return res.status(oauthStatusCode(error, 400)).json({
      success: false,
      error: message,
    });
  }
};

/**
 * Handles Shopify OAuth callback
 * GET /shopify/oauth/callback?code=...&hmac=...&shop=...&state=...
 * Public: Shopify redirects the merchant's browser here. storeId comes from
 * the single-use state record. When SHOPIFY_OAUTH_RETURN_URL is set, the
 * browser is sent back to the dashboard without the access token.
 */
export const handleCallback = async (req: AuthenticatedRequest, res: Response) => {
  const fail = (
    status: number,
    error: string,
    reason: string,
    shopDomain?: string
  ): void => {
    sendCallbackResult(
      res,
      status,
      { success: false, error },
      { outcome: 'error', reason, shop: shopDomain }
    );
  };

  try {
    const query = queryOf(req);
    const code = typeof query.code === 'string' ? query.code : undefined;
    const state = typeof query.state === 'string' ? query.state : undefined;
    const shop = typeof query.shop === 'string' ? query.shop : undefined;

    if (!code || !state || !shop) {
      return fail(
        400,
        'Missing required OAuth parameters (code, state, shop)',
        'missing_parameters'
      );
    }

    let hmacValid = false;
    try {
      hmacValid = shopifyOAuth.verifyOAuthCallbackHmac(query as Record<string, unknown>);
    } catch (error) {
      return fail(
        oauthStatusCode(error, 500),
        safeErrorMessage(error, 'OAuth callback failed'),
        oauthReasonCode(error, 'oauth_not_configured')
      );
    }

    if (!hmacValid) {
      return fail(401, 'Invalid OAuth callback signature', 'invalid_hmac');
    }

    const normalizedShop = shopifyOAuth.normalizeShopDomain(shop);
    const validatedData = await shopifyOAuth.validateStateToken(state);
    if (!validatedData || validatedData.shop !== normalizedShop) {
      return fail(401, 'Invalid or expired state token', 'invalid_state', normalizedShop);
    }

    const storeId = validatedData.storeId;
    const tokenResponse = await shopifyOAuth.exchangeCodeForToken(normalizedShop, code);

    if (!tokenResponse.accessToken) {
      return fail(
        400,
        'Failed to obtain access token from Shopify',
        'token_exchange_failed',
        normalizedShop
      );
    }

    const shopInfo = await shopifyOAuth.getShopInfo(normalizedShop, tokenResponse.accessToken);

    await shopifyOAuth.saveCredentials(
      storeId,
      normalizedShop,
      tokenResponse.accessToken,
      tokenResponse.scope
    );

    await Store.findByIdAndUpdate(storeId, {
      $set: {
        'settings.currency': shopInfo.currency || 'USD',
        'settings.timezone': shopInfo.timezone || 'UTC',
      },
    });

    // First catalog sync (issue #166). Claim `syncing` before the redirect so
    // GET /shopify/sync shows progress, then let the import finish in the
    // background. A sync error must not roll back a successful connect.
    try {
      await startCatalogSyncForStore(storeId);
    } catch (syncStartError: unknown) {
      console.error(
        `[Shopify OAuth] Catalog sync failed to start for store ${storeId} shop ${normalizedShop}: ${toSafeSyncErrorSummary(syncStartError)}`
      );
    }

    // Best-effort: provision a per-store Storefront API access token so
    // store-scoped mobile product/cart/checkout paths work for this store.
    // A failure here must NOT fail the OAuth flow — the store stays
    // Admin-connected and an operator can retry via POST /shopify/storefront-token.
    try {
      await shopifyOAuth.createStorefrontAccessToken(storeId);
    } catch (storefrontError: any) {
      console.warn(
        `[Shopify OAuth] Storefront access token provisioning failed for store ${storeId}; store remains Admin-connected:`,
        storefrontError?.message || 'Unknown error'
      );
    }

    return sendCallbackResult(
      res,
      200,
      {
        success: true,
        data: {
          status: 'connected',
          tokenOwner: 'backend',
          shop: {
            shop: shopInfo.shop,
            name: shopInfo.name,
            email: shopInfo.email,
            domain: shopInfo.domain,
            currency: shopInfo.currency,
            timezone: shopInfo.timezone,
            country: shopInfo.country,
          },
          message: 'Shopify store connected successfully',
        },
      },
      { outcome: 'connected', shop: normalizedShop }
    );
  } catch (error) {
    console.error('OAuth callback error:', safeErrorMessage(error, 'OAuth callback failed'));
    return fail(
      oauthStatusCode(error, 400),
      safeErrorMessage(error, 'OAuth callback failed'),
      oauthReasonCode(error, 'oauth_failed')
    );
  }
};

/**
 * Gets Shopify connection status for the authenticated store only.
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

    const store = await Store.findById(req.storeId).select(
      'shopify.shop shopify.scope shopify.isConnected shopify.connectedAt shopify.lastSyncAt'
    );

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found',
      });
    }

    const isConnected = store.shopify?.isConnected === true;

    return res.status(200).json({
      success: true,
      data: {
        status: isConnected ? 'connected' : 'disconnected',
        isConnected,
        shop: isConnected ? store.shopify?.shop || null : null,
        scope: isConnected ? store.shopify?.scope || null : null,
        connectedAt: isConnected ? store.shopify?.connectedAt || null : null,
        lastSyncAt: isConnected ? store.shopify?.lastSyncAt || null : null,
        tokenOwner: 'backend',
      },
    });
  } catch (error) {
    console.error(
      'Get connection status error:',
      safeErrorMessage(error, 'Failed to get connection status')
    );
    return res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
    });
  }
};

/**
 * Disconnects Shopify store: revoke the token at Shopify, then clear it.
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

    const result = await shopifyOAuth.disconnect(req.storeId.toString());

    return res.status(200).json({
      success: true,
      data: {
        status: 'disconnected',
        isConnected: false,
        shopifyRevoked: result.shopifyRevoked,
        tokenOwner: 'backend',
        message: 'Shopify store disconnected successfully',
      },
    });
  } catch (error) {
    console.error('Disconnect error:', safeErrorMessage(error, 'Failed to disconnect Shopify store'));
    return res.status(oauthStatusCode(error, 500)).json({
      success: false,
      error: safeErrorMessage(error, 'Failed to disconnect Shopify store'),
    });
  }
};

const catalogSyncStoreId = (req: AuthenticatedRequest, res: Response): string | null => {
  if (!req.storeId) {
    res.status(401).json({
      success: false,
      error: 'Store authentication required',
    });
    return null;
  }
  return req.storeId.toString();
};

/**
 * Reads durable catalog sync status for the authenticated store only.
 * GET /shopify/sync
 *
 * A client storeId is ignored. The status describes this store's catalog sync
 * and whether that store may request a build.
 */
export const getCatalogSync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const storeId = catalogSyncStoreId(req, res);
    if (!storeId) {
      return;
    }

    const status = await getCatalogSyncStatus(storeId);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Store not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...status,
        storeId,
        tokenOwner: 'backend',
      },
    });
  } catch {
    console.error('Get catalog sync status error: Failed to get catalog sync status');
    return res.status(500).json({
      success: false,
      error: 'Failed to get catalog sync status',
    });
  }
};

/**
 * Sync again for the authenticated store only.
 * POST /shopify/sync
 *
 * Runs the existing in-request full sync and persists `idle|syncing|succeeded|failed`
 * on this store. A fresh in-progress sync returns 409 without starting another run.
 * A `syncing` record older than 15 minutes can be claimed again. The OAuth
 * callback uses the same guard. Quiet automatic retries stay inside this
 * request. Uses the backend token.
 */
export const triggerSync = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const storeId = catalogSyncStoreId(req, res);
    if (!storeId) {
      return;
    }

    const connected = await shopifyOAuth.isConnected(storeId);
    if (!connected) {
      return res.status(409).json({
        success: false,
        error: 'Store is not connected to Shopify',
        code: 'SHOPIFY_NOT_CONNECTED',
      });
    }

    const result = await syncCatalogForStore(storeId);
    if (result.outcome === 'failed') {
      return res.status(502).json({
        success: false,
        error: result.errorSummary || 'Catalog sync failed. Use Sync again.',
        code: 'CATALOG_SYNC_FAILED',
        data: {
          ...result.data,
          storeId,
          tokenOwner: 'backend',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...result.data,
        storeId,
        stats: result.stats,
        tokenOwner: 'backend',
      },
    });
  } catch (error: unknown) {
    if (error instanceof CatalogSyncInProgressError) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        code: error.code,
        data: {
          ...error.catalogSync,
          storeId: req.storeId?.toString(),
          tokenOwner: 'backend',
        },
      });
    }

    if (error instanceof CatalogSyncNotConnectedError) {
      return res.status(409).json({
        success: false,
        error: 'Store is not connected to Shopify',
        code: error.code,
      });
    }

    if (error instanceof CatalogSyncStoreNotFoundError) {
      return res.status(404).json({
        success: false,
        error: 'Store not found',
      });
    }

    console.error('Trigger sync error: Failed to sync Shopify store');
    return res.status(500).json({
      success: false,
      error: 'Failed to sync Shopify store',
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

    return res.status(200).json({
      success: true,
      data: {
        collections,
        count: collections.length,
      },
    });
  } catch (error) {
    console.error('Get collections error:', safeErrorMessage(error, 'Failed to fetch collections'));
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch collections',
    });
  }
};
