/**
 * Product variant option (color, size, etc.)
 */
export interface ProductOption {
  name: string;
  value: string;
}

/**
 * Product variant details
 */
export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  compareAtPrice?: number;
  availableForSale: boolean;
  quantityAvailable: number;
  selectedOptions: ProductOption[];
  image?: string;
}

/**
 * Product badges
 */
export interface ProductBadges {
  isBestSeller: boolean;
  discountPercentage?: number;
}

/**
 * Complete product detail
 */
export interface ProductDetail {
  productId: string;
  title: string;
  description: string;
  descriptionHtml: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  currency: string;
  vendor: string;
  productType: string;
  tags: string[];
  handle: string;

  // Stock
  availableForSale: boolean;
  totalInventory: number;
  inStock: boolean;

  // Variants
  variants: ProductVariant[];

  // MongoDB enrichment
  rating: number;
  reviewsCount: number;
  soldThisMonth: number;
  badges: ProductBadges;
}

/**
 * Product detail API response
 */
export interface ProductDetailResponse {
  success: boolean;
  data: ProductDetail;
}
