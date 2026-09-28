import { ApiError } from './errors';

const TRUTHY_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * Shopify Storefront cart GID, including the optional cart key Shopify
 * appends (`gid://shopify/Cart/<token>` or `gid://shopify/Cart/<token>?key=<key>`).
 * Cartaisy local identifiers (ObjectIds, guest session ids, product GIDs)
 * do not match.
 */
const SHOPIFY_STOREFRONT_CART_GID =
  /^gid:\/\/shopify\/Cart\/[^/?#\s]+(?:\?key=[^&#\s]+)?$/;

export const LEGACY_STRIPE_SETTLEMENT_MESSAGE =
  'Native checkout is disabled; use the Shopify-hosted checkout handoff';

export const isTruthyEnv = (value: string | undefined): boolean =>
  TRUTHY_ENV_VALUES.has((value || '').toLowerCase());

/**
 * SaaS and production must not charge cards or create paid orders through
 * Cartaisy. Shopify-hosted checkout handoff is the only settlement entry.
 * There is no override that turns Stripe settlement back on in those modes.
 */
export const isLegacyStripeSettlementDisabled = (): boolean =>
  process.env.NODE_ENV === 'production' ||
  isTruthyEnv(process.env.SAAS_MODE) ||
  isTruthyEnv(process.env.MULTI_TENANT_MODE);

export const assertLegacyStripeSettlementAllowed = (): void => {
  if (!isLegacyStripeSettlementDisabled()) {
    return;
  }

  throw new ApiError(LEGACY_STRIPE_SETTLEMENT_MESSAGE, 403, true, undefined, true);
};

export const isShopifyStorefrontCartGid = (cartId: string): boolean =>
  SHOPIFY_STOREFRONT_CART_GID.test(cartId);
