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
