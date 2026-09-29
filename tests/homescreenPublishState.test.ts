import mongoose from 'mongoose';
import { HomescreenController } from '../src/controllers/homescreenController';
import CarouselItem from '../src/models/CarouselItem';
import CollectionDisplay from '../src/models/CollectionDisplay';
import HomeLayout from '../src/models/HomeLayout';
import shopifyStorefront from '../src/services/shopifyStorefrontService';
import { legacyPublishedAt } from '../src/services/homeLayoutPublishService';

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
    enrichProducts: jest.fn(async (products: unknown[]) => products),
  },
}));

const storefrontService = shopifyStorefront as jest.Mocked<typeof shopifyStorefront>;

const storefrontClient = {
  isConfigured: true,
  shopDomain: 'tenant-shop.myshopify.com',
  query: jest.fn(),
};

function carouselPayload(storeId: string, title: string) {
  return {
    storeId,
    imageUrl: 'https://cdn.example.com/carousel.jpg',
    label: 'Featured',
    title,
    subtitle: 'Shop the edit',
    ctaText: 'Shop',
    collectionId: 'gid://shopify/Collection/1',
    position: 0,
    isActive: true,
  };
}

describe('Homescreen publish state', () => {
  beforeEach(() => {
    storefrontService.getCollectionByIdWithClient.mockReset();
    storefrontService.getStorefrontClientForStore.mockReset();
    storefrontService.getStorefrontClientForStore.mockResolvedValue(storefrontClient as any);
    storefrontService.getCollectionByIdWithClient.mockResolvedValue({
      data: { collection: null },
    } as any);
  });

  it('serves an empty module stack when the home has not been published', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const otherStoreId = new mongoose.Types.ObjectId().toString();
    const draftSections = [
      { type: 'carousel' as const, position: 0, isVisible: true },
      { type: 'promo_banners' as const, position: 1, isVisible: true },
    ];

    await HomeLayout.create({
      storeId,
      sections: [],
      draftSections,
      publishedAt: null,
    });
    await CarouselItem.create(carouselPayload(storeId, 'Draft carousel'));
    await CollectionDisplay.create({
      storeId,
      type: 'large_row',
      collectionId: '123',
      order: 1,
      isActive: true,
    });
    await CarouselItem.create(carouselPayload(otherStoreId, 'Other store'));

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(true);
    expect(response.data.layout).toEqual([]);
    expect(response.data.carousel).toEqual([]);
    expect(response.data.collectionDisplays).toEqual([]);
    expect(response.data.promoBanners).toEqual([]);
    expect(response.data.metadata.carouselItemsCount).toBe(0);
    expect(response.data.metadata.collectionDisplaysCount).toBe(0);
    expect(storefrontService.getStorefrontClientForStore).not.toHaveBeenCalled();

    const saved = await HomeLayout.findOne({ storeId }).lean();
    expect(saved?.sections).toEqual([]);
    expect(saved?.draftSections).toEqual(draftSections);
    expect(saved?.publishedAt).toBeNull();
    expect(JSON.stringify(response)).not.toMatch(/shpat_|shpss_|access_token|apiSecret/i);
  });

  it('serves the empty module stack when the store has no home layout document', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    await CarouselItem.create(carouselPayload(storeId, 'Unpublished carousel'));

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(true);
    expect(response.data.layout).toEqual([]);
    expect(response.data.carousel).toEqual([]);
    expect(await HomeLayout.countDocuments({ storeId })).toBe(0);
  });

  it('uses the published section order and visibility, ignoring the draft', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const publishedSections = [
      { type: 'category_grid' as const, position: 2, isVisible: false },
      { type: 'carousel' as const, position: 0, isVisible: true },
      { type: 'collection_displays' as const, position: 1, isVisible: false },
    ];
    await HomeLayout.create({
      storeId,
      sections: publishedSections,
      draftSections: [{ type: 'promo_banners', position: 0, isVisible: true }],
      publishedAt: new Date('2026-02-02T00:00:00.000Z'),
    });
    await CarouselItem.create(carouselPayload(storeId, 'Live carousel'));
    await CollectionDisplay.create({
      storeId,
      type: 'large_row',
      collectionId: '123',
      order: 1,
      isActive: true,
    });

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(true);
    expect(response.data.layout).toEqual([
      { type: 'carousel', position: 0, isVisible: true },
      { type: 'collection_displays', position: 1, isVisible: false },
      { type: 'category_grid', position: 2, isVisible: false },
    ]);
    expect(response.data.carousel).toEqual([
      expect.objectContaining({ title: 'Live carousel', isActive: true }),
    ]);
    expect(response.data.collectionDisplays).toEqual([]);
    expect(response.data.promoBanners).toEqual([]);
    expect(response.data.metadata.carouselItemsCount).toBe(1);
    expect(response.data.metadata.collectionDisplaysCount).toBe(0);
    expect(storefrontService.getStorefrontClientForStore).not.toHaveBeenCalled();

    const saved = await HomeLayout.findOne({ storeId }).lean();
    expect(saved?.sections).toEqual(publishedSections);
    expect(saved?.draftSections).toEqual([
      { type: 'promo_banners', position: 0, isVisible: true },
    ]);
  });

  it('keeps a legacy non-empty sections list live and backfills publishedAt without rewriting sections', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const otherStoreId = new mongoose.Types.ObjectId().toString();
    const legacyUpdatedAt = new Date('2025-11-03T12:30:00.000Z');
    const sections = [
      { type: 'promo_banners' as const, position: 1, isVisible: true },
      { type: 'carousel' as const, position: 0, isVisible: true },
    ];
    const draftSections = [{ type: 'callout_banners' as const, position: 0, isVisible: true }];

    const layout = await HomeLayout.create({
      storeId,
      sections,
      draftSections,
    });
    await HomeLayout.collection.updateOne(
      { _id: layout._id },
      { $unset: { publishedAt: '' }, $set: { updatedAt: legacyUpdatedAt } }
    );
    await HomeLayout.create({
      storeId: otherStoreId,
      sections: [],
      draftSections: [{ type: 'carousel', position: 0, isVisible: true }],
      publishedAt: null,
    });

    await CarouselItem.create(carouselPayload(storeId, 'Legacy carousel'));
    await CarouselItem.create(carouselPayload(otherStoreId, 'Other store carousel'));

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(true);
    expect(response.data.layout).toEqual([
      { type: 'carousel', position: 0, isVisible: true },
      { type: 'promo_banners', position: 1, isVisible: true },
    ]);
    expect(response.data.carousel.map((item) => item.title)).toEqual(['Legacy carousel']);

    const saved = await HomeLayout.findOne({ storeId }).lean();
    expect(saved?.publishedAt).toEqual(legacyUpdatedAt);
    expect(saved?.updatedAt).toEqual(legacyUpdatedAt);
    expect(saved?.sections).toEqual(sections);
    expect(saved?.draftSections).toEqual(draftSections);

    const other = await HomeLayout.findOne({ storeId: otherStoreId }).lean();
    expect(other?.publishedAt ?? null).toBeNull();
    expect(other?.sections).toEqual([]);
  });

  it('treats a published empty section list as live but renders no modules', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    await HomeLayout.create({
      storeId,
      sections: [],
      draftSections: [{ type: 'carousel', position: 0, isVisible: true }],
      publishedAt: new Date('2026-04-04T00:00:00.000Z'),
    });
    await CarouselItem.create(carouselPayload(storeId, 'Hidden by an empty publish'));

    const response = await new HomescreenController().getHomescreenData(storeId);

    expect(response.success).toBe(true);
    expect(response.data.layout).toEqual([]);
    expect(response.data.carousel).toEqual([]);
    const saved = await HomeLayout.findOne({ storeId }).lean();
    expect(saved?.sections).toEqual([]);
    expect(saved?.draftSections).toEqual([
      { type: 'carousel', position: 0, isVisible: true },
    ]);
  });

  it('does not write publishedAt again after the legacy backfill', async () => {
    const storeId = new mongoose.Types.ObjectId().toString();
    const legacyUpdatedAt = new Date('2025-01-01T00:00:00.000Z');
    const sections = [{ type: 'carousel' as const, position: 0, isVisible: true }];
    const layout = await HomeLayout.create({ storeId, sections });
    await HomeLayout.collection.updateOne(
      { _id: layout._id },
      { $unset: { publishedAt: '' }, $set: { updatedAt: legacyUpdatedAt } }
    );

    const controller = new HomescreenController();
    await controller.getHomescreenData(storeId);
    await controller.getHomescreenData(storeId);

    const saved = await HomeLayout.findOne({ storeId }).lean();
    expect(saved?.publishedAt).toEqual(legacyUpdatedAt);
    expect(saved?.updatedAt).toEqual(legacyUpdatedAt);
    expect(saved?.sections).toEqual(sections);
  });

  it('does not publish an empty legacy list while backfilling a sibling store', async () => {
    const publishedStoreId = new mongoose.Types.ObjectId().toString();
    const unpublishedStoreId = new mongoose.Types.ObjectId().toString();
    const legacy = await HomeLayout.create({
      storeId: publishedStoreId,
      sections: [{ type: 'carousel', position: 0, isVisible: true }],
    });
    const savedAt = new Date('2024-06-01T00:00:00.000Z');
    await HomeLayout.collection.updateOne(
      { _id: legacy._id },
      { $unset: { publishedAt: '' }, $set: { updatedAt: savedAt } }
    );
    await HomeLayout.create({
      storeId: unpublishedStoreId,
      sections: [],
      draftSections: [{ type: 'carousel', position: 0, isVisible: true }],
      publishedAt: null,
    });
    await CarouselItem.create(carouselPayload(unpublishedStoreId, 'Still a draft'));
    await CarouselItem.create(carouselPayload(publishedStoreId, 'Legacy carousel'));

    const live = await new HomescreenController().getHomescreenData(publishedStoreId);
    expect(live.data.carousel.map((item) => item.title)).toEqual(['Legacy carousel']);

    const response = await new HomescreenController().getHomescreenData(unpublishedStoreId);

    expect(response.data.carousel).toEqual([]);
    expect(response.data.layout).toEqual([]);
    const unpublished = await HomeLayout.findOne({ storeId: unpublishedStoreId }).lean();
    expect(unpublished?.publishedAt).toBeNull();
    expect(unpublished?.sections).toEqual([]);
  });
});

describe('legacyPublishedAt', () => {
  it('uses updatedAt when it is a valid timestamp and now otherwise', () => {
    const updatedAt = new Date('2024-01-02T03:04:05.000Z');
    expect(legacyPublishedAt(updatedAt)).toEqual(updatedAt);
    expect(legacyPublishedAt(updatedAt.toISOString())).toEqual(updatedAt);

    const now = new Date('2026-09-29T00:00:00.000Z');
    expect(legacyPublishedAt(undefined, now)).toEqual(now);
    expect(legacyPublishedAt('not-a-date', now)).toEqual(now);
  });
});
