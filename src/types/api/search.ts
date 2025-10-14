/**
 * Search API Types
 * Based on Shopify Storefront API documentation
 * https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
 * https://shopify.dev/docs/api/storefront/latest/queries/products
 */

// =============================================================================
// PREDICTIVE SEARCH TYPES (Autocomplete)
// =============================================================================

export interface PredictiveSearchProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  compareAtPriceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
}

export interface PredictiveSearchCollection {
  id: string;
  title: string;
  handle: string;
  image: {
    url: string;
    altText: string | null;
  } | null;
}

export interface PredictiveSearchResponse {
  success: boolean;
  data: {
    query: string;
    products: PredictiveSearchProduct[];
    collections: PredictiveSearchCollection[];
    totalResults: number;
  };
}

// =============================================================================
// FULL SEARCH TYPES (Search Results Page)
// =============================================================================

export interface SearchProduct {
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
    selectedOptions: Array<{
      name: string;
      value: string;
    }>;
  }>;
}

export interface SearchPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  endCursor: string | null;
  startCursor: string | null;
}

export type SearchSortKey =
  | 'RELEVANCE'
  | 'PRICE'
  | 'BEST_SELLING'
  | 'CREATED_AT'
  | 'TITLE'
  | 'PRODUCT_TYPE'
  | 'VENDOR';

export interface SearchProductsResponse {
  success: boolean;
  data: {
    query: string;
    products: SearchProduct[];
    pageInfo: SearchPageInfo;
    totalCount: number;
    sortKey: SearchSortKey;
    reverse: boolean;
  };
}

// =============================================================================
// SEARCH HISTORY TYPES
// =============================================================================

export interface SearchHistoryEntry {
  _id: string;
  userId?: string; // Optional for guest searches
  query: string;
  resultsCount: number;
  hasResults: boolean;
  selectedProduct?: string; // Product ID if user clicked a result
  filters?: {
    sortKey?: SearchSortKey;
    reverse?: boolean;
    minPrice?: number;
    maxPrice?: number;
  };
  createdAt: Date;
}

export interface PopularSearchItem {
  query: string;
  searchCount: number;
  avgResultsCount: number;
}

export interface RecentSearchesResponse {
  success: boolean;
  data: {
    searches: Array<{
      query: string;
      resultsCount: number;
      searchedAt: Date;
    }>;
    count: number;
  };
}

export interface PopularSearchesResponse {
  success: boolean;
  data: {
    searches: PopularSearchItem[];
    count: number;
  };
}

// =============================================================================
// SHOPIFY GRAPHQL RESPONSE TYPES (Internal)
// =============================================================================

export interface ShopifyPredictiveSearchResponse {
  data: {
    predictiveSearch: {
      products: Array<{
        id: string;
        title: string;
        handle: string;
        vendor: string;
        productType: string;
        tags: string[];
        featuredImage: {
          url: string;
          altText: string | null;
        } | null;
        priceRange: {
          minVariantPrice: {
            amount: string;
            currencyCode: string;
          };
        };
        compareAtPriceRange: {
          minVariantPrice: {
            amount: string;
            currencyCode: string;
          } | null;
        } | null;
      }>;
      collections: Array<{
        id: string;
        title: string;
        handle: string;
        image: {
          url: string;
          altText: string | null;
        } | null;
      }>;
    };
  };
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
}

export interface ShopifySearchProductsResponse {
  data: {
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          description: string;
          handle: string;
          vendor: string;
          productType: string;
          tags: string[];
          availableForSale: boolean;
          totalInventory: number;
          priceRange: {
            minVariantPrice: {
              amount: string;
              currencyCode: string;
            };
            maxVariantPrice: {
              amount: string;
              currencyCode: string;
            };
          };
          compareAtPriceRange: {
            minVariantPrice: {
              amount: string;
              currencyCode: string;
            } | null;
          } | null;
          images: {
            edges: Array<{
              node: {
                url: string;
                altText: string | null;
              };
            }>;
          };
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                price: {
                  amount: string;
                  currencyCode: string;
                };
                availableForSale: boolean;
                quantityAvailable: number;
                selectedOptions: Array<{
                  name: string;
                  value: string;
                }>;
              };
            }>;
          };
        };
        cursor: string;
      }>;
      pageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        endCursor: string | null;
        startCursor: string | null;
      };
    };
  };
  errors?: Array<{
    message: string;
    extensions?: Record<string, unknown>;
  }>;
}
