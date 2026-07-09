import mongoose from 'mongoose';
import { carouselController } from '../src/controllers/carouselController';
import { promoBannerController } from '../src/controllers/promoBannerController';
import { calloutBannerController } from '../src/controllers/calloutBannerController';
import { categoryGridController } from '../src/controllers/categoryGridController';
import { collectionDisplayController } from '../src/controllers/collectionDisplayController';
import { categoryCollectionGridController } from '../src/controllers/categoryCollectionGridController';
import { collectionShowcaseController } from '../src/controllers/collectionShowcaseController';
import CarouselItem from '../src/models/CarouselItem';
import PromoBanner from '../src/models/PromoBanner';
import CalloutBanner from '../src/models/CalloutBanner';
import CategoryGrid from '../src/models/CategoryGrid';
import CollectionDisplay from '../src/models/CollectionDisplay';
import CategoryCollectionGrid from '../src/models/CategoryCollectionGrid';
import CollectionShowcase from '../src/models/CollectionShowcase';
import shopifyStorefront from '../src/services/shopifyStorefrontService';

jest.mock('../src/services/shopifyStorefrontService', () => ({
  __esModule: true,
  default: {
    getStorefrontClientForStore: jest.fn(),
    getCollectionByIdWithClient: jest.fn(),
  },
}));

const storefrontService = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;
const storefrontClient = {
  isConfigured: true,
  shopDomain: 'store-a.myshopify.com',
  query: jest.fn(),
};

const storeACollectionId = 'store-a-featured';
const storeASecondCollectionId = 'store-a-sale';
const storeBCollectionId = 'store-b-featured';
const invalidCollectionId = 'missing-collection';

const createResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
});

const getJson = (res: ReturnType<typeof createResponse>) => res.json.mock.calls[0][0];

const collectionResponse = (collectionId: string) => ({
  data: {
    collection: {
      id: `gid://shopify/Collection/${collectionId}`,
      title: collectionId,
      description: '',
      handle: collectionId,
      image: null,
      products: { edges: [] },
    },
  },
});

describe('home module Shopify ID ownership validation', () => {
  const storeAId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    storefrontService.getStorefrontClientForStore.mockReset();
    storefrontService.getCollectionByIdWithClient.mockReset();
    storefrontService.getStorefrontClientForStore.mockResolvedValue(storefrontClient as any);
    storefrontService.getCollectionByIdWithClient.mockImplementation(async (_client, collectionId) => {
      if (collectionId === storeACollectionId || collectionId === storeASecondCollectionId) {
        return collectionResponse(collectionId) as any;
      }

      return { data: { collection: null } } as any;
    });
  });

  it('preserves valid create/update behavior for all current home module collection ID payloads', async () => {
    await carouselController.createCarouselItem(
      {
        storeId: storeAId,
        body: {
          imageUrl: 'https://cdn.example.com/carousel.jpg',
          label: 'Featured',
          title: 'Featured',
          subtitle: 'Shop now',
          collectionId: storeACollectionId,
        },
      } as any,
      createResponse() as any
    );

    await promoBannerController.createPromoBanners(
      {
        storeId: storeAId,
        body: [{
          image: 'https://cdn.example.com/promo.jpg',
          title: 'Promo',
          subtitle: 'Save today',
          ctaText: 'Shop',
          collectionId: storeACollectionId,
        }],
      } as any,
      createResponse() as any
    );

    await calloutBannerController.createCalloutBanners(
      {
        storeId: storeAId,
        body: [{
          imageUrl: 'https://cdn.example.com/callout.jpg',
          title: 'Callout',
          subTitle: 'New',
          buttonText: 'Shop',
          action: { type: 'collection', collectionId: storeACollectionId },
        }],
      } as any,
      createResponse() as any
    );

    await categoryGridController.createCategoryGridItems(
      {
        storeId: storeAId,
        body: [{
          imageUrl: 'https://cdn.example.com/category.jpg',
          title: 'Category',
          collectionId: storeACollectionId,
        }],
      } as any,
      createResponse() as any
    );

    await collectionDisplayController.createCollectionDisplays(
      {
        storeId: storeAId,
        body: {
          collectionDisplays: [{
            type: 'large_row',
            collectionId: storeACollectionId,
            order: 1,
          }],
        },
      } as any,
      createResponse() as any
    );

    await categoryCollectionGridController.createCategoryCollectionGrids(
      {
        storeId: storeAId,
        body: [{
          title: 'Categories',
          subtitle: 'Browse',
          collections: [{
            image: 'https://cdn.example.com/nested.jpg',
            title: 'Nested',
            collectionId: storeACollectionId,
          }],
        }],
      } as any,
      createResponse() as any
    );

    await collectionShowcaseController.createCollectionShowcases(
      {
        storeId: storeAId,
        body: [{
          type: 'grid',
          title: 'Showcase',
          collections: [{
            image: 'https://cdn.example.com/showcase.jpg',
            title: 'Showcase collection',
            collectionId: storeACollectionId,
          }],
        }],
      } as any,
      createResponse() as any
    );

    await expect(CarouselItem.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(PromoBanner.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CalloutBanner.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CategoryGrid.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CollectionDisplay.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CategoryCollectionGrid.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CollectionShowcase.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    expect(storefrontService.getCollectionByIdWithClient).toHaveBeenCalled();
  });

  it('rejects invalid Shopify collection IDs with a controlled 400 before replacing saved modules', async () => {
    await CategoryGrid.create({
      storeId: storeAId,
      imageUrl: 'https://cdn.example.com/existing.jpg',
      title: 'Existing',
      collectionId: storeACollectionId,
      position: 0,
      isActive: true,
    });

    const res = createResponse();
    await categoryGridController.updateCategoryGridItems(
      {
        storeId: storeAId,
        body: [{
          imageUrl: 'https://cdn.example.com/new.jpg',
          title: 'New',
          collectionId: invalidCollectionId,
        }],
      } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getJson(res)).toEqual({
      success: false,
      error: 'Invalid Shopify collection ID at [0].collectionId',
    });
    await expect(CategoryGrid.countDocuments({ storeId: storeAId })).resolves.toBe(1);
    await expect(CategoryGrid.findOne({ storeId: storeAId }).lean()).resolves.toMatchObject({
      title: 'Existing',
      collectionId: storeACollectionId,
    });
  });

  it('rejects Store B Shopify collection IDs when Store A saves home modules', async () => {
    const res = createResponse();
    await promoBannerController.createPromoBanners(
      {
        storeId: storeAId,
        body: [{
          image: 'https://cdn.example.com/promo.jpg',
          title: 'Promo',
          subtitle: 'Save today',
          ctaText: 'Shop',
          collectionId: storeBCollectionId,
        }],
      } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getJson(res)).toEqual({
      success: false,
      error: 'Invalid Shopify collection ID at [0].collectionId',
    });
    await expect(PromoBanner.countDocuments({ storeId: storeAId })).resolves.toBe(0);
  });

  it('rejects publish activation when the saved module points at another store collection', async () => {
    const carouselItem = await CarouselItem.create({
      storeId: storeAId,
      imageUrl: 'https://cdn.example.com/carousel.jpg',
      label: 'Featured',
      title: 'Featured',
      subtitle: 'Shop now',
      collectionId: storeBCollectionId,
      position: 0,
      isActive: false,
    });

    const res = createResponse();
    await carouselController.updateCarouselItemStatus(
      {
        storeId: storeAId,
        params: { id: carouselItem._id.toString() },
        body: { isActive: true },
      } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getJson(res)).toEqual({
      success: false,
      error: 'Invalid Shopify collection ID at collectionId',
    });
    await expect(CarouselItem.findById(carouselItem._id).lean()).resolves.toMatchObject({
      isActive: false,
    });
  });

  it('returns a service-unavailable status for transient Shopify validation failures', async () => {
    storefrontService.getCollectionByIdWithClient.mockRejectedValueOnce({
      response: { status: 429 },
    });

    const res = createResponse();
    await categoryGridController.createCategoryGridItems(
      {
        storeId: storeAId,
        body: [{
          imageUrl: 'https://cdn.example.com/category.jpg',
          title: 'Category',
          collectionId: storeACollectionId,
        }],
      } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(getJson(res)).toEqual({
      success: false,
      error: 'Unable to validate Shopify collection IDs for this store',
    });
    await expect(CategoryGrid.countDocuments({ storeId: storeAId })).resolves.toBe(0);
  });

  it('validates multiple unique collection references in parallel', async () => {
    let resolveFirst: (value: any) => void = () => undefined;
    const firstLookup = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    storefrontService.getCollectionByIdWithClient.mockImplementation((_client, collectionId) => {
      if (collectionId === storeACollectionId) {
        return firstLookup as any;
      }

      return Promise.resolve(collectionResponse(collectionId)) as any;
    });

    const res = createResponse();
    const request = categoryCollectionGridController.createCategoryCollectionGrids(
      {
        storeId: storeAId,
        body: [{
          title: 'Categories',
          subtitle: 'Browse',
          collections: [
            {
              image: 'https://cdn.example.com/first.jpg',
              title: 'First',
              collectionId: storeACollectionId,
            },
            {
              image: 'https://cdn.example.com/second.jpg',
              title: 'Second',
              collectionId: storeASecondCollectionId,
            },
          ],
        }],
      } as any,
      res as any
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(storefrontService.getCollectionByIdWithClient).toHaveBeenCalledTimes(2);

    resolveFirst(collectionResponse(storeACollectionId));
    await request;

    expect(res.status).toHaveBeenCalledWith(201);
    await expect(CategoryCollectionGrid.countDocuments({ storeId: storeAId })).resolves.toBe(1);
  });

  it('returns a clear 400 when nested collections is missing or not an array', async () => {
    const res = createResponse();
    await collectionShowcaseController.createCollectionShowcases(
      {
        storeId: storeAId,
        body: [{
          type: 'grid',
          title: 'Showcase',
        }],
      } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getJson(res)).toEqual({
      success: false,
      error: 'collections must be a non-empty array at [0].collections',
    });
    expect(storefrontService.getCollectionByIdWithClient).not.toHaveBeenCalled();
    await expect(CollectionShowcase.countDocuments({ storeId: storeAId })).resolves.toBe(0);
  });
});
