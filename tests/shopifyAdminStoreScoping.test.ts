import axios from 'axios';
import Store from '../src/models/Store';
import Product from '../src/models/Product';
import {
  getShopifyClientForStore,
  syncProducts,
  syncCustomers,
  syncOrders,
  getInventoryLevels,
  adjustInventory,
  reduceShopifyInventoryForOrder,
  updateInventory,
  createOrder,
  updateOrderStatus,
  testShopifyConnection,
} from '../src/services/shopifyService';
import { performFullSync, performIncrementalSync } from '../src/services/syncService';
import { updateInventoryLevels } from '../src/services/inventoryService';
import { encrypt } from '../src/utils/encryption';

// 32+ char key required by utils/encryption (read at call time)
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-0123456789abcdef';

const SHOP_A = 'scoped-store-a.myshopify.com';
const SHOP_B = 'scoped-store-b.myshopify.com';
const TOKEN_A = 'shpat_token_store_a';
const TOKEN_B = 'shpat_token_store_b';

const orderPayload = {
  email: 'buyer@example.com',
  lineItems: [] as any[],
  shippingAddress: {} as any,
  billingAddress: {} as any,
};

describe('Store-scoped Shopify Admin helpers', () => {
  describe('fail closed without a storeId', () => {
    test('sync helpers return an error result', async () => {
      await expect(syncProducts(undefined as any)).resolves.toEqual({
        synced: 0,
        errors: ['Missing storeId for product sync'],
      });
      await expect(syncCustomers(undefined as any)).resolves.toEqual({
        synced: 0,
        errors: ['Missing storeId for customer sync'],
      });
      await expect(syncOrders(30, undefined)).resolves.toEqual({
        synced: 0,
        errors: ['Missing storeId for order sync'],
      });
    });

    test('inventory and order helpers reject or refuse', async () => {
      await expect(getInventoryLevels('123', undefined as any)).rejects.toThrow(/storeId/);
      await expect(updateInventory('item-1', 5, undefined as any)).rejects.toThrow(/storeId/);
      await expect(createOrder(orderPayload, undefined as any)).rejects.toThrow(/storeId/);
      await expect(updateOrderStatus('1', 'fulfilled', undefined as any)).rejects.toThrow(/storeId/);
      await expect(adjustInventory('item-1', -1, undefined as any)).resolves.toBe(false);
      await expect(
        reduceShopifyInventoryForOrder([{ inventoryItemId: 'item-1', quantity: 1 }], undefined as any)
      ).resolves.toEqual({ success: false, errors: ['Missing storeId for inventory reduction'] });
      await expect(testShopifyConnection(undefined as any)).resolves.toBe(false);
    });

    test('sync orchestration rejects', async () => {
      await expect(performFullSync(undefined as any)).rejects.toThrow(/requires a storeId/);
      await expect(performIncrementalSync(undefined as any)).rejects.toThrow(/requires a storeId/);
    });
  });

  describe('store-scoped Admin client resolution', () => {
    let storeAId: string;
    let storeBId: string;

    beforeEach(async () => {
      const [storeA, storeB] = await Promise.all([
        Store.create({
          name: 'Scoped Store A',
          slug: 'scoped-store-a',
          shopify: { shop: SHOP_A, accessToken: TOKEN_A, isConnected: true },
        }),
        Store.create({
          name: 'Scoped Store B',
          slug: 'scoped-store-b',
          shopify: { shop: SHOP_B, accessToken: TOKEN_B, isConnected: true },
        }),
      ]);
      storeAId = storeA._id.toString();
      storeBId = storeB._id.toString();
    });

    afterEach(async () => {
      await Promise.all([Store.deleteMany({}), Product.deleteMany({})]);
      jest.restoreAllMocks();
    });

    test('getShopifyClientForStore uses the requested store shop and token', async () => {
      const createSpy = jest.spyOn(axios, 'create');

      const client = await getShopifyClientForStore(storeBId);

      expect(client).not.toBeNull();
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: `https://${SHOP_B}/admin/api/2024-01`,
          headers: expect.objectContaining({ 'X-Shopify-Access-Token': TOKEN_B }),
        })
      );
    });

    test('getShopifyClientForStore decrypts encrypted Admin tokens', async () => {
      const plainToken = 'shpat_decrypted_secret';
      await Store.create({
        name: 'Encrypted Store',
        slug: 'encrypted-store',
        shopify: {
          shop: 'encrypted-store.myshopify.com',
          accessToken: encrypt(plainToken),
          isConnected: true,
        },
      });
      const encryptedStore = await Store.findOne({ slug: 'encrypted-store' });

      const createSpy = jest.spyOn(axios, 'create');
      const client = await getShopifyClientForStore(encryptedStore!._id.toString());

      expect(client).not.toBeNull();
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Shopify-Access-Token': plainToken }),
        })
      );
    });

    test('syncCustomers talks to the requested store, not the first connected one', async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({ data: { customers: [] }, headers: {} }),
      };
      const createSpy = jest.spyOn(axios, 'create').mockReturnValue(mockClient as any);

      const result = await syncCustomers(storeBId);

      expect(result).toEqual({ synced: 0, errors: [] });
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: `https://${SHOP_B}/admin/api/2024-01`,
          headers: expect.objectContaining({ 'X-Shopify-Access-Token': TOKEN_B }),
        })
      );
    });

    test('updateInventoryLevels rejects a product owned by a different store', async () => {
      const product = await Product.create({
        storeId: storeAId,
        shopifyProductId: '888001',
        title: 'Scoping Test Product',
        description: 'Product used for admin scoping tests',
        handle: 'scoping-test-product',
        status: 'active',
        price: 10,
        images: [{ url: 'https://example.com/scope.jpg', alt: 'Test', position: 1 }],
        mobileDisplay: {
          thumbnailUrl: 'https://example.com/scope-thumb.jpg',
          shortDescription: 'Scoping test product',
        },
        seo: { title: 'Scoping Test Product', slug: 'scoping-test-product' },
        inventoryTracking: { totalQuantity: 1, tracked: true, lowStockThreshold: 1, history: [] },
        variants: [
          {
            id: '801',
            title: 'Default',
            price: 10,
            inventory: { quantity: 1, tracked: true, policy: 'deny' },
            options: { option1: 'Default' },
          },
        ],
      });

      // Requesting store B's context for store A's product must fail closed
      // before any Shopify client is created
      const createSpy = jest.spyOn(axios, 'create');
      await expect(
        updateInventoryLevels(product._id.toString(), storeBId)
      ).rejects.toThrow();
      expect(createSpy).not.toHaveBeenCalled();
    });
  });
});
