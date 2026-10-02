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
import { startOperationalWebhookRegistration } from '../services/shopifyWebhookSubscriptionService';
import {
  ShopifyAdminBillingError,
  shopifyAdminBillingErrorBody,
} from '../utils/shopifyAdminBilling';
import { ShopifyAdminTokenError } from '../utils/shopifyTokenStorage';

/**
 * Shopify OAuth Controller
 *
 * Dashboard contract (backend is the only token owner):
 * - POST /shopify/oauth/connect returns an authorize URL. No access token.
 * - GET  /shopify/oauth/install is the public App Store entry. It verifies
 *   the Shopify HMAC and redirects to the authorize URL with no store yet.
 * - GET  /shopify/oauth/callback completes OAuth. A dashboard connect stores
 *   the token, starts the first catalog sync, and registers operational
 *   webhook subscriptions. An App Store install stores the encrypted token
 *   on a pending record and does not sync until that install is claimed.
 *   Neither the sync nor webhook registration blocks the redirect.
 * - POST /shopify/oauth/claim attaches a pending App Store token to the
 *   authenticated store, then starts the same sync and webhook work.
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

const bodyClaimTokenOf = (req: AuthenticatedRequest): unknown =>
  (req.body as { claimToken?: unknown } | undefined)?.claimToken;

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
  redirect: {
    outcome: 'connected' | 'error';
    shop?: string;
    reason?: string;
    claim?: 'pending';
    claimToken?: string;
  }
): void => {
  const returnUrl = shopifyOAuth.buildOAuthReturnUrl(redirect.outcome, {
    shop: redirect.shop,
    reason: redirect.reason,
    claim: redirect.claim,
    claimToken: redirect.claimToken,
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
 * After a token is stored on a store: currency/timezone, then catalog sync,
 * operational webhooks, and the Storefront token. Sync and webhook failures
 * do not roll back the connection. The sync claim is awaited so status is
 * `syncing` before the HTTP response; the import itself keeps running.
 */
const startPostConnectWork = async (storeId: string, normalizedShop: string): Promise<void> => {
  try {
    await startCatalogSyncForStore(storeId);
  } catch (syncStartError: unknown) {
    console.error(
      `[Shopify OAuth] Catalog sync failed to start for store ${storeId} shop ${normalizedShop}: ${toSafeSyncErrorSummary(syncStartError)}`
    );
  }

  try {
    startOperationalWebhookRegistration(storeId);
  } catch (webhookError: unknown) {
    console.error(
      `[Shopify OAuth] Webhook registration failed to start for store ${storeId} shop ${normalizedShop}: ${safeErrorMessage(webhookError, 'Webhook registration failed')}`
    );
  }

  try {
    await shopifyOAuth.createStorefrontAccessToken(storeId);
  } catch (storefrontError: unknown) {
    const message = storefrontError instanceof Error ? storefrontError.message : 'Unknown error';
    console.warn(
      `[Shopify OAuth] Storefront access token provisioning failed for store ${storeId}; store remains Admin-connected:`,
      message || 'Unknown error'
    );
  }
};

const connectGrantedToken = async (
  storeId: string,
  normalizedShop: string,
  accessToken: string,
  scope: string
) => {
  const shopInfo = await shopifyOAuth.getShopInfo(normalizedShop, accessToken);

  await shopifyOAuth.saveCredentials(
    storeId,
    normalizedShop,
    accessToken,
    scope
  );

  return shopInfo;
};

const rememberShopSettings = async (
  storeId: string,
  shopInfo: shopifyOAuth.ShopInfo
): Promise<void> => {
  await Store.findByIdAndUpdate(storeId, {
    $set: {
      'settings.currency': shopInfo.currency || 'USD',
      'settings.timezone': shopInfo.timezone || 'UTC',
    },
  });
};

/**
 * Public App Store install entry.
 * GET /shopify/oauth/install?shop=...&hmac=...&timestamp=...
 * No JWT. Verifies Shopify's HMAC before any redirect to the authorize URL.
 */
export const beginPublicInstall = async (req: AuthenticatedRequest, res: Response) => {
  const query = (req.query || {}) as Record<string, unknown>;
  const fail = (status: number, error: string, reason: string, shopDomain?: string): void => {
    sendCallbackResult(
      res,
      status,
      { success: false, error },
      { outcome: 'error', reason, shop: shopDomain }
    );
  };

  let hmacValid = false;
  try {
    hmacValid = shopifyOAuth.verifyOAuthCallbackHmac(query);
  } catch (error) {
    return fail(
      oauthStatusCode(error, 500),
      safeErrorMessage(error, 'OAuth install failed'),
      oauthReasonCode(error, 'oauth_not_configured')
    );
  }

  if (!hmacValid) {
    return res.status(401).json({
      success: false,
      error: 'Invalid OAuth signature',
    });
  }

  try {
    shopifyOAuth.assertRecentOAuthTimestamp(query);
  } catch (error) {
    return res.status(oauthStatusCode(error, 401)).json({
      success: false,
      error: safeErrorMessage(error, 'Invalid OAuth request'),
    });
  }

  try {
    if (typeof query.shop !== 'string') {
      return fail(400, 'Shop parameter is required', 'invalid_shop');
    }

    const authorizationUrl = await shopifyOAuth.beginPublicAppInstall(query.shop);
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    const shop = typeof query.shop === 'string' ? query.shop : undefined;
    console.error('Public install error:', safeErrorMessage(error, 'OAuth install failed'));
    return fail(
      oauthStatusCode(error, 400),
      safeErrorMessage(error, 'OAuth install failed'),
      oauthReasonCode(error, 'oauth_failed'),
      shop
    );
  }
};

/**
 * Handles Shopify OAuth callback
 * GET /shopify/oauth/callback?code=...&hmac=...&shop=...&state=...
 * Public: Shopify redirects the merchant's browser here. A dashboard connect
 * reads storeId from the single-use state record. An App Store install has
 * no storeId; the token stays on the pending record until claim. When
 * SHOPIFY_OAUTH_RETURN_URL is set, the browser is sent back to the dashboard
 * without the access token.
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
    const pending = validatedData
      ? null
      : await shopifyOAuth.consumePendingInstallState(state);

    if (validatedData && validatedData.shop !== normalizedShop) {
      return fail(401, 'Invalid or expired state token', 'invalid_state', normalizedShop);
    }
    if (!validatedData && (!pending || pending.shop !== normalizedShop)) {
      return fail(401, 'Invalid or expired state token', 'invalid_state', normalizedShop);
    }

    const tokenResponse = await shopifyOAuth.exchangeCodeForToken(normalizedShop, code);

    if (!tokenResponse.accessToken) {
      return fail(
        400,
        'Failed to obtain access token from Shopify',
        'token_exchange_failed',
        normalizedShop
      );
    }

    if (pending) {
      const claimToken = await shopifyOAuth.storePendingInstallToken(
        pending.id,
        tokenResponse.accessToken,
        tokenResponse.scope
      );

      return sendCallbackResult(
        res,
        200,
        {
          success: true,
          data: {
            status: 'pending_claim',
            claim: 'pending',
            claimToken,
            tokenOwner: 'backend',
            shop: normalizedShop,
            message: 'Shopify authorized. Claim this shop for your store to finish connect.',
          },
        },
        { outcome: 'connected', shop: normalizedShop, claim: 'pending', claimToken }
      );
    }

    if (!validatedData) {
      return fail(401, 'Invalid or expired state token', 'invalid_state', normalizedShop);
    }

    const storeId = validatedData.storeId;
    const shopInfo = await connectGrantedToken(
      storeId,
      normalizedShop,
      tokenResponse.accessToken,
      tokenResponse.scope
    );
    await rememberShopSettings(storeId, shopInfo);

    // First catalog sync (issue #166) and operational webhooks. Claim
    // `syncing` before the redirect so GET /shopify/sync shows progress, then
    // let the import finish in the background. A sync or webhook error must
    // not roll back a successful connect.
    await startPostConnectWork(storeId, normalizedShop);

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

const shopSummary = (shopInfo: shopifyOAuth.ShopInfo) => ({
  shop: shopInfo.shop,
  name: shopInfo.name,
  email: shopInfo.email,
  domain: shopInfo.domain,
  currency: shopInfo.currency,
  timezone: shopInfo.timezone,
  country: shopInfo.country,
});

/**
 * Attach a pending App Store install to the authenticated store.
 * POST /shopify/oauth/claim { shop, claimToken }
 * Store admin JWT. claimToken is the nonce from the callback fragment.
 * A client storeId is ignored. Sync and webhooks start only after
 * saveCredentials succeeds.
 */
export const claimPendingInstall = async (req: AuthenticatedRequest, res: Response) => {
  let claim: shopifyOAuth.PendingInstallGrant | null = null;
  let credentialsSaved = false;

  try {
    if (!req.storeId) {
      return res.status(401).json({
        success: false,
        error: 'Store authentication required',
      });
    }

    const rawShop = bodyShopOf(req);
    if (typeof rawShop !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Shop parameter is required',
      });
    }

    const claimToken = bodyClaimTokenOf(req);
    if (typeof claimToken !== 'string' || !claimToken) {
      return res.status(400).json({
        success: false,
        error: 'Claim token is required',
      });
    }

    const storeId = req.storeId.toString();
    claim = await shopifyOAuth.beginPendingInstallClaim(rawShop, storeId, claimToken);
    const shopInfo = await connectGrantedToken(
      storeId,
      claim.shop,
      claim.accessToken,
      claim.scope
    );
    credentialsSaved = true;
    await rememberShopSettings(storeId, shopInfo);
    await shopifyOAuth.completePendingInstallClaim(claim.id, claim.shop);
    const connectedShop = claim.shop;
    claim = null;

    await startPostConnectWork(storeId, connectedShop);

    return res.status(200).json({
      success: true,
      data: {
        status: 'connected',
        tokenOwner: 'backend',
        shop: shopSummary(shopInfo),
        message: 'Shopify store connected successfully',
      },
    });
  } catch (error) {
    if (claim) {
      try {
        if (credentialsSaved) {
          await shopifyOAuth.completePendingInstallClaim(claim.id, claim.shop);
        } else {
          await shopifyOAuth.abortPendingInstallClaim(claim.id, req.storeId?.toString() || '');
        }
      } catch (abortError) {
        console.error(
          'Pending install claim abort error:',
          safeErrorMessage(abortError, 'Failed to release pending Shopify install')
        );
      }
    }

    const claimError = error instanceof shopifyOAuth.ShopifyOAuthError
      ? error.message
      : 'Failed to claim Shopify install';
    console.error('Pending install claim error:', claimError);
    return res.status(oauthStatusCode(error, 400)).json({
      success: false,
      error: claimError,
    });
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
      'shopify.shop shopify.scope shopify.isConnected shopify.connectedAt shopify.lastSyncAt shopify.webhooksRegisteredAt shopify.webhookRegistrationError'
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
        webhooksRegisteredAt: isConnected ? store.shopify?.webhooksRegisteredAt || null : null,
        webhookRegistrationError: isConnected ? store.shopify?.webhookRegistrationError || null : null,
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

    if (error instanceof ShopifyAdminBillingError) {
      console.error('Trigger sync error:', error.code);
      const failedStoreId = req.storeId?.toString();
      const status = failedStoreId ? await getCatalogSyncStatus(failedStoreId) : null;
      return res.status(error.statusCode).json({
        ...shopifyAdminBillingErrorBody(error),
        ...(status
          ? {
              data: {
                ...status,
                storeId: failedStoreId,
                tokenOwner: 'backend',
              },
            }
          : {}),
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
    if (error instanceof ShopifyAdminTokenError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof ShopifyAdminBillingError) {
      console.error('Get collections error:', error.code);
      return res.status(error.statusCode).json(shopifyAdminBillingErrorBody(error));
    }

    console.error('Get collections error:', safeErrorMessage(error, 'Failed to fetch collections'));
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch collections',
    });
  }
};
