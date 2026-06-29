import mongoose from 'mongoose';
import { HomescreenController, homescreenController } from '../src/controllers/homescreenController';
import { HomescreenTsoaController } from '../src/controllers/homescreenTsoaController';
import CollectionDisplay from '../src/models/CollectionDisplay';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { ApiError } from '../src/utils/errors';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getCollectionByIdWithClient: jest.fn(),
    getStorefrontClientForStore: jest.fn(),
  },
}));

jest.mock('../src/services/productEnrichmentService', () => ({
  __esModule: true,
  default: {
    enrichProducts: jest.fn(async (products: any[]) => products),
  },
}));

const storefrontService = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;
const storefrontClient = {
  isConfigured: true,
  shopDomain: 'tenant-shop.myshopify.com',
  query: jest.fn(),
};

const createShopifyCollectionResponse = (collectionId: string) => ({
  data: {
    collection: {
      id: `gid://shopify/Collection/${collectionId}`,
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
});

const emptyHomescreenData = {
  carousel: [],
  categoryGrid: [],
  calloutBanners: [],
  promoBanners: [],
  collectionDisplays: [],
  categoryCollectionGrid: [],
  collectionShowcases: [],
  layout: [],
  metadata: {
    carouselItemsCount: 0,
    categoryGridItemsCount: 0,
    calloutBannersCount: 0,
    promoBannersCount: 0,
    collectionDisplaysCount: 0,
    categoryCollectionGridCount: 0,
    collectionShowcasesCount: 0,
    lastUpdated: '2026-06-26T00:00:00.000Z',
  },
};

describe('HomescreenController tenant-scoped Storefront enrichment', () => {
  beforeEach(() => {
    storefrontService.getCollectionByIdWithClient.mockReset();
    storefrontService.getStorefrontClientForStore.mockReset();
    storefrontService.getStorefrontClientForStore.mockResolvedValue(storefrontClient as any);
    storefrontService.getCollectionByIdWithClient.mockImplementation(
      async (_client, collectionId) => createShopifyCollectionResponse(collectionId) as any
    );
  });

  it('enriches collection displays through one tenant-scoped Storefront client per request', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    await CollectionDisplay.create([
      {
        storeId,
        type: 'large_row',
        collectionId: '123',
        order: 1,
        isActive: true,
      },
      {
        storeId,
        type: 'small_grid',
        collectionId: '456',
        order: 2,
        isActive: true,
      },
    ]);

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledTimes(1);
    expect(storefrontService.getStorefrontClientForStore).toHaveBeenCalledWith(storeId);
    expect(storefrontService.getCollectionByIdWithClient).toHaveBeenCalledTimes(2);
    expect(storefrontService.getCollectionByIdWithClient).toHaveBeenNthCalledWith(
      1,
      storefrontClient,
      '123',
      20
    );
    expect(storefrontService.getCollectionByIdWithClient).toHaveBeenNthCalledWith(
      2,
      storefrontClient,
      '456',
      20
    );
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
      {
        type: 'small_grid',
        order: 2,
        collection: {
          id: '456',
          title: 'Featured',
          description: 'Featured products',
          handle: 'featured',
          image: 'https://cdn.example.com/featured.jpg',
          products: [],
        },
      },
    ]);
    expect(response.data.metadata.collectionDisplaysCount).toBe(2);
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
    storefrontService.getCollectionByIdWithClient.mockRejectedValueOnce(
      new ApiError('Shopify not configured for this store', 400, true, undefined, false)
    );

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(false);
    expect(response.statusCode).toBe(400);
    expect(response.error).toBe('Failed to fetch homescreen data');
    expect(response.data.collectionDisplays).toEqual([]);
    expect(response.data.metadata.collectionDisplaysCount).toBe(0);
  });

  it('does not serialize internal statusCode in the Express response body', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const getHomescreenDataSpy = jest
      .spyOn(HomescreenController.prototype, 'getHomescreenData')
      .mockResolvedValueOnce({
        success: false,
        statusCode: 400,
        error: 'Failed to fetch homescreen data',
        data: emptyHomescreenData,
      } as any);
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();

    try {
      await homescreenController.getHomescreenData(
        { headers: { 'x-store-id': storeId }, query: {} },
        { status, json }
      );

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to fetch homescreen data',
        data: emptyHomescreenData,
      });
      expect(json.mock.calls[0][0]).not.toHaveProperty('statusCode');
    } finally {
      getHomescreenDataSpy.mockRestore();
    }
  });

  it('does not serialize internal statusCode in the TSOA response body', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const getHomescreenDataSpy = jest
      .spyOn(HomescreenController.prototype, 'getHomescreenData')
      .mockResolvedValueOnce({
        success: false,
        statusCode: 400,
        error: 'Failed to fetch homescreen data',
        data: emptyHomescreenData,
      } as any);

    try {
      const response = await new HomescreenTsoaController().getHomescreenData(storeId);

      expect(response).toEqual({
        success: false,
        error: 'Failed to fetch homescreen data',
        data: emptyHomescreenData,
      });
      expect(response).not.toHaveProperty('statusCode');
    } finally {
      getHomescreenDataSpy.mockRestore();
    }
  });
});
