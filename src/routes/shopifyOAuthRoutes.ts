import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { storeAuth, storeAdmin } from '../middleware/storeAuth';
import * as shopifyOAuthController from '../controllers/shopifyOAuthController';

const router = Router();

/**
 * Dashboard Shopify connect contract. Tokens are stored only on the backend
 * Store record. These handlers never return shopify.accessToken.
 *
 * GET  /oauth/install  — public App Store entry; HMAC, then 302 to Shopify authorize
 * POST /oauth/connect  — start connect, returns the Shopify authorize URL
 * GET  /oauth/callback — Shopify browser redirect; completes the grant
 * POST /oauth/claim    — store admin attaches a pending App Store token with the claim nonce
 * GET  /status         — connected | disconnected for the authenticated store
 * POST /disconnect     — revoke the Shopify token, then clear it
 * GET  /sync           — durable catalog sync status for the authenticated store
 * POST /sync           — Sync again: store-scoped sync with the backend token
 */

const dashboardGuard = [authenticate as any, storeAuth as any, storeAdmin as any];

/**
 * Public App Store install entry. Shopify opens this URL with shop, hmac,
 * timestamp, and host. No JWT. A bad HMAC is rejected and is not redirected
 * to the authorize URL.
 * GET /oauth/install
 */
router.get('/oauth/install', shopifyOAuthController.beginPublicInstall as any);

/**
 * Initiate Shopify OAuth flow
 * GET /oauth/connect?shop=store-name.myshopify.com
 * POST /oauth/connect with body { shop: "store-name.myshopify.com" }
 * Protected: store admin. Client storeId is ignored.
 */
router.get('/oauth/connect', ...dashboardGuard, shopifyOAuthController.initiateOAuth as any);

router.post('/oauth/connect', ...dashboardGuard, shopifyOAuthController.initiateOAuth as any);

/**
 * Handle Shopify OAuth callback
 * GET /oauth/callback?code=...&hmac=...&shop=...&state=...
 * Public: Shopify redirects here after user authorizes - no auth required
 * StoreId is retrieved from state token
 */
router.get(
  '/oauth/callback',
  shopifyOAuthController.handleCallback as any
);

/**
 * Claim a pending App Store install onto the authenticated store.
 * POST /oauth/claim { shop, claimToken }
 * Protected: store admin. Client storeId is ignored.
 */
router.post('/oauth/claim', ...dashboardGuard, shopifyOAuthController.claimPendingInstall as any);

/**
 * Get Shopify connection status
 * GET /status
 * Protected: Requires authentication and store context
 */
router.get('/status', ...dashboardGuard, shopifyOAuthController.getConnectionStatus as any);

/**
 * Disconnect Shopify store
 * POST /disconnect
 * Revokes the Shopify access token, then clears it on this store only.
 */
router.post('/disconnect', ...dashboardGuard, shopifyOAuthController.disconnectStore as any);

/**
 * Durable catalog sync status for the authenticated store.
 * GET /sync
 * Does not accept a client storeId. Includes build eligibility for this store.
 */
router.get('/sync', ...dashboardGuard, shopifyOAuthController.getCatalogSync as any);

/**
 * Sync again for the authenticated store.
 * POST /sync
 * Uses the backend token for that storeId. Refuses when disconnected.
 * Persists idle | syncing | succeeded | failed and retries a failure quietly.
 */
router.post('/sync', ...dashboardGuard, shopifyOAuthController.triggerSync as any);

/**
 * Get collections from connected Shopify store
 * GET /collections
 * Protected: store admin, scoped to the authenticated store
 */
router.get('/collections', ...dashboardGuard, shopifyOAuthController.getCollections as any);

export default router;
