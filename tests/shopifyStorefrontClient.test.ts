import axios from 'axios';
import mongoose from 'mongoose';
import Store from '../src/models/Store';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { ApiError } from '../src/utils/errors';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const postMock = jest.fn();

const createStore = (overrides: Record<string, unknown> = {}) => {
  const shopify = {
    shop: 'tenant-shop.myshopify.com',
    storefrontAccessToken: 'tenant-storefront-token',
    scope: 'read_products',
    isConnected: true,
    ...(overrides.shopify as Record<string, unknown> | undefined),
  };

  return Store.create({
    name: `Tenant Store ${new mongoose.Types.ObjectId().toString()}`,
    slug: `tenant-store-${new mongoose.Types.ObjectId().toString()}`,
    isActive: true,
    ...overrides,
    shopify,
  });
};

describe('ShopifyStorefrontService tenant-scoped client contract', () => {
  const originalStorefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSaasMode = process.env.SAAS_MODE;
  const originalMultiTenantMode = process.env.MULTI_TENANT_MODE;

  beforeEach(() => {
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = originalStorefrontToken;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SAAS_MODE = originalSaasMode;
    process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
    mockedAxios.create.mockReset();
    postMock.mockReset();
    postMock.mockResolvedValue({ data: { data: { ok: true } } });
    mockedAxios.create.mockReturnValue({ post: postMock } as any);
  });

  afterAll(() => {
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = originalStorefrontToken;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.SAAS_MODE = originalSaasMode;
    process.env.MULTI_TENANT_MODE = originalMultiTenantMode;
  });

  it('returns a tenant-scoped Storefront client for an active store with credentials', async () => {
    const store = await createStore();

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: true,
      shopDomain: 'tenant-shop.myshopify.com',
    });
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://tenant-shop.myshopify.com/api/2025-01/graphql.json',
      headers: expect.objectContaining({
        'X-Shopify-Storefront-Access-Token': 'tenant-storefront-token',
      }),
    }));

    await expect(client.query<{ ok: boolean }>('query TestStorefrontClient')).resolves.toEqual({
      data: { ok: true },
    });
    expect(postMock).toHaveBeenCalledWith('', {
      query: 'query TestStorefrontClient',
      variables: {},
    });
  });

  it('fails clearly when storeId is missing', async () => {
    const client = await shopifyStorefront.getStorefrontClientForStore('');

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'storeId is required',
      statusCode: 400,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('storeId is required');
  });

  it('fails clearly when storeId is malformed', async () => {
    const client = await shopifyStorefront.getStorefrontClientForStore('not-an-object-id');

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'storeId must be a valid ObjectId',
      statusCode: 400,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('storeId must be a valid ObjectId');
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails clearly when the store does not exist', async () => {
    const missingStoreId = new mongoose.Types.ObjectId().toString();

    const client = await shopifyStorefront.getStorefrontClientForStore(missingStoreId);

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store not found',
      statusCode: 404,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('Store not found');
  });

  it('fails clearly when the store is inactive', async () => {
    const store = await createStore({ isActive: false });

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store is not active',
      statusCode: 403,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('Store is not active');
  });

  it('fails clearly when Shopify shop domain is missing', async () => {
    const store = await createStore({
      shopify: {
        shop: '',
        storefrontAccessToken: 'tenant-storefront-token',
        scope: 'read_products',
        isConnected: true,
      },
    });

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store missing Shopify shop domain',
      statusCode: 400,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('Store missing Shopify shop domain');
  });

  it('fails clearly when Shopify is disconnected', async () => {
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: 'tenant-storefront-token',
        scope: 'read_products',
        isConnected: false,
      },
    });

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store not connected to Shopify',
      statusCode: 400,
      expose: true,
    });
    await expect(client.query('query Test')).rejects.toThrow('Store not connected to Shopify');
  });

  it('fails clearly when Storefront token is missing', async () => {
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'global-storefront-token';
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '',
        scope: 'read_products',
        isConnected: true,
      },
    });

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store missing Storefront API access token. Please configure storefrontAccessToken.',
      statusCode: 400,
    });
    expect(client.expose).toBeUndefined();
    await expect(client.query('query Test')).rejects.toThrow(
      'Store missing Storefront API access token. Please configure storefrontAccessToken.'
    );
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('does not use global Storefront credentials when the store token is blank', async () => {
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'global-storefront-token';
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '   ',
        scope: 'read_products',
        isConnected: true,
      },
    });

    const client = await shopifyStorefront.getStorefrontClientForStore(store._id.toString());

    expect(client).toMatchObject({
      isConfigured: false,
      shopDomain: '',
      error: 'Store missing Storefront API access token. Please configure storefrontAccessToken.',
      statusCode: 400,
    });
    expect(client.expose).toBeUndefined();
    await expect(client.query('query Test')).rejects.toThrow(
      'Store missing Storefront API access token. Please configure storefrontAccessToken.'
    );
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('blocks legacy global Storefront reads in production mode', async () => {
    process.env.NODE_ENV = 'production';

    const blockedReads = [
      shopifyStorefront.getProducts(),
      shopifyStorefront.getProductById('123'),
      shopifyStorefront.getCollections(),
      shopifyStorefront.getCollectionById('123'),
      shopifyStorefront.getCollectionProducts('123'),
      shopifyStorefront.predictiveSearch('shirt'),
      shopifyStorefront.searchProducts('shirt'),
    ];

    await Promise.all(blockedReads.map((promise) => expect(promise).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Storefront store context is required for this request',
      statusCode: 400,
      expose: true,
    })));
    expect(postMock).not.toHaveBeenCalled();
  });

  it('blocks legacy global Storefront reads when SaaS mode is enabled outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.SAAS_MODE = 'true';

    await expect(shopifyStorefront.getProducts()).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Storefront store context is required for this request',
      statusCode: 400,
      expose: true,
    });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('fetches collection products with the tenant-scoped Storefront client', async () => {
    const store = await createStore();
    const shopifyResponse = {
      data: {
        collection: {
          id: 'gid://shopify/Collection/123',
          title: 'Featured',
          products: {
            edges: [],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              endCursor: null,
              startCursor: null,
            },
          },
        },
      },
    };
    postMock.mockResolvedValueOnce({ data: shopifyResponse });

    const response = await shopifyStorefront.getCollectionProductsForStore(
      store._id.toString(),
      '123',
      {
        limit: 12,
        sortKey: 'BEST_SELLING',
        reverse: true,
        filters: [{ available: true }],
        countryCode: 'US',
      }
    );

    expect(response).toEqual(shopifyResponse);
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://tenant-shop.myshopify.com/api/2025-01/graphql.json',
      headers: expect.objectContaining({
        'X-Shopify-Storefront-Access-Token': 'tenant-storefront-token',
      }),
    }));
    expect(postMock).toHaveBeenCalledWith('', expect.objectContaining({
      variables: {
        id: 'gid://shopify/Collection/123',
        limit: 12,
        cursor: null,
        sortKey: 'BEST_SELLING',
        reverse: true,
        filters: [{ available: true }],
        country: 'US',
      },
    }));
  });

  it('fetches a collection by ID with the tenant-scoped Storefront client', async () => {
    const store = await createStore();
    const shopifyResponse = {
      data: {
        collection: {
          id: 'gid://shopify/Collection/123',
          title: 'Featured',
          products: {
            edges: [],
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
            },
          },
        },
      },
    };
    postMock.mockResolvedValueOnce({ data: shopifyResponse });

    const response = await shopifyStorefront.getCollectionByIdForStore(
      store._id.toString(),
      '123',
      8,
      'US'
    );

    expect(response).toEqual(shopifyResponse);
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://tenant-shop.myshopify.com/api/2025-01/graphql.json',
      headers: expect.objectContaining({
        'X-Shopify-Storefront-Access-Token': 'tenant-storefront-token',
      }),
    }));
    expect(postMock).toHaveBeenCalledWith('', expect.objectContaining({
      variables: {
        id: 'gid://shopify/Collection/123',
        productsLimit: 8,
        country: 'US',
      },
    }));
  });

  it('fails collection product browsing with a controlled error for missing Storefront token', async () => {
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '',
        scope: 'read_products',
        isConnected: true,
      },
    });

    await expect(
      shopifyStorefront.getCollectionProductsForStore(store._id.toString(), '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Store missing Storefront API access token. Please configure storefrontAccessToken.',
      statusCode: 400,
      expose: false,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails collection-by-ID enrichment with a controlled error for missing Storefront token', async () => {
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '',
        scope: 'read_products',
        isConnected: true,
      },
    });

    await expect(
      shopifyStorefront.getCollectionByIdForStore(store._id.toString(), '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Shopify not configured for this store',
      statusCode: 400,
      expose: false,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails collection product browsing with a controlled error when the store does not exist', async () => {
    const missingStoreId = new mongoose.Types.ObjectId().toString();

    await expect(
      shopifyStorefront.getCollectionProductsForStore(missingStoreId, '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Store not found',
      statusCode: 404,
      expose: true,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails collection product browsing with a controlled error when the store is inactive', async () => {
    const store = await createStore({ isActive: false });

    await expect(
      shopifyStorefront.getCollectionProductsForStore(store._id.toString(), '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Store is not active',
      statusCode: 403,
      expose: true,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });
  it('fetches product detail with the tenant-scoped Storefront client', async () => {
    const store = await createStore();
    const shopifyResponse = {
      data: {
        product: {
          id: 'gid://shopify/Product/123',
          title: 'Tenant Product',
        },
      },
    };
    postMock.mockResolvedValueOnce({ data: shopifyResponse });

    const response = await shopifyStorefront.getProductByIdForStore(
      store._id.toString(),
      '123',
      'US'
    );

    expect(response).toEqual(shopifyResponse);
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://tenant-shop.myshopify.com/api/2025-01/graphql.json',
      headers: expect.objectContaining({
        'X-Shopify-Storefront-Access-Token': 'tenant-storefront-token',
      }),
    }));
    expect(postMock).toHaveBeenCalledWith('', expect.objectContaining({
      variables: {
        id: 'gid://shopify/Product/123',
        country: 'US',
      },
    }));
  });

  it('fails product detail with a controlled error for missing Storefront token', async () => {
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '',
        scope: 'read_products',
        isConnected: true,
      },
    });

    await expect(
      shopifyStorefront.getProductByIdForStore(store._id.toString(), '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      // Sensitive misconfiguration is not leaked to clients; the specific reason is logged server-side only.
      message: 'Shopify not configured for this store',
      statusCode: 400,
      expose: false,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails product detail with a controlled error when the store does not exist', async () => {
    const missingStoreId = new mongoose.Types.ObjectId().toString();

    await expect(
      shopifyStorefront.getProductByIdForStore(missingStoreId, '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Store not found',
      statusCode: 404,
      expose: true,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('fails product detail with a controlled error when the store is inactive', async () => {
    const store = await createStore({ isActive: false });

    await expect(
      shopifyStorefront.getProductByIdForStore(store._id.toString(), '123')
    ).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Store is not active',
      statusCode: 403,
      expose: true,
    });
    expect(mockedAxios.create).not.toHaveBeenCalled();
  });

  it('runs Storefront cart operations with the tenant-scoped client', async () => {
    const store = await createStore();
    const shopifyResponse = {
      data: {
        cartCreate: {
          cart: {
            id: 'gid://shopify/Cart/abc',
          },
          userErrors: [],
        },
      },
    };
    postMock.mockResolvedValueOnce({ data: shopifyResponse });

    const response = await shopifyStorefront.createCartForStore(
      store._id.toString(),
      [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }],
      'US'
    );

    expect(response).toEqual(shopifyResponse);
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://tenant-shop.myshopify.com/api/2025-01/graphql.json',
      headers: expect.objectContaining({
        'X-Shopify-Storefront-Access-Token': 'tenant-storefront-token',
      }),
    }));
    expect(postMock).toHaveBeenCalledWith('', expect.objectContaining({
      variables: {
        input: {
          lines: [{ merchandiseId: 'gid://shopify/ProductVariant/456', quantity: 2 }],
          buyerIdentity: {
            countryCode: 'US',
          },
        },
        country: 'US',
      },
    }));
  });

  it('fails Storefront cart operations without falling back to global credentials', async () => {
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'global-storefront-token';
    const store = await createStore({
      shopify: {
        shop: 'tenant-shop.myshopify.com',
        storefrontAccessToken: '',
        scope: 'read_products',
        isConnected: true,
      },
    });

    const storeId = store._id.toString();
    const cartOperations = [
      shopifyStorefront.createCartForStore(storeId),
      shopifyStorefront.getCartForStore(storeId, 'gid://shopify/Cart/abc'),
      shopifyStorefront.addCartLinesForStore(storeId, 'gid://shopify/Cart/abc', []),
      shopifyStorefront.updateCartLinesForStore(storeId, 'gid://shopify/Cart/abc', []),
      shopifyStorefront.removeCartLinesForStore(storeId, 'gid://shopify/Cart/abc', []),
      shopifyStorefront.associateCartWithCustomerForStore(storeId, 'gid://shopify/Cart/abc', 'customer-token'),
    ];

    await Promise.all(cartOperations.map((promise) => expect(promise).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Shopify not configured for this store',
      statusCode: 400,
      expose: false,
    })));
    expect(mockedAxios.create).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });
});
