import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import Store from '../models/Store';
import { tenantConfig } from '../config/tenant';

/**
 * Shopify webhook verification and tenant mapping middleware.
 *
 * Every Shopify webhook must pass two gates before any handler runs:
 * 1. `verifyShopifyWebhook` - HMAC verification against the exact raw request
 *    body using the Shopify app webhook secret (timing-safe comparison).
 * 2. `resolveShopifyWebhookStore` - resolves the trusted
 *    `X-Shopify-Shop-Domain` header to exactly one active, connected Store
 *    and attaches the trusted storeId to the request.
 *
 * See docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md and GitHub issue #63.
 */

export interface ShopifyWebhookRequest extends Request {
  /** Exact raw request body bytes, captured before JSON parsing. */
  shopifyRawBody?: Buffer;
  /** Trusted store context resolved from the verified webhook. */
  shopifyWebhook?: {
    storeId: string;
    shopDomain: string;
  };
}

// Shopify always sends the permanent *.myshopify.com domain in
// X-Shopify-Shop-Domain, never a custom storefront domain.
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * JSON body parser for Shopify webhook routes that captures the exact raw
 * body bytes before parsing. Must be mounted on the webhook path before the
 * global `express.json()` parser, because Shopify HMAC verification requires
 * the original bytes, not a reserialized `req.body`.
 */
export const shopifyWebhookBodyParser = express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as ShopifyWebhookRequest).shopifyRawBody = Buffer.from(buf);
  },
});

/**
 * Verify the X-Shopify-Hmac-Sha256 signature against the raw request body.
 * Fails closed: missing secret, missing raw body, missing signature, or an
 * invalid signature all reject the request before any handler runs.
 */
export const verifyShopifyWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const webhookSecret = tenantConfig.shopify.webhookSecret;

  if (!webhookSecret) {
    console.error('❌ SHOPIFY_WEBHOOK_SECRET is not configured; rejecting Shopify webhook');
    res.status(401).json({ error: 'Webhook verification is not configured' });
    return;
  }

  const rawBody = (req as ShopifyWebhookRequest).shopifyRawBody;
  if (!rawBody || rawBody.length === 0) {
    console.error('❌ Shopify webhook raw body was not captured; rejecting webhook');
    res.status(401).json({ error: 'Invalid webhook request body' });
    return;
  }

  const signature = req.get('X-Shopify-Hmac-Sha256');
  if (!signature) {
    console.warn('⚠️ Shopify webhook rejected: missing HMAC signature');
    res.status(401).json({ error: 'Missing webhook signature' });
    return;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest();
  const providedSignature = Buffer.from(signature, 'base64');

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignature)
  ) {
    console.warn('⚠️ Shopify webhook rejected: invalid HMAC signature');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
};

/**
 * Resolve the trusted X-Shopify-Shop-Domain header to exactly one active,
 * connected Store and attach the trusted storeId to the request. Unknown,
 * disconnected, inactive, or ambiguous shop domains are rejected before any
 * handler runs. Must run after `verifyShopifyWebhook`.
 */
export const resolveShopifyWebhookStore = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const shopDomain = req.get('X-Shopify-Shop-Domain')?.trim().toLowerCase();

    if (!shopDomain) {
      console.warn('⚠️ Shopify webhook rejected: missing X-Shopify-Shop-Domain header');
      res.status(403).json({ error: 'Missing shop domain' });
      return;
    }

    // Validate the format before using the header value anywhere (including
    // logs), so unexpected header content is never logged or queried raw.
    if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
      console.warn('⚠️ Shopify webhook rejected: malformed shop domain header');
      res.status(403).json({ error: 'Unknown shop domain' });
      return;
    }

    const stores = await Store.find({
      'shopify.shop': shopDomain,
      'shopify.isConnected': true,
      isActive: true,
    })
      .select('_id')
      .limit(2)
      .lean();

    if (stores.length === 0) {
      console.warn(`⚠️ Shopify webhook rejected: no connected store for shop ${shopDomain}`);
      res.status(403).json({ error: 'Unknown shop domain' });
      return;
    }

    if (stores.length > 1) {
      console.error(`❌ Shopify webhook rejected: multiple stores match shop ${shopDomain}`);
      res.status(403).json({ error: 'Ambiguous shop domain' });
      return;
    }

    (req as ShopifyWebhookRequest).shopifyWebhook = {
      storeId: stores[0]._id.toString(),
      shopDomain,
    };

    next();
  } catch (error) {
    console.error('Error resolving Shopify webhook store:', error);
    res.status(500).json({ error: 'Webhook store resolution failed' });
  }
};

/**
 * Read the trusted storeId attached by `resolveShopifyWebhookStore`.
 * Returns null when the webhook middleware chain did not run.
 */
export const getTrustedWebhookStoreId = (req: Request): string | null => {
  return (req as ShopifyWebhookRequest).shopifyWebhook?.storeId || null;
};
