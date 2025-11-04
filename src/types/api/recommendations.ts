/**
 * Types for Recommendations API
 * Used by TSOA for OpenAPI schema generation
 */

import { ProductVariant } from './productDetail';

/**
 * Product image information
 */
export interface RecommendationProductImage {
  /** Image URL */
  url: string;
  /** Alt text */
  alt: string;
  /** Position in gallery */
  position: number;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
}

/**
 * Simplified product object for API responses
 */
export interface RecommendedProduct {
  /** MongoDB ID */
  _id: string;
  /** Shopify product ID */
  shopifyProductId?: string;
  /** Product title */
  title: string;
  /** Product description */
  description: string;
  /** URL handle */
  handle: string;
  /** Vendor/brand */
  vendor: string;
  /** Product type/category */
  productType: string;
  /** Product tags */
  tags: string[];
  /** Product status */
  status: string;
  /** Base price */
  price: number;
  /** Compare at price */
  compareAtPrice?: number;
  /** Product images */
  images: RecommendationProductImage[];
  /** Product variants */
  variants: ProductVariant[];
}

/**
 * Recommendation request for cart items
 */
export interface CartRecommendationsRequest {
  /** Array of Shopify product IDs currently in the cart */
  cartItems: string[];
}

/**
 * Base response structure for recommendations
 */
export interface RecommendationsBaseResponse {
  /** Indicates if the request was successful */
  success: boolean;
  /** Error message if success is false */
  error?: string;
}

/**
 * Product recommendations response for PDP
 */
export interface ProductRecommendationsResponse extends RecommendationsBaseResponse {
  data: {
    /** Array of recommended products with full product details */
    recommendedProducts: RecommendedProduct[];
    /** Source of recommendations (product or cart) */
    basedOn: 'product';
    /** The Shopify product ID that recommendations are based on */
    sourceProductId: string;
    /** Number of recommendations returned */
    count: number;
  };
}

/**
 * Cart recommendations response
 */
export interface CartRecommendationsResponse extends RecommendationsBaseResponse {
  data: {
    /** Array of recommended products with full product details */
    recommendedProducts: RecommendedProduct[];
    /** Source of recommendations (product or cart) */
    basedOn: 'cart';
    /** Number of items in the cart that recommendations are based on */
    cartItemsCount: number;
    /** Number of recommendations returned */
    count: number;
  };
}
