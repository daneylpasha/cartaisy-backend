import { Body, Controller, Get, Header, Post, Query, Request, Route, Security, Tags, Response as TsoaResponse } from '@tsoa/runtime';
import mongoose from 'mongoose';
import shopifyStorefront from '../services/shopifyStorefrontService';
import SearchHistory from '../models/SearchHistory';
import { ApiError } from '../utils/errors';
import {
  PredictiveSearchResponse,
  SearchProductsResponse,
  SearchProduct,
  SearchSortKey,
  RecentSearchesResponse,
  PopularSearchesResponse,
} from '../types/api/search';

/**
 * Shopify Search Controller
 * Implements Shopify-native search using Predictive Search and Product Search APIs
 *
 * Reference: https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
 * Reference: https://shopify.dev/docs/api/storefront/latest/queries/products
 */
@Route('search')
@Tags('Search')
export class ShopifySearchController extends Controller {
  /**
   * Predictive Search - Autocomplete/Suggestions
   * Fast search for autocomplete dropdown (< 100ms typical response time)
   *
   * @param q - Search query (2+ characters recommended)
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant scoping
   * @param limit - Number of results per type (default: 10, max: 10 per Shopify)
   */
  @Get('suggestions')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async shopifyGetSearchSuggestions(
    @Query() q: string,
    @Header('x-store-id') storeId: string,
    @Query() limit?: number
  ): Promise<PredictiveSearchResponse> {
    try {
      if (!q || q.trim().length < 2) {
        throw new ApiError('Search query must be at least 2 characters', 400, true, undefined, true);
      }

      if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
        throw new ApiError('A valid x-store-id header is required', 400, true, undefined, true);
      }

      const effectiveLimit = Math.min(limit || 10, 10); // Shopify limit is 10

      const shopifyResponse = await shopifyStorefront.predictiveSearchForStore(storeId, q.trim(), effectiveLimit);

      if (shopifyResponse?.errors) {
        console.error('Shopify GraphQL errors:', shopifyResponse.errors);
        throw new ApiError(`Shopify API error: ${shopifyResponse.errors[0]?.message || 'Unknown error'}`, 502);
      }

      if (!shopifyResponse?.data?.predictiveSearch) {
        throw new ApiError('Invalid response from Shopify', 502);
      }

      const { products, collections } = shopifyResponse.data.predictiveSearch;

      const totalResults = products.length + collections.length;

      // Optionally track search in history (async, don't await)
      this.trackSearch(q.trim(), totalResults, storeId).catch((err) =>
        console.error('Error tracking search:', err)
      );

      return {
        success: true,
        data: {
          query: q.trim(),
          products: products || [],
          collections: collections || [],
          totalResults,
        },
      };
    } catch (error) {
      console.error('Error in predictive search:', error);
      throw error;
    }
  }

  /**
   * Full Product Search - Search Results Page
   * Comprehensive search with pagination, filtering, and sorting
   *
   * Shopify search query syntax:
   * - "laptop" - Simple keyword
   * - "title:laptop" - Search in title only
   * - "tag:electronics" - Filter by tag
   * - "vendor:Apple" - Filter by vendor
   * - "product_type:Computers" - Filter by product type
   * - "available:true" - Only available products
   *
   * @param q - Search query
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant scoping
   * @param limit - Results per page (default: 20)
   * @param cursor - Pagination cursor
   * @param sortKey - Sort order
   * @param reverse - Reverse sort (for high to low)
   */
  @Get('products')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async searchProducts(
    @Query() q: string,
    @Header('x-store-id') storeId: string,
    @Query() limit?: number,
    @Query() cursor?: string,
    @Query() sortKey?: SearchSortKey,
    @Query() reverse?: boolean
  ): Promise<SearchProductsResponse> {
    try {
      if (!q || q.trim().length < 2) {
        throw new ApiError('Search query must be at least 2 characters', 400, true, undefined, true);
      }

      if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
        throw new ApiError('A valid x-store-id header is required', 400, true, undefined, true);
      }

      const effectiveLimit = limit || 20;
      const effectiveSortKey = sortKey || 'RELEVANCE';
      const effectiveReverse = reverse || false;

      const shopifyResponse = await shopifyStorefront.searchProductsForStore(storeId, q.trim(), {
        limit: effectiveLimit,
        cursor,
        sortKey: effectiveSortKey,
        reverse: effectiveReverse,
      });

      if (shopifyResponse?.errors) {
        console.error('Shopify GraphQL errors:', shopifyResponse.errors);
        throw new ApiError(`Shopify API error: ${shopifyResponse.errors[0]?.message || 'Unknown error'}`, 502);
      }

      if (!shopifyResponse?.data?.products) {
        throw new ApiError('Invalid response from Shopify', 502);
      }

      const products = this.transformProducts(shopifyResponse.data.products.edges);
      const pageInfo = shopifyResponse.data.products.pageInfo;

      // Track search in history (async, don't await)
      this.trackSearch(q.trim(), products.length, storeId, {
        sortKey: effectiveSortKey,
        reverse: effectiveReverse,
      }).catch((err) => console.error('Error tracking search:', err));

      return {
        success: true,
        data: {
          query: q.trim(),
          products,
          pageInfo,
          totalCount: products.length,
          sortKey: effectiveSortKey,
          reverse: effectiveReverse,
        },
      };
    } catch (error) {
      console.error('Error in product search:', error);
      throw error;
    }
  }

  /**
   * Track Product Click
   * Track when user clicks on a search result
   *
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant scoping
   * @param query - The search query
   * @param productId - The clicked product ID
   */
  @Post('track-click')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async trackProductClick(
    @Header('x-store-id') storeId: string,
    @Body() body: { query: string; productId: string }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { query, productId } = body;

      if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
        throw new ApiError('A valid x-store-id header is required', 400, true, undefined, true);
      }

      if (!query || !productId) {
        throw new ApiError('Query and productId are required', 400, true, undefined, true);
      }

      // Find the most recent search for this store with this query and update it.
      // Scoping by storeId prevents a click in one store from overwriting another
      // store's search record (cross-tenant analytics corruption).
      await SearchHistory.findOneAndUpdate(
        {
          storeId: new mongoose.Types.ObjectId(storeId),
          query: query.toLowerCase().trim(),
        },
        { selectedProduct: productId },
        { sort: { createdAt: -1 } }
      );

      return {
        success: true,
        message: 'Click tracked successfully',
      };
    } catch (error) {
      console.error('Error tracking product click:', error);
      throw error;
    }
  }

  /**
   * Get Popular Searches
   * Returns most frequently searched terms, scoped to the requesting store
   *
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant scoping
   * @param limit - Number of results (default: 10)
   * @param days - Days to look back (default: 30)
   */
  @Get('popular')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async shopifyGetPopularSearches(
    @Header('x-store-id') storeId: string,
    @Query() limit?: number,
    @Query() days?: number
  ): Promise<PopularSearchesResponse> {
    try {
      if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
        throw new ApiError('A valid x-store-id header is required', 400, true, undefined, true);
      }

      const effectiveLimit = limit || 10;
      const effectiveDays = days || 30;

      const searches = await SearchHistory.getPopularSearches(effectiveLimit, effectiveDays, storeId);

      return {
        success: true,
        data: {
          searches,
          count: searches.length,
        },
      };
    } catch (error) {
      console.error('Error fetching popular searches:', error);
      throw error;
    }
  }

  /**
   * Get User's Recent Searches
   * Returns authenticated user's recent search history
   */
  @Get('history')
  @Security('jwt')
  @TsoaResponse(401, 'Unauthorized')
  @TsoaResponse(500, 'Internal Server Error')
  public async getRecentSearches(
    @Request() request: any,
    @Query() limit?: number
  ): Promise<RecentSearchesResponse> {
    try {
      const userId = request.user._id.toString();
      const effectiveLimit = limit || 10;

      const searches = await SearchHistory.getUserRecentSearches(userId, effectiveLimit);

      return {
        success: true,
        data: {
          searches,
          count: searches.length,
        },
      };
    } catch (error) {
      console.error('Error fetching user search history:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Clear User's Search History
   * Deletes authenticated user's search history
   */
  @Post('history/clear')
  @Security('jwt')
  @TsoaResponse(401, 'Unauthorized')
  @TsoaResponse(500, 'Internal Server Error')
  public async clearSearchHistory(
    @Request() request: any
  ): Promise<{ success: boolean; message: string; deletedCount: number }> {
    try {
      const userId = request.user._id;

      const result = await SearchHistory.deleteMany({ userId });

      return {
        success: true,
        message: 'Search history cleared successfully',
        deletedCount: result.deletedCount || 0,
      };
    } catch (error) {
      console.error('Error clearing search history:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Transform Shopify product edges to API format
   */
  private transformProducts(
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
          minVariantPrice: { amount: string; currencyCode: string };
          maxVariantPrice: { amount: string; currencyCode: string };
        };
        compareAtPriceRange: {
          minVariantPrice: { amount: string; currencyCode: string } | null;
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
              price: { amount: string; currencyCode: string };
              availableForSale: boolean;
              quantityAvailable: number;
              selectedOptions: Array<{ name: string; value: string }>;
            };
          }>;
        };
      };
    }>
  ): SearchProduct[] {
    return edges.map((edge) => {
      const node = edge.node;

      const images = (node.images?.edges || []).map((imgEdge) => ({
        url: imgEdge.node.url,
        altText: imgEdge.node.altText,
      }));

      const variants = (node.variants?.edges || []).map((variantEdge) => ({
        id: variantEdge.node.id,
        title: variantEdge.node.title,
        price: parseFloat(variantEdge.node.price?.amount || '0'),
        availableForSale: variantEdge.node.availableForSale,
        quantityAvailable: variantEdge.node.quantityAvailable || 0,
        selectedOptions: variantEdge.node.selectedOptions || [],
      }));

      return {
        id: node.id,
        title: node.title,
        description: node.description || '',
        handle: node.handle,
        vendor: node.vendor || '',
        productType: node.productType || '',
        tags: node.tags || [],
        availableForSale: node.availableForSale,
        totalInventory: node.totalInventory || 0,
        minPrice: parseFloat(node.priceRange?.minVariantPrice?.amount || '0'),
        maxPrice: parseFloat(node.priceRange?.maxVariantPrice?.amount || '0'),
        compareAtPrice: node.compareAtPriceRange?.minVariantPrice?.amount
          ? parseFloat(node.compareAtPriceRange.minVariantPrice.amount)
          : null,
        currency: node.priceRange?.minVariantPrice?.currencyCode || 'USD',
        images,
        variants,
      };
    });
  }

  /**
   * Track search in history (best practice: async, non-blocking)
   */
  private async trackSearch(
    query: string,
    resultsCount: number,
    storeId?: string,
    filters?: { sortKey?: SearchSortKey; reverse?: boolean }
  ): Promise<void> {
    try {
      await SearchHistory.create({
        storeId: storeId && mongoose.Types.ObjectId.isValid(storeId)
          ? new mongoose.Types.ObjectId(storeId)
          : undefined,
        query: query.toLowerCase().trim(),
        resultsCount,
        hasResults: resultsCount > 0,
        filters,
      });
    } catch (error) {
      // Log but don't throw - tracking shouldn't break the search
      console.error('Error tracking search:', error);
    }
  }
}
