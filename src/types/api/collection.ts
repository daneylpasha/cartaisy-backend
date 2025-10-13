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
  | 'TITLE'
  | 'DISCOUNT'; // Custom sort by discount percentage (backend-only)

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
    selectedOptions?: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

/**
 * Facet option with count
 */
export interface FacetOption {
  value: string;
  count: number;
  label?: string;
}

/**
 * Price range facet
 */
export interface PriceRangeFacet {
  min: number;
  max: number;
}

/**
 * Collection facets for filtering
 */
export interface CollectionFacets {
  categories: FacetOption[];
  vendors: FacetOption[];
  priceRange: PriceRangeFacet;
  colors?: FacetOption[];
  tags?: FacetOption[];
}

/**
 * Collection products list response
 */
export interface CollectionProductsData {
  collectionId: string;
  collectionTitle: string;
  collectionDescription: string;
  products: CollectionProduct[];
  facets: CollectionFacets;
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
