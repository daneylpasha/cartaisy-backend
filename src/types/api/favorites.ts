/**
 * Favorites response - returns just product IDs for efficient client-side merging
 */
export interface FavoritesResponse {
  success: boolean;
  data: {
    productIds: string[];
  };
}

/**
 * Add/Remove favorite request
 */
export interface FavoriteRequest {
  productId: string;
}

/**
 * Favorite operation response
 */
export interface FavoriteOperationResponse {
  success: boolean;
  message: string;
}

/**
 * Detailed favorites response with full product data and pagination
 */
export interface DetailedFavoritesResponse {
  success: boolean;
  data: {
    products: Record<string, any>[]; // Product documents with same structure as PLP
    pagination: {
      current: number;
      total: number;
      count: number;
      totalProducts: number;
    };
  };
}
