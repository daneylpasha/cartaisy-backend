import express from 'express';
import request from 'supertest';
import axios from 'axios';
import fetch from 'node-fetch';
import Store from '../src/models/Store';
import User from '../src/models/User';
import { generateToken } from '../src/utils/jwt';
import { decrypt, encrypt } from '../src/utils/encryption';
import { getAccessToken, getCollections } from '../src/services/shopifyOAuthService';
import { getShopifyClientForStore } from '../src/services/shopifyService';
import shopifyOAuthRoutes from '../src/routes/shopifyOAuthRoutes';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import {
  isEncryptedShopifyAdminToken,
  normalizeLegacyStorefrontAccessToken,
  readStoredShopifyAdminToken,
  ShopifyAdminTokenError,
  unsetLegacyStorefrontAccessTokenKeys,
} from '../src/utils/shopifyTokenStorage';

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const fetchMock = fetch as unknown as jest.Mock;

const PLAIN_TOKEN = 'shpat_legacy_plain_token';
const STOREFRONT_TOKEN = 'storefront_legacy_public_token';
const SHOP = 'legacy-token.myshopify.com';

const badEnvelope = (): string =>
  `${'ab'.repeat(16)}:${'cd'.repeat(20)}:${'ef'.repeat(16)}`;

const loggedText = (spies: jest.SpyInstance[]): string =>
  JSON.stringify(spies.map((spy) => spy.mock.calls));

describe('Shopify stored admin token formats', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  test('plaintext admin tokens pass through and encrypted envelopes decrypt', () => {
    expect(isEncryptedShopifyAdminToken(PLAIN_TOKEN)).toBe(false);
    expect(readStoredShopifyAdminToken(PLAIN_TOKEN)).toBe(PLAIN_TOKEN);
    expect(readStoredShopifyAdminToken(`  ${PLAIN_TOKEN}  `)).toBe(PLAIN_TOKEN);

    const envelope = encrypt(PLAIN_TOKEN);
    expect(isEncryptedShopifyAdminToken(envelope)).toBe(true);
    expect(readStoredShopifyAdminToken(envelope)).toBe(PLAIN_TOKEN);

    const notAnEnvelope = 'not-hex:still-plain:token';
    expect(isEncryptedShopifyAdminToken(notAnEnvelope)).toBe(false);
    expect(readStoredShopifyAdminToken(notAnEnvelope)).toBe(notAnEnvelope);
  });

  test('a broken envelope asks for reconnect and does not echo the stored value', () => {
    const stored = badEnvelope();
    expect(isEncryptedShopifyAdminToken(stored)).toBe(true);

    let thrown: unknown;
    try {
      readStoredShopifyAdminToken(stored);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ShopifyAdminTokenError);
    const message = thrown instanceof Error ? thrown.message : '';
    expect(message).toContain('Reconnect the store');
    expect(message).not.toContain(stored);
    expect(message).not.toContain(PLAIN_TOKEN);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(stored);
  });

  test('getAccessToken reads plaintext, then rewrites it as an envelope', async () => {
    const store = await Store.create({
      name: 'Legacy Token Store',
      slug: 'legacy-token-store',
      shopify: {
        shop: SHOP,
        accessToken: ` ${PLAIN_TOKEN} `,
        isConnected: true,
      },
    });

    await expect(getAccessToken(store._id.toString())).resolves.toBe(PLAIN_TOKEN);

    const stored = await Store.findById(store._id).select('+shopify.accessToken');
    const persisted = stored?.shopify?.accessToken as string;
    expect(persisted).not.toBe(PLAIN_TOKEN);
    expect(persisted).not.toContain(PLAIN_TOKEN);
    expect(isEncryptedShopifyAdminToken(persisted)).toBe(true);
    expect(decrypt(persisted)).toBe(PLAIN_TOKEN);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(PLAIN_TOKEN);

    const beforeSecondRead = persisted;
    await expect(getAccessToken(store._id.toString())).resolves.toBe(PLAIN_TOKEN);
    const again = await Store.findById(store._id).select('+shopify.accessToken');
    expect(again?.shopify?.accessToken).toBe(beforeSecondRead);
  });

  test('plaintext migration does not rewrite another store token', async () => {
    const otherToken = 'shpat_other_store_plain_token';
    const [storeA, storeB] = await Promise.all([
      Store.create({
        name: 'Migrate Store A',
        slug: 'migrate-store-a',
        shopify: { shop: 'migrate-a.myshopify.com', accessToken: PLAIN_TOKEN, isConnected: true },
      }),
      Store.create({
        name: 'Migrate Store B',
        slug: 'migrate-store-b',
        shopify: { shop: 'migrate-b.myshopify.com', accessToken: otherToken, isConnected: true },
      }),
    ]);

    await expect(getAccessToken(storeA._id.toString())).resolves.toBe(PLAIN_TOKEN);

    const untouched = await Store.findById(storeB._id).select('+shopify.accessToken');
    expect(untouched?.shopify?.accessToken).toBe(otherToken);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(PLAIN_TOKEN);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(otherToken);
  });

  test('getAccessToken reads an encrypted token without rewriting it', async () => {
    const envelope = encrypt(PLAIN_TOKEN);
    const store = await Store.create({
      name: 'Encrypted Token Store',
      slug: 'encrypted-token-store',
      shopify: {
        shop: SHOP,
        accessToken: envelope,
        isConnected: true,
      },
    });

    await expect(getAccessToken(store._id.toString())).resolves.toBe(PLAIN_TOKEN);
    const stored = await Store.findById(store._id).select('+shopify.accessToken');
    expect(stored?.shopify?.accessToken).toBe(envelope);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(PLAIN_TOKEN);
  });

  test('getShopifyClientForStore uses a plaintext token and does not send ciphertext', async () => {
    const store = await Store.create({
      name: 'Client Token Store',
      slug: 'client-token-store',
      shopify: {
        shop: SHOP,
        accessToken: PLAIN_TOKEN,
        isConnected: true,
      },
    });
    const createSpy = jest.spyOn(axios, 'create');

    const client = await getShopifyClientForStore(store._id.toString());

    expect(client).not.toBeNull();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Shopify-Access-Token': PLAIN_TOKEN }),
      })
    );
    const headerValues = JSON.stringify(createSpy.mock.calls);
    expect(headerValues).toContain(PLAIN_TOKEN);
    expect(headerValues).not.toMatch(/[0-9a-f]{32}:[0-9a-f]+:[0-9a-f]{32}/i);

    const stored = await Store.findById(store._id).select('+shopify.accessToken');
    expect(decrypt(stored?.shopify?.accessToken as string)).toBe(PLAIN_TOKEN);
    createSpy.mockRestore();
  });

  test('getShopifyClientForStore refuses an unreadable envelope', async () => {
    const stored = badEnvelope();
    const store = await Store.create({
      name: 'Unreadable Token Store',
      slug: 'unreadable-token-store',
      shopify: {
        shop: SHOP,
        accessToken: stored,
        isConnected: true,
      },
    });
    const createSpy = jest.spyOn(axios, 'create');

    await expect(getShopifyClientForStore(store._id.toString())).rejects.toBeInstanceOf(
      ShopifyAdminTokenError
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(stored);

    const stillStored = await Store.findById(store._id).select('+shopify.accessToken');
    expect(stillStored?.shopify?.accessToken).toBe(stored);
    createSpy.mockRestore();
  });

  test('collections accepts a legacy plaintext token and rejects an unreadable one', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/shopify', shopifyOAuthRoutes);

    const plainStore = await Store.create({
      name: 'Collections Plain Store',
      slug: 'collections-plain-store',
      shopify: { shop: SHOP, accessToken: PLAIN_TOKEN, isConnected: true },
    });
    const brokenStore = await Store.create({
      name: 'Collections Broken Store',
      slug: 'collections-broken-store',
      shopify: { shop: SHOP, accessToken: badEnvelope(), isConnected: true },
    });
    const [plainAdmin, brokenAdmin] = await Promise.all([
      User.create({
        name: 'Plain Admin',
        email: 'plain-admin@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: plainStore._id,
      }),
      User.create({
        name: 'Broken Admin',
        email: 'broken-admin@example.com',
        password: 'password123',
        role: 'admin',
        isActive: true,
        storeId: brokenStore._id,
      }),
    ]);

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        data: {
          collections: {
            edges: [
              { node: { id: 'gid://shopify/Collection/1', title: 'Summer', handle: 'summer', image: null } },
            ],
          },
        },
      }),
      text: async () => '',
    });

    const ok = await request(app)
      .get('/api/v1/shopify/collections')
      .set('Authorization', `Bearer ${generateToken(plainAdmin._id.toString())}`);

    expect(ok.status).toBe(200);
    expect(ok.body.data.count).toBe(1);
    expect(JSON.stringify(ok.body)).not.toContain(PLAIN_TOKEN);
    const fetchHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(fetchHeaders['X-Shopify-Access-Token']).toBe(PLAIN_TOKEN);

    const denied = await request(app)
      .get('/api/v1/shopify/collections')
      .set('Authorization', `Bearer ${generateToken(brokenAdmin._id.toString())}`);

    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('shopify_reconnect_required');
    expect(denied.body.error).toContain('Reconnect the store');
    expect(JSON.stringify(denied.body)).not.toContain(badEnvelope());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(PLAIN_TOKEN);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(badEnvelope());
  });

  test('getCollections surfaces an unreadable token instead of a generic failure', async () => {
    const store = await Store.create({
      name: 'Service Broken Store',
      slug: 'service-broken-store',
      shopify: { shop: SHOP, accessToken: badEnvelope(), isConnected: true },
    });

    await expect(getCollections(store._id.toString())).rejects.toBeInstanceOf(ShopifyAdminTokenError);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(badEnvelope());
  });

  test('a trailing-space storefront token key is used and moved to the schema field', async () => {
    const store = await Store.create({
      name: 'Storefront Key Store',
      slug: 'storefront-key-store',
      shopify: { shop: SHOP, isConnected: true, accessToken: PLAIN_TOKEN },
    });
    await Store.collection.updateOne(
      { _id: store._id },
      { $set: { 'shopify.storefrontAccessToken ': STOREFRONT_TOKEN } }
    );

    const createSpy = jest.spyOn(axios, 'create');
    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client.isConfigured).toBe(true);
    expect(client.shopDomain).toBe(SHOP);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Shopify-Storefront-Access-Token': STOREFRONT_TOKEN,
        }),
      })
    );

    const raw = await Store.collection.findOne({ _id: store._id });
    const shopify = raw?.shopify as Record<string, unknown>;
    expect(shopify.storefrontAccessToken).toBe(STOREFRONT_TOKEN);
    expect(Object.keys(shopify).some((key) => key !== 'storefrontAccessToken' && key.trim() === 'storefrontAccessToken')).toBe(false);
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(STOREFRONT_TOKEN);
    createSpy.mockRestore();
  });

  test('credential cleanup removes a trailing-space storefront token key', async () => {
    const store = await Store.create({
      name: 'Cleanup Key Store',
      slug: 'cleanup-key-store',
      shopify: { shop: SHOP, isConnected: true },
    });
    await Store.collection.updateOne(
      { _id: store._id },
      { $set: { 'shopify.storefrontAccessToken ': STOREFRONT_TOKEN } }
    );

    await unsetLegacyStorefrontAccessTokenKeys(store._id);

    const raw = await Store.collection.findOne({ _id: store._id });
    const shopify = (raw?.shopify || {}) as Record<string, unknown>;
    expect(shopify['storefrontAccessToken ']).toBeUndefined();
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(STOREFRONT_TOKEN);
  });

  test('storefront repair stays on the connected store and does not restore a disconnected one', async () => {
    const [connected, other, disconnected] = await Promise.all([
      Store.create({
        name: 'Storefront Connected',
        slug: 'storefront-connected',
        shopify: { shop: 'sf-connected.myshopify.com', isConnected: true },
      }),
      Store.create({
        name: 'Storefront Other',
        slug: 'storefront-other',
        shopify: { shop: 'sf-other.myshopify.com', isConnected: true },
      }),
      Store.create({
        name: 'Storefront Disconnected',
        slug: 'storefront-disconnected',
        shopify: { shop: 'sf-disconnected.myshopify.com', isConnected: false },
      }),
    ]);

    await Store.collection.updateOne(
      { _id: connected._id },
      { $set: { 'shopify.storefrontAccessToken ': STOREFRONT_TOKEN } }
    );
    await Store.collection.updateOne(
      { _id: disconnected._id },
      { $set: { 'shopify.storefrontAccessToken ': STOREFRONT_TOKEN } }
    );

    await normalizeLegacyStorefrontAccessToken(
      connected._id.toString(),
      {}
    );
    await normalizeLegacyStorefrontAccessToken(
      disconnected._id.toString(),
      {}
    );

    const connectedRaw = await Store.collection.findOne({ _id: connected._id });
    const otherRaw = await Store.collection.findOne({ _id: other._id });
    const disconnectedRaw = await Store.collection.findOne({ _id: disconnected._id });
    const connectedShopify = connectedRaw?.shopify as Record<string, unknown>;
    const otherShopify = (otherRaw?.shopify || {}) as Record<string, unknown>;
    const disconnectedShopify = (disconnectedRaw?.shopify || {}) as Record<string, unknown>;

    expect(connectedShopify.storefrontAccessToken).toBe(STOREFRONT_TOKEN);
    expect(connectedShopify['storefrontAccessToken ']).toBeUndefined();
    expect(otherShopify.storefrontAccessToken).toBeUndefined();
    expect(otherShopify['storefrontAccessToken ']).toBeUndefined();
    expect(disconnectedShopify.storefrontAccessToken).toBeUndefined();
    expect(disconnectedShopify['storefrontAccessToken ']).toBeUndefined();
    expect(loggedText([errorSpy, warnSpy, logSpy])).not.toContain(STOREFRONT_TOKEN);
  });
});
