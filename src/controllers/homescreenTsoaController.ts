import {
  Controller,
  Get,
  Header,
  Query,
  Route,
  Tags,
  Response,
  SuccessResponse,
} from 'tsoa';
import { HomescreenController } from './homescreenController';

/**
 * Carousel item for hero section
 */
interface CarouselItemResponse {
  imageUrl: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  endsAt?: string;
  promoTag?: {
    text: string;
    backgroundColor: string;
    textColor: string;
  };
  isActive: boolean;
}

/**
 * Category grid item
 */
interface CategoryGridItemResponse {
  imageUrl: string;
  title: string;
  collectionId: string;
}

/**
 * Callout banner item
 */
interface CalloutBannerItemResponse {
  imageUrl: string;
  title: string;
  subTitle: string;
  buttonText: string;
  action: {
    type: string;
    value: string;
  };
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
}

/**
 * Promo banner item
 */
interface PromoBannerItemResponse {
  image: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
}

/**
 * Collection display item
 */
interface CollectionDisplayResponse {
  type: 'large_row' | 'small_grid' | 'medium_row';
  order: number;
  collection: any;
}

/**
 * Category collection grid item
 */
interface CategoryCollectionGridResponse {
  title: string;
  subtitle: string;
  collections: Array<{
    image: string;
    title: string;
    collectionId: string;
  }>;
}

/**
 * Collection showcase item
 */
interface CollectionShowcaseResponse {
  type: 'grid' | 'circular';
  title: string;
  icon?: string;
  collections: Array<{
    image: string;
    title: string;
    collectionId: string;
  }>;
}

/**
 * Layout section
 */
interface LayoutSectionResponse {
  type: 'carousel' | 'promo_banners' | 'callout_banners' | 'category_grid' | 'collection_displays' | 'collection_showcases' | 'category_collection_grid';
  position: number;
  isVisible: boolean;
}

/**
 * Homescreen metadata
 */
interface HomescreenMetadataResponse {
  carouselItemsCount: number;
  categoryGridItemsCount: number;
  calloutBannersCount: number;
  promoBannersCount: number;
  collectionDisplaysCount: number;
  categoryCollectionGridCount: number;
  collectionShowcasesCount: number;
  lastUpdated: string;
}

/**
 * Complete homescreen data
 */
interface HomescreenDataResponse {
  carousel: CarouselItemResponse[];
  categoryGrid: CategoryGridItemResponse[];
  calloutBanners: CalloutBannerItemResponse[];
  promoBanners: PromoBannerItemResponse[];
  collectionDisplays: CollectionDisplayResponse[];
  categoryCollectionGrid: CategoryCollectionGridResponse[];
  collectionShowcases: CollectionShowcaseResponse[];
  layout: LayoutSectionResponse[];
  metadata: HomescreenMetadataResponse;
}

/**
 * Customer Homescreen Controller
 * Provides all data needed for the mobile app homescreen
 */
@Route('customer/homescreen')
@Tags('Customer Homescreen')
export class HomescreenTsoaController extends Controller {
  /**
   * Get complete homescreen data for the mobile app
   * Returns all components needed to render the mobile app home screen including
   * carousel, category grid, banners, collection displays, and layout configuration.
   *
   * @summary Get homescreen data
   * @param storeId Store ID from header (required)
   * @param storeIdQuery Alternative: Store ID from query parameter
   */
  @Get()
  @SuccessResponse(200, 'Homescreen data retrieved successfully')
  @Response(400, 'Bad Request - Store ID required')
  @Response(500, 'Internal Server Error')
  public async getHomescreenData(
    @Header('x-store-id') storeId?: string,
    @Query('storeId') storeIdQuery?: string
  ): Promise<{
    success: boolean;
    data: HomescreenDataResponse;
    error?: string;
  }> {
    try {
      // Get storeId from header or query param
      const resolvedStoreId = storeId || storeIdQuery;

      if (!resolvedStoreId) {
        this.setStatus(400);
        return {
          success: false,
          data: this.getEmptyData(),
          error: 'Store ID required. Provide X-Store-ID header or storeId query parameter.',
        };
      }

      const controller = new HomescreenController();
      const result = await controller.getHomescreenData(resolvedStoreId);

      this.setStatus(result.success ? 200 : 500);
      return result as any;
    } catch (error: any) {
      console.error('Homescreen TSOA controller error:', error);
      this.setStatus(500);
      return {
        success: false,
        data: this.getEmptyData(),
        error: error.message || 'Failed to fetch homescreen data',
      };
    }
  }

  /**
   * Get empty data structure for error responses
   */
  private getEmptyData(): HomescreenDataResponse {
    return {
      carousel: [],
      categoryGrid: [],
      calloutBanners: [],
      promoBanners: [],
      collectionDisplays: [],
      categoryCollectionGrid: [],
      collectionShowcases: [],
      layout: [
        { type: 'carousel', position: 0, isVisible: true },
        { type: 'category_grid', position: 1, isVisible: true },
        { type: 'promo_banners', position: 2, isVisible: true },
        { type: 'callout_banners', position: 3, isVisible: true },
        { type: 'collection_displays', position: 4, isVisible: true },
        { type: 'collection_showcases', position: 5, isVisible: true },
        { type: 'category_collection_grid', position: 6, isVisible: true },
      ],
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
    };
  }
}
