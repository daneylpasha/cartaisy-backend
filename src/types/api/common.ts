/**
 * Common API Response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * PromoTag for promotional badges on carousel items
 */
export interface PromoTag {
  text?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

/**
 * Action types for navigation
 */
export interface Action {
  type: 'collection' | 'navigation';
  collectionId?: string;
  navigateTo?: string;
}
