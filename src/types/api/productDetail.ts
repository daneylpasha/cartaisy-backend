/**
 * Product variant option (color, size, etc.)
 */
export interface ProductOption {
  name: string;
  value: string;
}

/**
 * Product metafield (custom field from Shopify)
 */
export interface ProductMetafield {
  namespace: string;
  key: string;
  value: string;
  type: string;
  description?: string;
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

  // Metafields (custom fields from Shopify)
  metafields: ProductMetafield[];

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
