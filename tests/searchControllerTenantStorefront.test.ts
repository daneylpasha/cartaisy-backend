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

const searchProductsResponse = {
  data: {
    products: {
      edges: [
        {
          node: {
            id: 'gid://shopify/Product/2',
            title: 'Search Shirt',
            description: 'A searchable shirt',
            handle: 'search-shirt',
            vendor: 'Cartaisy',
            productType: 'Apparel',
            tags: ['shirt'],
            availableForSale: true,
            totalInventory: 7,
            priceRange: {
              minVariantPrice: {
                amount: '31.00',
                currencyCode: 'USD',
              },
            },
            compareAtPriceRange: null,
            images: {
              edges: [
                {
                  node: {
                    url: 'https://cdn.example.com/search-shirt.jpg',
                    altText: 'Search Shirt',
                  },
                },
              ],
            },
          },
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

  it('does not fall back to unscoped MongoDB products when Storefront search fails', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const controller = new SearchController();
    storefrontService.predictiveSearchForStore.mockRejectedValueOnce(new Error('network timeout'));

    await expect(
      controller.search({ headers: {}, sessionID: 'session-1' }, storeId, 'shirt')
    ).rejects.toMatchObject({
      name: ApiError.name,
      statusCode: 502,
      message: 'Failed to fetch tenant-scoped Storefront search results',
      expose: true,
    });

    expect(storefrontService.searchProductsForStore).not.toHaveBeenCalled();
    await expect(SearchHistory.findOne({ query: 'shirt' }).lean()).resolves.toBeNull();
  });

  it('keeps successful product results when the secondary collection fetch fails', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const controller = new SearchController();
    storefrontService.searchProductsForStore.mockResolvedValueOnce(searchProductsResponse as any);
    storefrontService.predictiveSearchForStore.mockRejectedValueOnce(new Error('collections timeout'));

    const response = await controller.search(
      { headers: { 'user-agent': 'Mobile Safari' }, sessionID: 'session-1' },
      storeId,
      'shirt',
      2
    );

    expect(storefrontService.searchProductsForStore).toHaveBeenCalledWith(storeId, 'shirt', {
      limit: 20,
      sortKey: 'RELEVANCE',
      reverse: false,
    });
    expect(storefrontService.predictiveSearchForStore).toHaveBeenCalledWith(storeId, 'shirt', 5);
    expect(response.data.products).toHaveLength(1);
    expect(response.data.products[0]).toMatchObject({
      productId: 'gid://shopify/Product/2',
      title: 'Search Shirt',
      handle: 'search-shirt',
    });
    expect(response.data.collections).toEqual([]);
    expect(response.data.pagination.totalResults).toBe(1);
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

  it('does not fall back to unscoped MongoDB suggestions when Storefront suggestions fail', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const controller = new SearchController();
    storefrontService.predictiveSearchForStore.mockRejectedValueOnce(new Error('network timeout'));

    await expect(controller.getSearchSuggestions(storeId, 'sh', 10)).rejects.toMatchObject({
      name: ApiError.name,
      statusCode: 502,
      message: 'Failed to fetch tenant-scoped Storefront search results',
      expose: true,
    });
  });

  it('escapes regex metacharacters in scoped search-history suggestions', async () => {
    const storeId = new mongoose.Types.ObjectId();

    await SearchHistory.create([
      {
        storeId,
        query: 'sh.* literal',
        resultsCount: 2,
        hasResults: true,
      },
      {
        storeId,
        query: 'shirt',
        resultsCount: 3,
        hasResults: true,
      },
    ]);

    const suggestions = await SearchHistory.getSearchSuggestions('sh.*', 10, storeId.toString());

    expect(suggestions).toEqual([{ query: 'sh.* literal', popularity: 1 }]);
  });
});
