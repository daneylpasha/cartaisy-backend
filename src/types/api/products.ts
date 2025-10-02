/**
 * Product information (enriched from Shopify + MongoDB)
 */
export interface Product {
  productId: string;
  title: string;
  description?: string;
  images: string[];
  price: number;
  compareAtPrice?: number;
  currency: string;
  inStock: boolean;
  availableQuantity: number;
  totalQuantity: number;

  // MongoDB enrichment
  rating: number;
  reviewsCount: number;

  // Optional fields
  handle?: string;
  vendor?: string;
  tags?: string[];
}

/**
 * Product variant information
 */
export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  available: boolean;
  sku?: string;
}

/**
 * Collection information from Shopify
 */
export interface Collection {
  id: string;
  title: string;
  description?: string;
  handle?: string;
  image?: string;
  products: Product[];
}
