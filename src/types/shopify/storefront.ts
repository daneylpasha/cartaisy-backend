/**
 * Shopify Storefront API GraphQL Response Types
 * These represent the raw structure returned by Shopify's GraphQL API
 */

export interface ShopifyMoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyPriceRange {
  minVariantPrice: ShopifyMoneyV2;
  maxVariantPrice: ShopifyMoneyV2;
}

export interface ShopifyImage {
  url: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface ShopifyImageEdge {
  node: ShopifyImage;
}

export interface ShopifyImageConnection {
  edges: ShopifyImageEdge[];
}

export interface ShopifyProductVariant {
  id: string;
  title: string;
  price: ShopifyMoneyV2;
  availableForSale: boolean;
  quantityAvailable?: number;
  sku?: string;
}

export interface ShopifyProductVariantEdge {
  node: ShopifyProductVariant;
}

export interface ShopifyProductVariantConnection {
  edges: ShopifyProductVariantEdge[];
}

export interface ShopifyProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  availableForSale: boolean;
  totalInventory?: number;
  priceRange: ShopifyPriceRange;
  compareAtPriceRange?: ShopifyPriceRange;
  images: ShopifyImageConnection;
  variants: ShopifyProductVariantConnection;
  createdAt: string;
  updatedAt: string;
}

export interface ShopifyProductEdge {
  node: ShopifyProduct;
  cursor: string;
}

export interface ShopifyProductConnection {
  edges: ShopifyProductEdge[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
}

export interface ShopifyCollection {
  id: string;
  title: string;
  description: string;
  handle: string;
  image?: ShopifyImage;
  products: ShopifyProductConnection;
  updatedAt: string;
}

export interface ShopifyCollectionEdge {
  node: ShopifyCollection;
}

export interface ShopifyCollectionConnection {
  edges: ShopifyCollectionEdge[];
}

/**
 * GraphQL query response wrappers
 */
export interface ShopifyCollectionByIdResponse {
  data: {
    collection: ShopifyCollection;
  };
}

export interface ShopifyProductsQueryResponse {
  data: {
    products: ShopifyProductConnection;
  };
}

export interface ShopifyCollectionsQueryResponse {
  data: {
    collections: ShopifyCollectionConnection;
  };
}
