import crypto from 'crypto';
import fetch from 'node-fetch';
import Store from '../models/Store';
import { encrypt, decrypt } from '../utils/encryption';

/**
 * Shopify OAuth Service
 * Handles OAuth flow and credential management for Shopify store connections
 */

const SHOPIFY_API_VERSION = '2024-01';
const STATE_TOKEN_EXPIRY = 10 * 60 * 1000; // 10 minutes in milliseconds

// In-memory storage for state tokens (consider Redis in production)
const stateTokens = new Map<string, { createdAt: number; shop: string; storeId?: string }>();

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
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const scopes = process.env.SHOPIFY_SCOPES || '';
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI || '';

  if (!clientId || !scopes || !redirectUri) {
    throw new Error('Shopify OAuth environment variables not configured');
  }

  // Validate shop format
  if (!shop.includes('.')) {
    throw new Error('Invalid shop format. Expected format: shop-name.myshopify.com');
  }

  const baseUrl = `https://${shop}/admin/oauth/authorize`;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: state,
  });

  return `${baseUrl}?${params.toString()}`;
};

/**
 * Exchanges authorization code for access token
 */
export const exchangeCodeForToken = async (
  shop: string,
  code: string
): Promise<TokenResponse> => {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Shopify OAuth credentials not configured');
  }

  // Validate shop format
  if (!shop.includes('.')) {
    throw new Error('Invalid shop format');
  }

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify token exchange failed:', response.status, errorText);
      throw new Error(`Shopify API error: ${response.statusText}`);
    }

    // Shopify returns snake_case: { access_token, scope }
    const data = (await response.json()) as { access_token: string; scope: string };

    if (!data.access_token || !data.scope) {
      console.error('Invalid token response:', data);
      throw new Error('Invalid token response from Shopify');
    }

    // Convert to camelCase for internal use
    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  } catch (error) {
    console.error('Token exchange error:', error);
    throw new Error('Failed to exchange code for access token');
  }
};

/**
 * Retrieves shop information from Shopify API
 */
export const getShopInfo = async (
  shop: string,
  accessToken: string
): Promise<ShopInfo> => {
  if (!shop.includes('.')) {
    throw new Error('Invalid shop format');
  }

  try {
    const response = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
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
      shop: shop,
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
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/locations.json`,
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
  try {
    // Encrypt the access token before saving
    const encryptedToken = encrypt(accessToken);

    // Fetch primary location ID for inventory management
    const locationId = await getPrimaryLocationId(shop, accessToken);

    const updateData: any = {
      'shopify.shop': shop,
      'shopify.accessToken': encryptedToken,
      'shopify.scope': scope,
      'shopify.isConnected': true,
      'shopify.connectedAt': new Date(),
      'shopify.lastSyncAt': new Date(),
    };

    // Add locationId if found
    if (locationId) {
      updateData['shopify.locationId'] = locationId;
      console.log(`✅ [Shopify Connect] Store connected with locationId: ${locationId}`);
    } else {
      console.warn(`⚠️ [Shopify Connect] Store connected but locationId could not be fetched!`);
      console.warn(`⚠️ [Shopify Connect] Inventory sync will NOT work until locationId is set.`);
      console.warn(`⚠️ [Shopify Connect] Use POST /api/v1/admin/shopify/fetch-location to retry.`);
    }

    const store = await Store.findByIdAndUpdate(
      storeId,
      updateData,
      { new: true }
    );

    if (!store) {
      throw new Error('Store not found');
    }
  } catch (error) {
    console.error('Save credentials error:', error);
    throw new Error('Failed to save Shopify credentials');
  }
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

/**
 * Disconnects Shopify store by clearing credentials
 */
export const disconnect = async (storeId: string): Promise<void> => {
  try {
    const store = await Store.findByIdAndUpdate(
      storeId,
      {
        'shopify.shop': undefined,
        'shopify.accessToken': undefined,
        'shopify.scope': undefined,
        'shopify.isConnected': false,
        'shopify.connectedAt': undefined,
        'shopify.lastSyncAt': undefined,
      },
      { new: true }
    );

    if (!store) {
      throw new Error('Store not found');
    }
  } catch (error) {
    console.error('Disconnect error:', error);
    throw new Error('Failed to disconnect Shopify store');
  }
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
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
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
 * Generates and stores a state token for CSRF protection
 */
export const generateStateToken = (shop: string, storeId?: string): string => {
  const state = crypto.randomBytes(32).toString('hex');

  // Store state token with expiry
  stateTokens.set(state, {
    createdAt: Date.now(),
    shop: shop,
    storeId: storeId,
  });

  // Clean up expired tokens
  cleanupExpiredTokens();

  return state;
};

/**
 * Validates state token and returns shop and storeId if valid
 */
export const validateStateToken = (state: string): { shop: string; storeId?: string } | null => {
  const tokenData = stateTokens.get(state);

  if (!tokenData) {
    return null;
  }

  // Check if token has expired
  if (Date.now() - tokenData.createdAt > STATE_TOKEN_EXPIRY) {
    stateTokens.delete(state);
    return null;
  }

  // Token is valid, delete it (one-time use)
  stateTokens.delete(state);

  return { shop: tokenData.shop, storeId: tokenData.storeId };
};

/**
 * Cleans up expired state tokens
 */
const cleanupExpiredTokens = (): void => {
  const now = Date.now();

  for (const [state, data] of stateTokens.entries()) {
    if (now - data.createdAt > STATE_TOKEN_EXPIRY) {
      stateTokens.delete(state);
    }
  }
};
