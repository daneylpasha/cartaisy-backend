import crypto from 'crypto';
import fetch from 'node-fetch';
import Store from '../models/Store';
import { encrypt, decrypt } from '../utils/encryption';
import { getShopifyClientForStore } from './shopifyService';
import { catalogSyncShopChangeUpdate } from './catalogSyncService';

/**
 * Shopify OAuth Service
 * Handles OAuth flow and credential management for Shopify store connections
 */

const STATE_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Dashboard-facing OAuth failure. `reasonCode` is safe to put on the browser
 * return URL; it never includes tokens, secrets, or Shopify response bodies.
 */
export class ShopifyOAuthError extends Error {
  statusCode: number;
  reasonCode: string;

  constructor(message: string, statusCode: number, reasonCode: string) {
    super(message);
    this.name = 'ShopifyOAuthError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

const shopifyApiVersion = (): string =>
  (process.env.SHOPIFY_API_VERSION || '2024-01').trim() || '2024-01';

/**
 * Partner app credentials. `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` are
 * the names this flow owns. `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` are
 * accepted only as a fallback so an existing Partner app install keeps working.
 * Per-store access tokens are never read from the environment.
 */
const getPartnerAppCredentials = (): { clientId: string; clientSecret: string } => {
  const clientId = (process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || '').trim();
  const clientSecret = (
    process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || ''
  ).trim();

  if (!clientId || !clientSecret) {
    throw new ShopifyOAuthError(
      'Shopify OAuth credentials not configured',
      500,
      'oauth_not_configured'
    );
  }

  return { clientId, clientSecret };
};

const getOAuthRedirectConfig = (): { redirectUri: string; scopes: string } => {
  const redirectUri = (process.env.SHOPIFY_REDIRECT_URI || '').trim();
  const scopes = (process.env.SHOPIFY_SCOPES || '').trim();

  if (!redirectUri || !scopes) {
    throw new ShopifyOAuthError(
      'Shopify OAuth environment variables not configured',
      500,
      'oauth_not_configured'
    );
  }

  return { redirectUri, scopes };
};

/**
 * Canonical `*.myshopify.com` shop domain. Rejects custom domains and any
 * value that is not a single shop host.
 */
export const normalizeShopDomain = (shop: unknown): string => {
  if (typeof shop !== 'string') {
    throw new ShopifyOAuthError(
      'Shop parameter is required',
      400,
      'invalid_shop'
    );
  }

  const normalized = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!SHOP_DOMAIN_PATTERN.test(normalized)) {
    throw new ShopifyOAuthError(
      'Invalid shop format. Expected format: shop-name.myshopify.com',
      400,
      'invalid_shop'
    );
  }

  return normalized;
};

const hashOAuthState = (state: string): string =>
  crypto.createHash('sha256').update(state).digest('hex');

const OAUTH_STATE_SELECT =
  '+shopify.oauthStateHash +shopify.oauthStateShop +shopify.oauthStateExpiresAt';

/**
 * A shop domain may belong to only one connected store. Webhook delivery
 * resolves shop → Store and fails closed when that mapping is ambiguous.
 */
const assertShopAvailableForStore = async (shop: string, storeId: string): Promise<void> => {
  const conflict = await Store.findOne({
    _id: { $ne: storeId },
    'shopify.shop': shop,
    'shopify.isConnected': true,
  }).select('_id');

  if (conflict) {
    throw new ShopifyOAuthError(
      'This Shopify shop is already connected to another store',
      409,
      'shop_taken'
    );
  }

  const current = await Store.findById(storeId).select('shopify.shop shopify.isConnected');
  if (!current) {
    throw new ShopifyOAuthError('Store not found', 404, 'store_not_found');
  }

  const connectedShop = current.shopify?.shop;
  if (
    current.shopify?.isConnected &&
    connectedShop &&
    connectedShop !== shop
  ) {
    throw new ShopifyOAuthError(
      'Disconnect the current Shopify shop before connecting a different one',
      409,
      'shop_switch_required'
    );
  }
};

export interface TokenResponse {
  accessToken: string;
  scope: string;
}

export interface ShopInfo {
  shop: string;
  name: string;
  email: string;
  domain: string;
  currency: string;
  timezone: string;
  country: string;
}

export interface Collection {
  id: string;
  title: string;
  handle: string;
  image?: {
    src: string;
  };
}

/**
 * Gets Shopify authorization URL for starting OAuth flow
 */
export const getAuthorizationUrl = (shop: string, state: string): string => {
  const normalizedShop = normalizeShopDomain(shop);
  const { clientId } = getPartnerAppCredentials();
  const { redirectUri, scopes } = getOAuthRedirectConfig();

  const baseUrl = `https://${normalizedShop}/admin/oauth/authorize`;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `${baseUrl}?${params.toString()}`;
};

/**
 * Verify the Shopify OAuth callback query HMAC.
 *
 * Shopify signs every callback parameter except `hmac` (and legacy `signature`)
 * with the Partner app secret. Comparison is timing-safe. The raw query values
 * must be used; do not normalize the shop before this check.
 */
export const verifyOAuthCallbackHmac = (query: Record<string, unknown>): boolean => {
  const { clientSecret } = getPartnerAppCredentials();
  const hmac = query.hmac;

  if (typeof hmac !== 'string' || !/^[a-f0-9]+$/i.test(hmac)) {
    return false;
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(query)) {
    if (key === 'hmac' || key === 'signature') {
      continue;
    }
    if (typeof value !== 'string') {
      return false;
    }
    pairs.push([key, value]);
  }

  pairs.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const message = pairs.map(([key, value]) => `${key}=${value}`).join('&');
  const digest = crypto.createHmac('sha256', clientSecret).update(message).digest('hex');

  const expected = Buffer.from(digest, 'utf8');
  const provided = Buffer.from(hmac, 'utf8');
  if (expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
};

/**
 * Browser return URL after the public OAuth callback. Built only from
 * `SHOPIFY_OAUTH_RETURN_URL`. Caller-supplied return URLs are ignored so the
 * callback cannot be turned into an open redirect, and the token is never
 * copied onto the query string.
 */
export const buildOAuthReturnUrl = (
  outcome: 'connected' | 'error',
  details: { shop?: string; reason?: string } = {}
): string | null => {
  const raw = (process.env.SHOPIFY_OAUTH_RETURN_URL || '').trim();
  if (!raw) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null;
  }

  url.searchParams.set('shopify', outcome);
  if (details.shop && SHOP_DOMAIN_PATTERN.test(details.shop)) {
    url.searchParams.set('shop', details.shop);
  }
  if (outcome === 'error' && details.reason && /^[a-z0-9_]+$/.test(details.reason)) {
    url.searchParams.set('reason', details.reason);
  }

  const serialized = url.toString();
  if (/access[_-]?token|shpat_|shpss_|client_secret/i.test(serialized)) {
    return null;
  }

  return serialized;
};

/**
 * Exchanges authorization code for access token
 */
export const exchangeCodeForToken = async (
  shop: string,
  code: string
): Promise<TokenResponse> => {
  const normalizedShop = normalizeShopDomain(shop);
  const { clientId, clientSecret } = getPartnerAppCredentials();

  try {
    const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      console.error('Shopify token exchange failed:', response.status);
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    // Shopify returns snake_case: { access_token, scope }
    const data = (await response.json()) as { access_token: string; scope: string };

    if (!data.access_token || !data.scope) {
      console.error('Invalid token response from Shopify');
      throw new Error('Invalid token response from Shopify');
    }

    // Convert to camelCase for internal use
    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  } catch (error) {
    console.error(
      'Token exchange error:',
      error instanceof Error ? error.message : 'unknown'
    );
    if (error instanceof ShopifyOAuthError) {
      throw error;
    }
    throw new ShopifyOAuthError(
      'Failed to exchange code for access token',
      400,
      'token_exchange_failed'
    );
  }
};

/**
 * Retrieves shop information from Shopify API
 */
export const getShopInfo = async (
  shop: string,
  accessToken: string
): Promise<ShopInfo> => {
  const normalizedShop = normalizeShopDomain(shop);

  try {
    const response = await fetch(
      `https://${normalizedShop}/admin/api/${shopifyApiVersion()}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query {
              shop {
                id
                name
                email
                myshopifyDomain
                primaryDomain {
                  host
                  url
                }
                currencyCode
                ianaTimezone
                billingAddress {
                  countryCode
                }
              }
            }
          `,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    if (data.errors) {
      throw new Error(`Shopify GraphQL error: ${data.errors[0]?.message}`);
    }

    const shopData = data.data?.shop;
    if (!shopData) {
      throw new Error('No shop data returned from Shopify');
    }

    return {
      shop: normalizedShop,
      name: shopData.name || '',
      email: shopData.email || '',
      domain: shopData.primaryDomain?.host || shopData.myshopifyDomain || '',
      currency: shopData.currencyCode || 'USD',
      timezone: shopData.ianaTimezone || 'UTC',
      country: shopData.billingAddress?.countryCode || '',
    };
  } catch (error) {
    console.error('Get shop info error:', error);
    throw new Error('Failed to fetch shop information');
  }
};

/**
 * Fetches the primary location ID from Shopify with retry logic
 * @param shop - Shopify shop domain
 * @param accessToken - Shopify access token
 * @param retries - Number of retry attempts (default: 3)
 */
export const getPrimaryLocationId = async (
  shop: string,
  accessToken: string,
  retries: number = 3
): Promise<string | null> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[LocationID] Fetching location for ${shop} (attempt ${attempt}/${retries})`);

      const response = await fetch(
        `https://${shop}/admin/api/${shopifyApiVersion()}/locations.json`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[LocationID] API error (${response.status}): ${errorText}`);

        // Retry on 5xx errors or rate limits
        if (response.status >= 500 || response.status === 429) {
          if (attempt < retries) {
            const delay = attempt * 2000; // 2s, 4s, 6s
            console.log(`[LocationID] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        return null;
      }

      const data: any = await response.json();
      // Get the first active location (primary location)
      const primaryLocation = data.locations?.find((loc: any) => loc.active) || data.locations?.[0];

      if (primaryLocation?.id) {
        console.log(`✅ [LocationID] Found: ${primaryLocation.name} (ID: ${primaryLocation.id})`);
        return primaryLocation.id.toString();
      }

      console.warn(`[LocationID] No locations found for ${shop}`);
      return null;
    } catch (error: any) {
      console.error(`[LocationID] Error (attempt ${attempt}):`, error.message);

      if (attempt < retries) {
        const delay = attempt * 2000;
        console.log(`[LocationID] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return null;
    }
  }
  return null;
};

/**
 * Saves encrypted credentials to Store document
 */
export const saveCredentials = async (
  storeId: string,
  shop: string,
  accessToken: string,
  scope: string
): Promise<void> => {
  const normalizedShop = normalizeShopDomain(shop);
  await assertShopAvailableForStore(normalizedShop, storeId);

  try {
    // Encrypt the access token before saving. The plaintext token is never written.
    const encryptedToken = encrypt(accessToken);

    // Fetch primary location ID for inventory management
    const locationId = await getPrimaryLocationId(normalizedShop, accessToken);

    const existing = await Store.findById(storeId).select('shopify.shop catalogSync.shop');
    const shopChange = catalogSyncShopChangeUpdate(
      existing?.catalogSync?.shop,
      existing?.shopify?.shop,
      normalizedShop
    );

    const updateData: Record<string, unknown> = {
      'shopify.shop': normalizedShop,
      'shopify.accessToken': encryptedToken,
      'shopify.scope': scope,
      'shopify.isConnected': true,
      'shopify.connectedAt': new Date(),
      // lastSyncAt is written when a catalog sync runs (syncService), not at
      // connect. Build eligibility uses Store.catalogSync, not this timestamp.
      ...(shopChange?.set ?? {}),
    };

    // Add locationId if found
    if (locationId) {
      updateData['shopify.locationId'] = locationId;
      console.log(`✅ [Shopify Connect] Store connected with locationId: ${locationId}`);
    } else {
      console.warn('⚠️ [Shopify Connect] Store connected but locationId could not be fetched!');
      console.warn('⚠️ [Shopify Connect] Inventory sync will NOT work until locationId is set.');
      console.warn('⚠️ [Shopify Connect] Use POST /api/v1/admin/shopify/fetch-location to retry.');
    }

    // The store must already exist. OAuth must not create a tenant.
    const store = await Store.findByIdAndUpdate(
      storeId,
      {
        $set: updateData,
        $unset: {
          'shopify.oauthStateHash': '',
          'shopify.oauthStateShop': '',
          'shopify.oauthStateExpiresAt': '',
          ...(shopChange?.unset ?? {}),
        },
      },
      { new: true }
    );

    if (!store) {
      throw new ShopifyOAuthError('Store not found', 404, 'store_not_found');
    }

    console.log(`✅ [Shopify Connect] Store ${storeId} credentials saved successfully`);
  } catch (error) {
    if (error instanceof ShopifyOAuthError) {
      throw error;
    }
    console.error('Save credentials error:', error);
    throw new ShopifyOAuthError(
      'Failed to save Shopify credentials',
      500,
      'credential_save_failed'
    );
  }
};

// Title we tag every Cartaisy-provisioned Storefront token with so provisioning
// can recognise (and reuse/clean up) its own tokens on subsequent runs.
const STOREFRONT_TOKEN_TITLE = 'Cartaisy Storefront API Token';

/**
 * Lists the shop's existing Storefront access tokens via the Admin GraphQL API.
 * Returns `{ id, title, accessToken }` for each token so provisioning can find
 * and reuse a token Cartaisy already created.
 */
const listStorefrontAccessTokens = async (
  client: any
): Promise<Array<{ id: string; title: string; accessToken?: string }>> => {
  const query = `
    query {
      shop {
        storefrontAccessTokens(first: 100) {
          edges {
            node {
              id
              title
              accessToken
            }
          }
        }
      }
    }
  `;

  const response = await client.post('/graphql.json', { query });

  if (response.data?.errors?.length) {
    throw new Error(
      `Failed to list Storefront access tokens: ${response.data.errors[0]?.message || 'Unknown error'}`
    );
  }

  return (
    response.data?.data?.shop?.storefrontAccessTokens?.edges?.map(
      (edge: any) => edge.node
    ) || []
  );
};

/**
 * Best-effort deletion of a Storefront access token by its GraphQL id. Never
 * throws — a failed cleanup must not block reuse/creation of a working token.
 */
const deleteStorefrontAccessToken = async (
  client: any,
  storeId: string,
  id: string
): Promise<void> => {
  const mutation = `
    mutation storefrontAccessTokenDelete($input: StorefrontAccessTokenDeleteInput!) {
      storefrontAccessTokenDelete(input: $input) {
        deletedStorefrontAccessTokenId
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const response = await client.post('/graphql.json', {
      query: mutation,
      variables: { input: { id } },
    });

    const userErrors =
      response.data?.data?.storefrontAccessTokenDelete?.userErrors ||
      response.data?.errors;
    if (userErrors?.length) {
      console.warn(
        `[Shopify Storefront Token] Could not delete stale token for store ${storeId}:`,
        userErrors
      );
    }
  } catch (error) {
    console.warn(
      `[Shopify Storefront Token] Error deleting stale token for store ${storeId}:`,
      error
    );
  }
};

/**
 * Provisions a per-store Shopify Storefront API access token and persists it to
 * `Store.shopify.storefrontAccessToken` for that store only.
 *
 * Resolves the store's already-connected Admin credentials via
 * `getShopifyClientForStore(storeId)` (no global env fallback). Provisioning is
 * **idempotent**: it first queries the shop's existing Storefront tokens and, if
 * a `'Cartaisy Storefront API Token'` already exists, reuses that token instead
 * of creating another. Only when no reusable token exists does it delete any
 * stale Cartaisy-titled tokens (e.g. ones missing a readable value) and create a
 * fresh one. This prevents OAuth reconnects and manual retries from
 * accumulating orphaned active tokens and eventually hitting Shopify's per-shop
 * token limit.
 *
 * The token value is never logged or returned in full — callers receive only a
 * presence flag and the last 4 characters for diagnostics.
 *
 * @param storeId - MongoDB Store ID whose Admin connection is used
 * @returns Summary with a `created` flag (true only when a new token was
 *   created, false when an existing one was reused) and the token's last-4
 *   characters
 */
export const createStorefrontAccessToken = async (
  storeId: string
): Promise<{ created: boolean; last4: string }> => {
  if (!storeId) {
    throw new Error('Cannot create Storefront access token without a storeId');
  }

  // Resolve the store's own Admin credentials — fail closed if not connected.
  const client = await getShopifyClientForStore(storeId);
  if (!client) {
    throw new Error('Store not connected to Shopify');
  }

  // Idempotency: inspect tokens that already exist on this shop.
  const existingTokens = await listStorefrontAccessTokens(client);
  const cartaisyTokens = existingTokens.filter(
    (token) => token.title === STOREFRONT_TOKEN_TITLE
  );
  const reusable = cartaisyTokens.filter((token) => !!token.accessToken);

  if (reusable.length > 0) {
    // Reuse the first Cartaisy token and prune any duplicates so the shop
    // converges to a single active Storefront credential.
    const [keep, ...duplicates] = reusable;
    for (const duplicate of duplicates) {
      await deleteStorefrontAccessToken(client, storeId, duplicate.id);
    }

    const accessToken = keep.accessToken as string;
    const store = await Store.findByIdAndUpdate(
      storeId,
      { $set: { 'shopify.storefrontAccessToken': accessToken } },
      { new: true }
    );
    if (!store) {
      throw new Error('Store not found');
    }

    const last4 = accessToken.slice(-4);
    console.log(
      `♻️ [Shopify Storefront Token] Reused existing token for store ${storeId} (present, last4: ${last4})`
    );
    return { created: false, last4 };
  }

  // No reusable token: delete any stale Cartaisy-titled tokens (e.g. ones whose
  // value can't be read back) so we don't leave orphans behind, then create one.
  for (const stale of cartaisyTokens) {
    await deleteStorefrontAccessToken(client, storeId, stale.id);
  }

  const mutation = `
    mutation storefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
      storefrontAccessTokenCreate(input: $input) {
        storefrontAccessToken {
          accessToken
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await client.post('/graphql.json', {
    query: mutation,
    variables: {
      input: { title: STOREFRONT_TOKEN_TITLE },
    },
  });

  const payload = response.data?.data?.storefrontAccessTokenCreate;
  const userErrors = payload?.userErrors?.length
    ? payload.userErrors
    : response.data?.errors;

  if (userErrors && userErrors.length > 0) {
    // Log the structured errors (no token present in this path) and fail closed.
    console.error(
      `[Shopify Storefront Token] Shopify returned errors for store ${storeId}:`,
      userErrors
    );
    throw new Error(
      `Failed to create Storefront access token: ${userErrors[0]?.message || 'Unknown error'}`
    );
  }

  const accessToken = payload?.storefrontAccessToken?.accessToken;
  if (!accessToken) {
    throw new Error('Shopify did not return a Storefront access token');
  }

  // storefrontAccessToken is a public (client-side) token; the schema stores it
  // unencrypted, matching how getStorefrontClientForStore() reads it back.
  const store = await Store.findByIdAndUpdate(
    storeId,
    { $set: { 'shopify.storefrontAccessToken': accessToken } },
    { new: true }
  );

  if (!store) {
    throw new Error('Store not found');
  }

  const last4 = accessToken.slice(-4);
  console.log(
    `✅ [Shopify Storefront Token] Persisted for store ${storeId} (present, last4: ${last4})`
  );

  return { created: true, last4 };
};

/**
 * Retrieves and decrypts access token for a store
 */
export const getAccessToken = async (storeId: string): Promise<string | null> => {
  try {
    const store = await Store.findById(storeId).select('shopify.accessToken shopify.isConnected');

    if (!store || !store.shopify?.isConnected) {
      return null;
    }

    const encryptedToken = store.shopify?.accessToken;
    if (!encryptedToken) {
      return null;
    }

    // Decrypt the token
    const decryptedToken = decrypt(encryptedToken);
    return decryptedToken;
  } catch (error) {
    console.error('Get access token error:', error);
    return null;
  }
};

const readStoredAdminToken = (stored: string): string => {
  const isEncrypted = stored.includes(':') && stored.split(':').length === 3;
  if (!isEncrypted) {
    return stored;
  }
  return decrypt(stored);
};

/**
 * Ask Shopify to revoke the current offline access token. A 401/404 means the
 * install is already gone, which is a successful revoke for our purposes.
 */
const revokeShopifyAccessToken = async (shop: string, accessToken: string): Promise<void> => {
  const response = await fetch(`https://${shop}/admin/api_permissions/current.json`, {
    method: 'DELETE',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  if (response.ok || response.status === 401 || response.status === 404) {
    return;
  }

  console.error(`[Shopify Disconnect] Token revoke failed for ${shop} with status ${response.status}`);
  throw new ShopifyOAuthError(
    'Failed to revoke Shopify access. The store is still connected; retry disconnect.',
    502,
    'revoke_failed'
  );
};

const clearShopifyCredentials = async (
  storeId: string,
  options?: { triggeredAt?: Date | null }
): Promise<boolean> => {
  // One pipeline so a reconnect cannot land between reading the shop domain
  // and clearing it. complianceShop keeps that domain for later compliance
  // webhooks. Catalog webhooks still require isConnected.
  //
  // When `triggeredAt` is set (app/uninstalled), the newer-connection check is
  // part of this same update. A reconnect that commits first no longer matches,
  // so a stale uninstall cannot wipe the new token.
  const triggeredAt = options?.triggeredAt;
  const guardReplay = Boolean(triggeredAt && !Number.isNaN(triggeredAt.getTime()));
  const filter: Record<string, unknown> = { _id: storeId };
  if (guardReplay && triggeredAt) {
    filter.$nor = [
      {
        'shopify.isConnected': true,
        'shopify.connectedAt': { $gt: triggeredAt },
      },
    ];
  }

  const store = await Store.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          'shopify.isConnected': false,
          'shopify.complianceShop': {
            $let: {
              vars: { shop: { $ifNull: ['$shopify.shop', ''] } },
              in: {
                $cond: [
                  { $gt: [{ $strLenCP: '$$shop' }, 0] },
                  { $toLower: '$$shop' },
                  '$shopify.complianceShop',
                ],
              },
            },
          },
        },
      },
      {
        $unset: [
          'shopify.shop',
          'shopify.accessToken',
          'shopify.storefrontAccessToken',
          'shopify.scope',
          'shopify.connectedAt',
          'shopify.lastSyncAt',
          'shopify.locationId',
          'shopify.oauthStateHash',
          'shopify.oauthStateShop',
          'shopify.oauthStateExpiresAt',
          'shopify.webhooksRegisteredAt',
          'shopify.webhookRegistrationError',
        ],
      },
    ],
    { new: true }
  );

  if (!store) {
    if (guardReplay && await Store.exists({ _id: storeId })) {
      return false;
    }
    throw new ShopifyOAuthError('Store not found', 404, 'store_not_found');
  }
  return true;
};

/**
 * Mark a store uninstalled from the Shopify `app/uninstalled` webhook.
 *
 * Shopify revokes the offline token before that webhook is sent, so this
 * does not call the revoke API. `disconnect` leaves the token in place when
 * revoke fails so a retry can still revoke it; that would keep a dead token
 * after uninstall. The local clear matches disconnect: `isConnected` is false
 * and the Admin token, Storefront token, and shop domain used for API calls
 * are removed. `shopify.complianceShop` keeps the domain so `shop/redact`
 * can still resolve this store.
 *
 * Pass `triggeredAt` from `X-Shopify-Triggered-At` so the clear is skipped
 * inside the same update when `shopify.connectedAt` is already newer.
 * Returns false when that guard leaves the current connection in place.
 */
export const markShopifyAppUninstalled = async (
  storeId: string,
  options?: { triggeredAt?: Date | null }
): Promise<boolean> => clearShopifyCredentials(storeId, options);

/**
 * Disconnects a Shopify store.
 *
 * When a shop domain and token are both stored, Shopify is asked to revoke the
 * token before the backend copy is cleared. A revoke failure leaves the token
 * in place so a retry can still revoke it. A token with no shop domain cannot
 * be revoked, so it is cleared locally and `shopifyRevoked` is false. Status
 * is `disconnected` only after the clear. The shop domain is copied to
 * `shopify.complianceShop` so a later compliance webhook can still resolve
 * this store. Catalog webhooks do not use that field.
 */
export const disconnect = async (storeId: string): Promise<{ shopifyRevoked: boolean }> => {
  const store = await Store.findById(storeId).select('+shopify.accessToken');

  if (!store) {
    throw new ShopifyOAuthError('Store not found', 404, 'store_not_found');
  }

  const shop = store.shopify?.shop;
  const storedToken = store.shopify?.accessToken;
  let shopifyRevoked = false;

  if (storedToken && shop) {
    let accessToken: string;
    try {
      accessToken = readStoredAdminToken(storedToken);
    } catch {
      console.error(`[Shopify Disconnect] Could not decrypt token for store ${storeId}`);
      throw new ShopifyOAuthError(
        'Failed to decrypt Shopify access token for revoke',
        502,
        'revoke_failed'
      );
    }

    await revokeShopifyAccessToken(shop, accessToken);
    shopifyRevoked = true;
  }

  await clearShopifyCredentials(storeId);
  return { shopifyRevoked };
};

/**
 * Checks if store is connected to Shopify
 */
export const isConnected = async (storeId: string): Promise<boolean> => {
  try {
    const store = await Store.findById(storeId).select('shopify.isConnected');
    return store?.shopify?.isConnected ?? false;
  } catch (error) {
    console.error('Is connected check error:', error);
    return false;
  }
};

/**
 * Fetches all collections from connected Shopify store
 */
export const getCollections = async (storeId: string): Promise<Collection[]> => {
  try {
    const store = await Store.findById(storeId).select('shopify');

    if (!store?.shopify?.isConnected) {
      throw new Error('Store not connected to Shopify');
    }

    const shop = store.shopify.shop;
    const accessToken = await getAccessToken(storeId);

    if (!shop || !accessToken) {
      throw new Error('Missing shop or access token');
    }

    const response = await fetch(
      `https://${shop}/admin/api/${shopifyApiVersion()}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query {
              collections(first: 100) {
                edges {
                  node {
                    id
                    title
                    handle
                    image {
                      src
                    }
                  }
                }
              }
            }
          `,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;

    if (data.errors) {
      throw new Error(`Shopify GraphQL error: ${data.errors[0]?.message}`);
    }

    const collections: Collection[] = data.data?.collections?.edges?.map(
      (edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        image: edge.node.image,
      })
    ) || [];

    return collections;
  } catch (error) {
    console.error('Get collections error:', error);
    throw new Error('Failed to fetch collections from Shopify');
  }
};

/**
 * Generates a one-time OAuth state token and stores only its hash on the store.
 * The raw state is returned to be placed on Shopify's authorize URL. It is not
 * an access token and must not be persisted by the dashboard.
 */
export const generateStateToken = async (shop: string, storeId: string): Promise<string> => {
  if (!storeId) {
    throw new ShopifyOAuthError('Store authentication required', 401, 'store_required');
  }

  const normalizedShop = normalizeShopDomain(shop);
  await assertShopAvailableForStore(normalizedShop, storeId);

  const state = crypto.randomBytes(32).toString('hex');
  const updated = await Store.findByIdAndUpdate(
    storeId,
    {
      $set: {
        'shopify.oauthStateHash': hashOAuthState(state),
        'shopify.oauthStateShop': normalizedShop,
        'shopify.oauthStateExpiresAt': new Date(Date.now() + STATE_TOKEN_EXPIRY_MS),
      },
    },
    { new: true }
  );

  if (!updated) {
    throw new ShopifyOAuthError('Store not found', 404, 'store_not_found');
  }

  return state;
};

/**
 * Validates a callback state token. The token is single-use: a matching,
 * unexpired hash is cleared before the shop and storeId are returned.
 */
export const validateStateToken = async (
  state: string
): Promise<{ shop: string; storeId: string } | null> => {
  if (!state || typeof state !== 'string') {
    return null;
  }

  const hash = hashOAuthState(state);
  const pending = await Store.findOne({
    'shopify.oauthStateHash': hash,
    'shopify.oauthStateExpiresAt': { $gt: new Date() },
  }).select(OAUTH_STATE_SELECT);

  if (!pending?.shopify?.oauthStateShop) {
    return null;
  }

  const consumed = await Store.updateOne(
    { _id: pending._id, 'shopify.oauthStateHash': hash },
    {
      $unset: {
        'shopify.oauthStateHash': '',
        'shopify.oauthStateShop': '',
        'shopify.oauthStateExpiresAt': '',
      },
    }
  );

  if (consumed.modifiedCount !== 1) {
    return null;
  }

  return {
    shop: pending.shopify.oauthStateShop,
    storeId: pending._id.toString(),
  };
};
