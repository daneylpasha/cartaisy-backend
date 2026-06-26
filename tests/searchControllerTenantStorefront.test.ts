import mongoose from 'mongoose';
import { SearchController } from '../src/controllers/searchController';
import SearchHistory from '../src/models/SearchHistory';
import ShopifyStorefrontService from '../src/services/shopifyStorefrontService';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    predictiveSearchForStore: jest.fn(),
    searchProductsForStore: jest.fn(),
  },
}));

jest.mock('../src/services/productEnrichmentService', () => ({
  __esModule: true,
  default: {
    enrichProducts: jest.fn(async (products: any[]) => products),
  },
}));

const storefrontService = ShopifyStorefrontService as jest.Mocked<typeof ShopifyStorefrontService>;

const predictiveResponse = {
  data: {
    predictiveSearch: {
      products: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Shirt',
          handle: 'shirt',
          vendor: 'Cartaisy',
          productType: 'Apparel',
          tags: ['shirt'],
          featuredImage: { url: 'https://cdn.example.com/shirt.jpg', altText: 'Shirt' },
          priceRange: {
            minVariantPrice: {
              amount: '29.00',
              currencyCode: 'USD',
            },
          },
          compareAtPriceRange: null,
        },
      ],
      collections: [
        {
          id: 'gid://shopify/Collection/1',
          title: 'Shirts',
          handle: 'shirts',
          image: null,
        },
      ],
    },
  },
};

describe('SearchController tenant-scoped Storefront search', () => {
  beforeEach(() => {
    storefrontService.predictiveSearchForStore.mockReset();
    storefrontService.searchProductsForStore.mockReset();
    storefrontService.predictiveSearchForStore.mockResolvedValue(predictiveResponse as any);
  });

  it('uses tenant-scoped Storefront predictive search for mobile search', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const controller = new SearchController();

    const response = await controller.search(
      { headers: { 'user-agent': 'Mobile Safari' }, sessionID: 'session-1' },
      storeId,
      'shirt'
    );

    expect(storefrontService.predictiveSearchForStore).toHaveBeenCalledWith(storeId, 'shirt', 20);
    expect(storefrontService.searchProductsForStore).not.toHaveBeenCalled();
    expect(response.data.products).toHaveLength(1);
    expect(response.data.collections).toEqual([
      {
        id: 'gid://shopify/Collection/1',
        title: 'Shirts',
        handle: 'shirts',
        image: null,
        description: null,
      },
    ]);

    const searchRecord = await SearchHistory.findOne({ query: 'shirt' }).lean();
    expect(searchRecord?.storeId?.toString()).toBe(storeId);
    expect(searchRecord?.resultsCount).toBe(1);
    expect(searchRecord?.hasResults).toBe(true);
  });

  it('fails mobile search with a controlled error when x-store-id is missing', async () => {
    const controller = new SearchController();

    await expect(
      controller.search({ headers: {}, sessionID: 'session-1' }, '', 'shirt')
    ).rejects.toMatchObject({
      name: ApiError.name,
      statusCode: 400,
      message: 'A valid x-store-id header is required',
      expose: true,
    });

    expect(storefrontService.predictiveSearchForStore).not.toHaveBeenCalled();
  });

  it('uses tenant-scoped Storefront predictive search and scoped history for suggestions', async () => {
    const storeId = new mongoose.Types.ObjectId();
    const otherStoreId = new mongoose.Types.ObjectId();

    await SearchHistory.create([
      {
        storeId,
        query: 'shirt',
        resultsCount: 3,
        hasResults: true,
      },
      {
        storeId: otherStoreId,
        query: 'shoes',
        resultsCount: 3,
        hasResults: true,
      },
    ]);

    const controller = new SearchController();
    const response = await controller.getSearchSuggestions(storeId.toString(), 'sh', 10);

    expect(storefrontService.predictiveSearchForStore).toHaveBeenCalledWith(storeId.toString(), 'sh', 10);
    expect(response).toEqual({
      success: true,
      data: {
        suggestions: [{ query: 'shirt', popularity: 1 }],
        products: [{ type: 'product', text: 'Shirt', handle: 'shirt' }],
        categories: [{ type: 'category', text: 'Shirts', slug: 'shirts' }],
      },
    });
  });
});
