import CarouselItem from '../models/CarouselItem';
import CategoryGrid from '../models/CategoryGrid';
import CalloutBanner from '../models/CalloutBanner';
import PromoBanner from '../models/PromoBanner';
import CollectionDisplay from '../models/CollectionDisplay';
import CategoryCollectionGrid from '../models/CategoryCollectionGrid';
import CollectionShowcase from '../models/CollectionShowcase';
import HomeLayout, { DEFAULT_HOME_SECTIONS, IHomeLayoutSection } from '../models/HomeLayout';

import shopifyStorefront from '../services/shopifyStorefrontService';
import productEnrichment from '../services/productEnrichmentService';
import { transformShopifyCollection } from '../utils/shopifyTransformers';

import {
  HomescreenResponse,
  HomescreenData,
  CollectionDisplay as CollectionDisplayType,
  LayoutSection,
} from '../types/api/homescreen';
import { Collection } from '../types/api/products';
import { getStoreIdFromRequest } from '../middleware/storeAuth';
import { AuthenticatedRequest } from '../types';
import { ApiError } from '../utils/errors';

/**
 * Homescreen Controller
 * Provides all data needed for the mobile app homescreen
 */
export class HomescreenController {
  /**
   * Get complete homescreen data
   * Returns all components needed to render the mobile app home screen
   * Includes layout array indicating the display order from dashboard configuration
   */
  public async getHomescreenData(storeId: string): Promise<HomescreenResponse & { error?: string; statusCode?: number }> {
    if (!storeId) {
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
          layout: DEFAULT_HOME_SECTIONS.map((s) => ({
            type: s.type,
            position: s.position,
            isVisible: s.isVisible,
          })),
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
    try {
      // Fetch MongoDB data and layout in parallel
      const [
        carousel,
        categoryGrid,
        calloutBanners,
        promoBanners,
        collectionDisplaysRaw,
        categoryCollectionGrid,
        collectionShowcases,
        homeLayout,
      ] = await Promise.all([
        this.getCarouselData(storeId),
        this.getCategoryGrid(storeId),
        this.getCalloutBanners(storeId),
        this.getPromoBanners(storeId),
        this.getCollectionDisplaysRaw(storeId),
        this.getCategoryCollectionGrid(storeId),
        this.getCollectionShowcases(storeId),
        HomeLayout.findOne({ storeId }).lean(),
      ]);

      // Fetch Shopify collections for collectionDisplays
      const collectionDisplays = await this.enrichCollectionDisplays(storeId, collectionDisplaysRaw);

      // Get layout sections from database or use defaults
      const sections: IHomeLayoutSection[] = homeLayout?.sections || DEFAULT_HOME_SECTIONS;

      // Sort by position and convert to response format
      const layout: LayoutSection[] = [...sections]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          type: s.type,
          position: s.position,
          isVisible: s.isVisible,
        }));

      const data: HomescreenData = {
        carousel,
        categoryGrid,
        calloutBanners,
        promoBanners,
        collectionDisplays,
        categoryCollectionGrid,
        collectionShowcases,
        layout,
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
      const isApiError = error instanceof ApiError;
      const expose = isApiError ? error.expose : false;
      return {
        success: false,
        error: expose && error instanceof Error
          ? error.message
          : 'Failed to fetch homescreen data',
        statusCode: isApiError ? error.statusCode : 500,
        data: {
          carousel: [],
          categoryGrid: [],
          calloutBanners: [],
          promoBanners: [],
          collectionDisplays: [],
          categoryCollectionGrid: [],
          collectionShowcases: [],
          layout: DEFAULT_HOME_SECTIONS.map((s) => ({
            type: s.type,
            position: s.position,
            isVisible: s.isVisible,
          })),
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
  private async getCarouselData(storeId: string) {
    const items = await CarouselItem.find({ storeId, isActive: true })
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
  private async getCategoryGrid(storeId: string) {
    return CategoryGrid.find({ storeId, isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title collectionId')
      .lean();
  }

  /**
   * Get callout banners
   */
  private async getCalloutBanners(storeId: string) {
    return CalloutBanner.find({ storeId, isActive: true })
      .sort({ position: 1 })
      .select('imageUrl title subTitle buttonText action backgroundColor textColor buttonColor')
      .lean();
  }

  /**
   * Get promo banners
   */
  private async getPromoBanners(storeId: string) {
    return PromoBanner.find({ storeId, isActive: true })
      .sort({ position: 1 })
      .select('image title subtitle ctaText collectionId backgroundColor textColor buttonColor')
      .lean();
  }

  /**
   * Get raw collection displays (without Shopify data)
   */
  private async getCollectionDisplaysRaw(storeId: string) {
    return CollectionDisplay.find({ storeId, isActive: true })
      .sort({ order: 1 })
      .select('type collectionId order title')
      .lean();
  }

  /**
   * Get category collection grid
   */
  private async getCategoryCollectionGrid(storeId: string) {
    return CategoryCollectionGrid.find({ storeId, isActive: true })
      .sort({ position: 1 })
      .select('title subtitle collections')
      .lean();
  }

  /**
   * Get collection showcases
   */
  private async getCollectionShowcases(storeId: string) {
    return CollectionShowcase.find({ storeId, isActive: true })
      .sort({ position: 1 })
      .select('type title icon collections')
      .lean();
  }

  /**
   * Enrich collection displays with Shopify data
   */
  private async enrichCollectionDisplays(storeId: string, displays: any[]): Promise<CollectionDisplayType[]> {
    const enrichedDisplays = await Promise.all(
      displays.map(async (display) => {
        try {
          // Fetch collection from Shopify
          const shopifyResponse = await shopifyStorefront.getCollectionByIdForStore(
            storeId,
            display.collectionId,
            20
          );

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
          if (error instanceof ApiError) {
            throw error;
          }

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

// Export instance for express routes
export const homescreenController = {
  /**
   * Get homescreen data
   * PUBLIC ENDPOINT - No authentication required
   * Requires X-Store-ID header or storeId query parameter
   */
  getHomescreenData: async (req: any, res: any) => {
    try {
      // Extract storeId from header, query param, or authenticated user
      // This works for both authenticated and guest users
      const storeId = getStoreIdFromRequest(req as AuthenticatedRequest);

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: 'Store ID required. Provide X-Store-ID header or storeId query parameter.'
        });
      }

      const controller = new HomescreenController();
      const result = await controller.getHomescreenData(storeId);
      res.status(result.success ? 200 : result.statusCode || 500).json(result);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch homescreen data'
      });
    }
  },
};
