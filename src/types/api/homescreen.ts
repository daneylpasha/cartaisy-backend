import { PromoTag, Action } from './common';
import { Collection } from './products';

/**
 * Carousel item for hero section
 */
export interface CarouselItem {
  imageUrl: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  endsAt?: string;
  promoTag?: PromoTag;
  isActive: boolean;
}

/**
 * Category grid item for icon-based navigation
 */
export interface CategoryGridItem {
  imageUrl: string;
  title: string;
  collectionId: string;
  isActive: boolean;
}

/**
 * Callout banner for promotional announcements
 */
export interface CalloutBannerItem {
  imageUrl: string;
  title: string;
  subTitle: string;
  buttonText: string;
  action: Action;
  position: number;
  isActive: boolean;
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
}

/**
 * Promo banner for promotional deals
 */
export interface PromoBannerItem {
  image: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  position: number;
  isActive: boolean;
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
}

/**
 * Collection display with dynamic UI layouts
 */
export interface CollectionDisplay {
  type: 'large_row' | 'small_grid' | 'medium_row';
  order: number;
  collection: Collection;
}

/**
 * Collection item within category collection grid
 */
export interface CategoryCollectionItem {
  image: string;
  title: string;
  collectionId: string;
}

/**
 * Category collection grid for recommendations
 */
export interface CategoryCollectionGridItem {
  title: string;
  subtitle: string;
  collections: CategoryCollectionItem[];
  position: number;
  isActive: boolean;
}

/**
 * Collection item within showcase
 */
export interface ShowcaseCollectionItem {
  image: string;
  title: string;
  collectionId: string;
}

/**
 * Collection showcase with different UI types
 */
export interface CollectionShowcaseItem {
  type: 'grid' | 'circular';
  title: string;
  icon?: string;
  collections: ShowcaseCollectionItem[];
  position: number;
  isActive: boolean;
}

/**
 * Homescreen metadata
 */
export interface HomescreenMetadata {
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
export interface HomescreenData {
  carousel: CarouselItem[];
  categoryGrid: CategoryGridItem[];
  calloutBanners: CalloutBannerItem[];
  promoBanners: PromoBannerItem[];
  collectionDisplays: CollectionDisplay[];
  categoryCollectionGrid: CategoryCollectionGridItem[];
  collectionShowcases: CollectionShowcaseItem[];
  metadata: HomescreenMetadata;
}

/**
 * Homescreen API response
 */
export interface HomescreenResponse {
  success: boolean;
  data: HomescreenData;
}
