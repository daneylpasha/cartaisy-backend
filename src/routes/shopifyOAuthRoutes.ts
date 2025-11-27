import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { storeAuth } from '../middleware/storeAuth';
import * as shopifyOAuthController from '../controllers/shopifyOAuthController';

const router = Router();

/**
 * Initiate Shopify OAuth flow
 * GET /oauth/connect?shop=store-name.myshopify.com
 * POST /oauth/connect with body { shop: "store-name.myshopify.com" }
 * Protected: Requires authentication and store context
 */
router.get(
  '/oauth/connect',
  authenticate as any,
  storeAuth as any,
  shopifyOAuthController.initiateOAuth as any
);

router.post(
  '/oauth/connect',
  authenticate as any,
  storeAuth as any,
  shopifyOAuthController.initiateOAuth as any
);

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
 * Get Shopify connection status
 * GET /status
 * Protected: Requires authentication and store context
 */
router.get(
  '/status',
  authenticate as any,
  storeAuth as any,
  shopifyOAuthController.getConnectionStatus as any
);

/**
 * Disconnect Shopify store
 * POST /disconnect
 * Protected: Requires authentication and store context
 */
router.post(
  '/disconnect',
  authenticate as any,
  storeAuth as any,
  shopifyOAuthController.disconnectStore as any
);

/**
 * Get collections from connected Shopify store
 * GET /collections
 * Protected: Requires authentication and store context
 */
router.get(
  '/collections',
  authenticate as any,
  storeAuth as any,
  shopifyOAuthController.getCollections as any
);

export default router;
