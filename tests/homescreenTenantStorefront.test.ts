import mongoose from 'mongoose';
import { HomescreenController } from '../src/controllers/homescreenController';
import CollectionDisplay from '../src/models/CollectionDisplay';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getCollectionByIdForStore: jest.fn(),
  },
}));

jest.mock('../src/services/productEnrichmentService', () => ({
  __esModule: true,
  default: {
    enrichProducts: jest.fn(async (products: any[]) => products),
  },
}));

const storefrontService = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;

const shopifyCollectionResponse = {
  data: {
    collection: {
      id: 'gid://shopify/Collection/123',
      title: 'Featured',
      description: 'Featured products',
      handle: 'featured',
      image: {
        url: 'https://cdn.example.com/featured.jpg',
        altText: 'Featured',
      },
      products: {
        edges: [],
      },
    },
  },
};

describe('HomescreenController tenant-scoped Storefront enrichment', () => {
  beforeEach(() => {
    storefrontService.getCollectionByIdForStore.mockReset();
    storefrontService.getCollectionByIdForStore.mockResolvedValue(shopifyCollectionResponse as any);
  });

  it('enriches collection displays through the tenant-scoped Storefront client', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    await CollectionDisplay.create({
      storeId,
      type: 'large_row',
      collectionId: '123',
      order: 1,
      isActive: true,
    });

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(storefrontService.getCollectionByIdForStore).toHaveBeenCalledWith(storeId, '123', 20);
    expect(response.success).toBe(true);
    expect(response.data.collectionDisplays).toEqual([
      {
        type: 'large_row',
        order: 1,
        collection: {
          id: '123',
          title: 'Featured',
          description: 'Featured products',
          handle: 'featured',
          image: 'https://cdn.example.com/featured.jpg',
          products: [],
        },
      },
    ]);
    expect(response.data.metadata.collectionDisplaysCount).toBe(1);
  });

  it('fails the homescreen response with a controlled error when store Storefront credentials are invalid', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    await CollectionDisplay.create({
      storeId,
      type: 'large_row',
      collectionId: '123',
      order: 1,
      isActive: true,
    });
    storefrontService.getCollectionByIdForStore.mockRejectedValueOnce(
      new ApiError('Shopify not configured for this store', 400, true, undefined, false)
    );

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(400);
    expect(response.error).toBe('Failed to fetch homescreen data');
    expect(response.data.collectionDisplays).toEqual([]);
    expect(response.data.metadata.collectionDisplaysCount).toBe(0);
  });
});
