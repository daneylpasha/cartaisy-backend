import mongoose from 'mongoose';
import Store from '../models/Store';
import { decrypt, encrypt } from './encryption';

/**
 * Stored Shopify Admin tokens are AES-256-GCM envelopes (`iv:ciphertext:authTag`)
 * for new connections. Older store documents still hold the raw Admin token.
 * Readers accept both. They never log token material.
 */

export const SHOPIFY_ADMIN_TOKEN_UNREADABLE =
  'Shopify access token could not be read. Reconnect the store to restore catalog sync.';

export const SHOPIFY_ADMIN_TOKEN_UNREADABLE_CODE = 'shopify_reconnect_required';

const STOREFRONT_TOKEN_FIELD = 'storefrontAccessToken';

const HEX = /^[0-9a-f]+$/i;

export class ShopifyAdminTokenError extends Error {
  readonly statusCode = 409;
  readonly code = SHOPIFY_ADMIN_TOKEN_UNREADABLE_CODE;

  constructor(message: string = SHOPIFY_ADMIN_TOKEN_UNREADABLE) {
    super(message);
    this.name = 'ShopifyAdminTokenError';
  }
}

/**
 * True only for the envelope written by `encrypt()`.
 * A raw Shopify Admin token does not match this shape.
 */
export const isEncryptedShopifyAdminToken = (value: string): boolean => {
  const parts = value.split(':');
  if (parts.length !== 3) {
    return false;
  }

  const [iv, ciphertext, tag] = parts;
  return (
    iv.length === 32 &&
    tag.length === 32 &&
    ciphertext.length > 0 &&
    ciphertext.length % 2 === 0 &&
    HEX.test(iv) &&
    HEX.test(ciphertext) &&
    HEX.test(tag)
  );
};

/**
 * Return the Admin token to send to Shopify.
 * Legacy plaintext is returned unchanged. A matching envelope is decrypted.
 * A matching envelope that cannot be decrypted throws `ShopifyAdminTokenError`
 * so callers do not send ciphertext to Shopify.
 */
export const readStoredShopifyAdminToken = (stored: string): string => {
  if (typeof stored !== 'string') {
    throw new ShopifyAdminTokenError();
  }

  const value = stored.trim();
  if (!value) {
    throw new ShopifyAdminTokenError();
  }

  if (!isEncryptedShopifyAdminToken(value)) {
    return value;
  }

  try {
    return decrypt(value);
  } catch {
    throw new ShopifyAdminTokenError();
  }
};

/**
 * Rewrite a legacy plaintext Admin token to the encrypted envelope.
 * The update matches the exact stored string so a newer write is left alone.
 * Failures are logged without the token and do not fail the read.
 */
export const migratePlaintextShopifyAdminToken = async (
  storeId: string,
  stored: string
): Promise<void> => {
  if (typeof stored !== 'string') {
    return;
  }

  const plaintext = stored.trim();
  if (!plaintext || isEncryptedShopifyAdminToken(plaintext)) {
    return;
  }

  let encrypted: string;
  try {
    encrypted = encrypt(plaintext);
  } catch {
    console.error(`Shopify admin token migration skipped for store ${storeId}`);
    return;
  }

  try {
    await Store.updateOne(
      { _id: storeId, 'shopify.accessToken': stored },
      { $set: { 'shopify.accessToken': encrypted } }
    );
  } catch {
    console.error(`Shopify admin token migration failed for store ${storeId}`);
  }
};

const legacyStorefrontTokenKeys = (shopify: Record<string, unknown>): string[] =>
  Object.keys(shopify).filter(
    (key) => key !== STOREFRONT_TOKEN_FIELD && key.trim() === STOREFRONT_TOKEN_FIELD
  );

const storefrontTokenFrom = (
  shopify: Record<string, unknown> | null | undefined
): { canonical: string; legacyKeys: string[]; legacyToken: string } => {
  if (!shopify || typeof shopify !== 'object') {
    return { canonical: '', legacyKeys: [], legacyToken: '' };
  }

  const canonicalRaw = shopify[STOREFRONT_TOKEN_FIELD];
  const canonical = typeof canonicalRaw === 'string' ? canonicalRaw.trim() : '';
  const legacyKeys = legacyStorefrontTokenKeys(shopify);

  let legacyToken = '';
  for (const key of legacyKeys) {
    const value = shopify[key];
    if (!legacyToken && typeof value === 'string' && value.trim()) {
      legacyToken = value.trim();
    }
  }

  return { canonical, legacyKeys, legacyToken };
};

const persistStorefrontTokenField = async (
  storeId: string,
  canonical: string,
  legacyKeys: string[],
  legacyToken: string
): Promise<void> => {
  if (legacyKeys.length === 0 || !mongoose.Types.ObjectId.isValid(storeId)) {
    return;
  }

  const $unset: Record<string, ''> = {};
  for (const key of legacyKeys) {
    $unset[`shopify.${key}`] = '';
  }

  const storeObjectId = new mongoose.Types.ObjectId(storeId);

  try {
    // Fill the canonical field only while this store is still connected and
    // the field is empty. A disconnect or a newer provisioning write that
    // lands first must not be overwritten by this read.
    if (!canonical && legacyToken) {
      await Store.collection.updateOne(
        {
          _id: storeObjectId,
          'shopify.isConnected': true,
          $or: [
            { 'shopify.storefrontAccessToken': { $exists: false } },
            { 'shopify.storefrontAccessToken': null },
            { 'shopify.storefrontAccessToken': '' },
          ],
        },
        { $set: { [`shopify.${STOREFRONT_TOKEN_FIELD}`]: legacyToken } }
      );
    }

    await Store.collection.updateOne(
      { _id: storeObjectId },
      { $unset }
    );
  } catch {
    console.error(`Storefront token field migration failed for store ${storeId}`);
  }
};

/**
 * Read `shopify.storefrontAccessToken`, including a legacy key that is the
 * same name with surrounding whitespace (seen in production as a trailing space).
 * When that legacy key is present, copy a missing canonical value and remove
 * the bad key. Schema casts can hide the bad key, so a missing token is
 * confirmed against the raw document. The token is not logged.
 */
export const normalizeLegacyStorefrontAccessToken = async (
  storeId: string,
  shopify: Record<string, unknown> | null | undefined
): Promise<string | null> => {
  let resolved = storefrontTokenFrom(shopify);

  if (!resolved.canonical && resolved.legacyKeys.length === 0 && mongoose.Types.ObjectId.isValid(storeId)) {
    try {
      const raw = await Store.collection.findOne(
        { _id: new mongoose.Types.ObjectId(storeId) },
        { projection: { 'shopify.accessToken': 0 } }
      );
      resolved = storefrontTokenFrom(raw?.shopify as Record<string, unknown> | undefined);
    } catch {
      console.error(`Storefront token field lookup failed for store ${storeId}`);
    }
  }

  await persistStorefrontTokenField(
    storeId,
    resolved.canonical,
    resolved.legacyKeys,
    resolved.legacyToken
  );

  return resolved.canonical || resolved.legacyToken || null;
};

/**
 * Remove leftover storefront token keys whose names only differ by whitespace.
 * Used when credentials are cleared so a bad key cannot keep a token behind.
 */
export const unsetLegacyStorefrontAccessTokenKeys = async (
  storeId: unknown
): Promise<void> => {
  if (!storeId) {
    return;
  }

  try {
    const raw = await Store.collection.findOne(
      { _id: storeId as mongoose.Types.ObjectId },
      { projection: { 'shopify.accessToken': 0 } }
    );
    const shopify = raw?.shopify as Record<string, unknown> | undefined;
    if (!shopify) {
      return;
    }

    const legacyKeys = legacyStorefrontTokenKeys(shopify);
    if (legacyKeys.length === 0) {
      return;
    }

    const $unset: Record<string, ''> = {};
    for (const key of legacyKeys) {
      $unset[`shopify.${key}`] = '';
    }
    await Store.collection.updateOne({ _id: storeId as mongoose.Types.ObjectId }, { $unset });
  } catch {
    console.error('Storefront token field cleanup failed');
  }
};
