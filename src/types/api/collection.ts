/**
 * Product filter types for collection queries
 */
export interface PriceFilter {
  min?: number;
  max?: number;
}

export interface VariantOptionFilter {
  name: string;
  value: string;
}

export interface ProductFilter {
  available?: boolean;
  price?: PriceFilter;
  productType?: string;
  productVendor?: string;
  variantOption?: VariantOptionFilter;
}

/**
 * Sort options for collection products
 */
export type ProductCollectionSortKey =
  | 'BEST_SELLING'
  | 'COLLECTION_DEFAULT'
  | 'CREATED'
  | 'ID'
  | 'MANUAL'
  | 'PRICE'
  | 'RELEVANCE'
  | 'TITLE';

/**
 * Product item in collection response
 */
export interface CollectionProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  availableForSale: boolean;
  totalInventory: number;
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  currency: string;
  images: Array<{
    url: string;
    altText: string | null;
  }>;
  variants: Array<{
    id: string;
    title: string;
    price: number;
    availableForSale: boolean;
    quantityAvailable: number;
  }>;
}

/**
 * Collection products list response
 */
export interface CollectionProductsData {
  collectionId: string;
  collectionTitle: string;
  collectionDescription: string;
  products: CollectionProduct[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    endCursor: string | null;
    startCursor: string | null;
  };
  totalCount: number;
}

/**
 * Collection products API response
 */
export interface CollectionProductsResponse {
  success: boolean;
  data: CollectionProductsData;
}

/**
 * Request query parameters for fetching collection products
 */
export interface CollectionProductsQuery {
  limit?: number;
  cursor?: string;
  sortKey?: ProductCollectionSortKey;
  filters?: ProductFilter[];
}
