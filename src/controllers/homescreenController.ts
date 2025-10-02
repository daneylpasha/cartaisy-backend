import { Get, Route, Tags, Response } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import CarouselItem from '../models/CarouselItem';
import CategoryGrid from '../models/CategoryGrid';
import CalloutBanner from '../models/CalloutBanner';
import PromoBanner from '../models/PromoBanner';
import CollectionDisplay from '../models/CollectionDisplay';
import CategoryCollectionGrid from '../models/CategoryCollectionGrid';
import CollectionShowcase from '../models/CollectionShowcase';

import shopifyStorefront from '../services/shopifyStorefrontService';
import productEnrichment from '../services/productEnrichmentService';
import { transformShopifyCollection } from '../utils/shopifyTransformers';

import {
  HomescreenResponse,
  HomescreenData,
  CollectionDisplay as CollectionDisplayType,
} from '../types/api/homescreen';
import { Collection } from '../types/api/products';

/**
 * Homescreen Controller
 * Provides all data needed for the mobile app homescreen
 */
@Route('customer')
@Tags('Homescreen')
export class HomescreenController extends Controller {
  /**
   * Get complete homescreen data
   * Returns all components needed to render the mobile app home screen
   */
  @Get('homescreen')
  @Response(500, 'Internal Server Error')
  public async getHomescreenData(): Promise<HomescreenResponse> {
    try {
      // Fetch MongoDB data in parallel
      const [
        carousel,
        categoryGrid,
        calloutBanners,
        promoBanners,
        collectionDisplaysRaw,
        categoryCollectionGrid,
        collectionShowcases,
      ] = await Promise.all([
        this.getCarouselData(),
        this.getCategoryGrid(),
        this.getCalloutBanners(),
        this.getPromoBanners(),
        this.getCollectionDisplaysRaw(),
        this.getCategoryCollectionGrid(),
        this.getCollectionShowcases(),
      ]);

      // Fetch Shopify collections for collectionDisplays
      const collectionDisplays = await this.enrichCollectionDisplays(collectionDisplaysRaw);

      const data: HomescreenData = {
        carousel,
        categoryGrid,
        calloutBanners,
        promoBanners,
        collectionDisplays,
        categoryCollectionGrid,
        collectionShowcases,
        metadata: {
          carouselItemsCount: carousel.length,
          categoryGridItemsCount: categoryGrid.length,
          calloutBannersCount: calloutBanners.length,
          promoBannersCount: promoBanners.length,
          collectionDisplaysCount: collectionDisplays.length,
          categoryCollectionGridCount: categoryCollectionGrid.length,
          collectionShowcasesCount: collectionShowcases.length,
          lastUpdated: new Date().toISOString(),
        },
      };

      return {
        success: true,
        data,
      };
    } catch (error) {
      console.error('Error fetching homescreen data:', error instanceof Error ? error.message : 'Unknown error');
      this.setStatus(500);
      return {
        success: false,
        data: {
          carousel: [],
          categoryGrid: [],
          calloutBanners: [],
          promoBanners: [],
          collectionDisplays: [],
          categoryCollectionGrid: [],
          collectionShowcases: [],
          metadata: {
            carouselItemsCount: 0,
            categoryGridItemsCount: 0,
            calloutBannersCount: 0,
            promoBannersCount: 0,
            collectionDisplaysCount: 0,
            categoryCollectionGridCount: 0,
            collectionShowcasesCount: 0,
            lastUpdated: new Date().toISOString(),
          },
        },
      };
    }
  }

  /**
   * Get carousel data
   */
  private async getCarouselData() {
    const items = await CarouselItem.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl label title subtitle ctaText collectionId endsAt promoTag isActive')
      .lean();

    // Transform to match API type (convert Date to ISO string)
    return items.map(item => ({
      imageUrl: item.imageUrl,
      title: item.title,
      subtitle: item.subtitle,
      ctaText: item.ctaText,
      collectionId: item.collectionId,
      endsAt: item.endsAt ? item.endsAt.toISOString() : undefined,
      promoTag: item.promoTag,
      isActive: item.isActive
    }));
  }

  /**
   * Get category grid
   */
  private async getCategoryGrid() {
    return CategoryGrid.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title collectionId')
      .lean();
  }

  /**
   * Get callout banners
   */
  private async getCalloutBanners() {
    return CalloutBanner.find({ isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title subTitle buttonText action backgroundColor textColor buttonColor')
      .lean();
  }

  /**
   * Get promo banners
   */
  private async getPromoBanners() {
    return PromoBanner.find({ isActive: true })
      .sort({ position: 1 })
      .select('image title subtitle ctaText collectionId backgroundColor textColor buttonColor')
      .lean();
  }

  /**
   * Get raw collection displays (without Shopify data)
   */
  private async getCollectionDisplaysRaw() {
    return CollectionDisplay.find({ isActive: true })
      .sort({ order: 1 })
      .select('type collectionId order title')
      .lean();
  }

  /**
   * Get category collection grid
   */
  private async getCategoryCollectionGrid() {
    return CategoryCollectionGrid.find({ isActive: true })
      .sort({ position: 1 })
      .select('title subtitle collections')
      .lean();
  }

  /**
   * Get collection showcases
   */
  private async getCollectionShowcases() {
    return CollectionShowcase.find({ isActive: true })
      .sort({ position: 1 })
      .select('type title icon collections')
      .lean();
  }

  /**
   * Enrich collection displays with Shopify data
   */
  private async enrichCollectionDisplays(displays: any[]): Promise<CollectionDisplayType[]> {
    if (!shopifyStorefront.isConfigured()) {
      console.warn('Shopify not configured, returning empty collection displays');
      return [];
    }

    const enrichedDisplays = await Promise.all(
      displays.map(async (display) => {
        try {
          // Fetch collection from Shopify
          const shopifyResponse = await shopifyStorefront.getCollectionById(display.collectionId, 20);

          if (!shopifyResponse?.data?.collection) {
            console.warn(`Collection ${display.collectionId} not found in Shopify`);
            return null;
          }

          // Transform Shopify collection
          const transformedCollection = transformShopifyCollection(shopifyResponse.data.collection);

          // Enrich products with ratings
          const enrichedProducts = await productEnrichment.enrichProducts(
            transformedCollection.products || []
          );

          const collection: Collection = {
            ...transformedCollection,
            products: enrichedProducts,
          };

          return {
            type: display.type,
            order: display.order,
            collection,
          };
        } catch (error) {
          console.error(
            `Failed to fetch collection ${display.collectionId}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
          return null;
        }
      })
    );

    // Filter out failed fetches
    return enrichedDisplays.filter((display) => display !== null) as CollectionDisplayType[];
  }
}

// Export instance for non-tsoa routes (backward compatibility)
export const homescreenController = {
  getHomescreenData: async (req: any, res: any) => {
    const controller = new HomescreenController();
    const result = await controller.getHomescreenData();
    res.status(result.success ? 200 : 500).json(result);
  },
};
