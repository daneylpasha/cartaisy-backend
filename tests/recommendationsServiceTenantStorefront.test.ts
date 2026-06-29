import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { getCartRecommendations, getProductRecommendations } from '../src/services/recommendationsService';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    getStorefrontClientForStore: jest.fn(),
  },
}));

const storefrontService = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;

const createShopifyProduct = (id: string, handle: string, productType = 'Apparel') => ({
  id: `gid://shopify/Product/${id}`,
  title: `Product ${id}`,
  handle,
  description: `Description ${id}`,
  vendor: 'Cartaisy',
  productType,
  tags: ['shirt'],
  priceRange: {
    minVariantPrice: {
      amount: '29.00',
      currencyCode: 'USD',
    },
  },
  compareAtPriceRange: {
    minVariantPrice: {
      amount: '39.00',
    },
  },
  images: {
    edges: [
      {
        node: {
          url: `https://cdn.example.com/${handle}.jpg`,
          altText: `Product ${id}`,
          width: 800,
          height: 800,
        },
      },
    ],
  },
  variants: {
    edges: [
      {
        node: {
          id: `gid://shopify/ProductVariant/${id}1`,
          title: 'Default Title',
          price: {
            amount: '29.00',
          },
          compareAtPrice: {
            amount: '39.00',
          },
          availableForSale: true,
          quantityAvailable: 5,
        },
      },
    ],
  },
});

const createStorefrontClient = (query: jest.Mock) => ({
  isConfigured: true,
  shopDomain: 'tenant-shop.myshopify.com',
  query,
});

describe('recommendationsService tenant-scoped Storefront client', () => {
  beforeEach(() => {
    storefrontService.isConfigured.mockReset();
    storefrontService.getStorefrontClientForStore.mockReset();
    storefrontService.isConfigured.mockReturnValue(false);
  });

  it('uses a tenant-scoped Storefront client for product recommendations', async () => {
    const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          productRecommendations: [
            { id: 'gid://shopify/Product/200', handle: 'recommended-shirt' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          products: {
            edges: [{ node: createShopifyProduct('200', 'recommended-shirt') }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          product: {
            id: 'gid://shopify/Product/100',
            productType: 'Apparel',
          },
        },
      });

    storefrontService.getStorefrontClientForStore.mockResolvedValue(createStorefrontClient(query) as any);

    const recommendations = await getProductRecommendations('100', 6, { storeId });

    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledTimes(1);
    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledWith(storeId);
    expect(storefrontService.isConfigured).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
    expect(recommendations).toEqual([
      expect.objectContaining({
        shopifyProductId: '200',
        title: 'Product 200',
        handle: 'recommended-shirt',
        productType: 'Apparel',
      }),
    ]);
  });

  it('reuses one tenant-scoped Storefront client for cart recommendations', async () => {
    const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          productRecommendations: [
            { id: 'gid://shopify/Product/200', handle: 'recommended-shirt' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          products: {
            edges: [{ node: createShopifyProduct('200', 'recommended-shirt') }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          product: {
            id: 'gid://shopify/Product/100',
            productType: 'Apparel',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          productRecommendations: [
            { id: 'gid://shopify/Product/201', handle: 'recommended-jacket' },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          products: {
            edges: [{ node: createShopifyProduct('201', 'recommended-jacket') }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          product: {
            id: 'gid://shopify/Product/101',
            productType: 'Apparel',
          },
        },
      });

    storefrontService.getStorefrontClientForStore.mockResolvedValue(createStorefrontClient(query) as any);

    const recommendations = await getCartRecommendations(['100', '101'], 6, { storeId });

    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledTimes(1);
    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledWith(storeId);
    expect(query).toHaveBeenCalledTimes(6);
    expect(recommendations).toEqual([
      expect.objectContaining({ shopifyProductId: '200' }),
      expect.objectContaining({ shopifyProductId: '201' }),
    ]);
  });

  it('throws a generic controlled error when tenant Storefront credentials are not exposed', async () => {
    const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';

    storefrontService.getStorefrontClientForStore.mockResolvedValue({
      isConfigured: false,
      shopDomain: '',
      error: 'Store missing Storefront API access token. Please configure storefrontAccessToken.',
      statusCode: 400,
    } as any);

    await expect(getProductRecommendations('100', 6, { storeId })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Shopify not configured for this store',
      statusCode: 400,
      expose: false,
    } satisfies Partial<ApiError>);
  });
});
