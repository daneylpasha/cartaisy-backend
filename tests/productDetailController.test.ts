import { ProductDetailController } from '../src/controllers/productDetailController';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import Product from '../src/models/Product';
import ProductMetrics from '../src/models/ProductMetrics';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getProductById: jest.fn(),
    getProductByIdForStore: jest.fn(),
  },
}));

jest.mock('../src/models/Product', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

jest.mock('../src/models/ProductMetrics', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

const mockedShopifyStorefront = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;
const mockedProduct = Product as jest.Mocked<typeof Product>;
const mockedProductMetrics = ProductMetrics as jest.Mocked<typeof ProductMetrics>;

const storeId = '64b7f8e2b7f8e2b7f8e2b7f8';

const mockLeanResult = (value: unknown) => ({
  lean: jest.fn().mockResolvedValue(value),
});

describe('ProductDetailController tenant-scoped Storefront access', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedShopifyStorefront.getProductByIdForStore.mockReset();
    mockedShopifyStorefront.getProductById.mockReset();
    mockedProduct.findOne.mockReset();
    mockedProductMetrics.findOne.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  it('requires an x-store-id header before fetching product detail', async () => {
    const controller = new ProductDetailController();

    await expect(controller.getProductDetail('123')).rejects.toThrow('x-store-id header is required');

    expect(controller.getStatus()).toBe(400);
    expect(mockedShopifyStorefront.getProductByIdForStore).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.getProductById).not.toHaveBeenCalled();
  });

  it('rejects malformed store IDs without using global Storefront fallback', async () => {
    const controller = new ProductDetailController();

    await expect(controller.getProductDetail('123', 'not-an-object-id')).rejects.toThrow('Invalid Store ID format');

    expect(controller.getStatus()).toBe(400);
    expect(mockedShopifyStorefront.getProductByIdForStore).not.toHaveBeenCalled();
    expect(mockedShopifyStorefront.getProductById).not.toHaveBeenCalled();
  });

  it('fetches product detail through the tenant-scoped Storefront client and preserves response shape', async () => {
    const controller = new ProductDetailController();
    mockedShopifyStorefront.getProductByIdForStore.mockResolvedValue({
      data: {
        product: {
          id: 'gid://shopify/Product/123',
          title: 'Tenant Product',
          description: 'A tenant-scoped product',
          descriptionHtml: '<p>A tenant-scoped product</p>',
          images: {
            edges: [
              { node: { url: 'https://cdn.example.com/product.jpg' } },
            ],
          },
          priceRange: {
            minVariantPrice: {
              amount: '25.50',
              currencyCode: 'USD',
            },
          },
          compareAtPriceRange: {
            minVariantPrice: {
              amount: '30.00',
              currencyCode: 'USD',
            },
          },
          vendor: 'Tenant Vendor',
          productType: 'Shirts',
          tags: ['featured'],
          handle: 'tenant-product',
          availableForSale: true,
          totalInventory: 4,
          variants: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/ProductVariant/456',
                  title: 'Small',
                  price: {
                    amount: '25.50',
                    currencyCode: 'USD',
                  },
                  compareAtPrice: {
                    amount: '30.00',
                    currencyCode: 'USD',
                  },
                  availableForSale: true,
                  quantityAvailable: 4,
                  selectedOptions: [{ name: 'Size', value: 'S' }],
                  image: { url: 'https://cdn.example.com/variant.jpg' },
                },
              },
            ],
          },
        },
      },
    });
    mockedProductMetrics.findOne.mockReturnValue(mockLeanResult({
      soldThisMonth: 9,
      isBestSeller: true,
    }) as any);
    mockedProduct.findOne.mockReturnValue(mockLeanResult({
      reviews: {
        averageRating: 4.6,
        count: 12,
      },
    }) as any);

    const response = await controller.getProductDetail('123', storeId, 'US');

    expect(mockedShopifyStorefront.getProductByIdForStore).toHaveBeenCalledWith(storeId, '123', 'US');
    expect(mockedShopifyStorefront.getProductById).not.toHaveBeenCalled();
    expect(response).toEqual({
      success: true,
      data: {
        productId: '123',
        title: 'Tenant Product',
        description: 'A tenant-scoped product',
        descriptionHtml: '<p>A tenant-scoped product</p>',
        images: ['https://cdn.example.com/product.jpg'],
        price: 25.5,
        compareAtPrice: 30,
        currency: 'USD',
        vendor: 'Tenant Vendor',
        productType: 'Shirts',
        tags: ['featured'],
        handle: 'tenant-product',
        availableForSale: true,
        totalInventory: 4,
        inStock: true,
        variants: [
          {
            id: '456',
            title: 'Small',
            price: 25.5,
            compareAtPrice: 30,
            availableForSale: true,
            quantityAvailable: 4,
            selectedOptions: [{ name: 'Size', value: 'S' }],
            image: 'https://cdn.example.com/variant.jpg',
          },
        ],
        metafields: [],
        rating: 4.6,
        reviewsCount: 12,
        soldThisMonth: 9,
        badges: {
          isBestSeller: true,
          discountPercentage: 15,
        },
      },
    });
  });

  it('surfaces tenant Storefront credential failures as controlled errors', async () => {
    const controller = new ProductDetailController();
    mockedShopifyStorefront.getProductByIdForStore.mockRejectedValue(
      new ApiError('Shopify not configured for this store', 400, true, undefined, true)
    );

    await expect(controller.getProductDetail('123', storeId)).rejects.toMatchObject({
      name: ApiError.name,
      message: 'Shopify not configured for this store',
      statusCode: 400,
      expose: true,
    });

    expect(controller.getStatus()).toBe(400);
    expect(mockedShopifyStorefront.getProductByIdForStore).toHaveBeenCalledWith(storeId, '123', undefined);
    expect(mockedShopifyStorefront.getProductById).not.toHaveBeenCalled();
  });
});
