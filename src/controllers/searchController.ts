import { Body, Controller, Get, Header, Post, Query, Request, Route, Security, Tags, Response as TsoaResponse } from 'tsoa';
import mongoose from 'mongoose';
import SearchHistory from '../models/SearchHistory';
import ProductView from '../models/ProductView';
import CollectionView from '../models/CollectionView';
import ShopifyStorefrontService from '../services/shopifyStorefrontService';
import productEnrichment from '../services/productEnrichmentService';
import { transformShopifyCollection, transformShopifyProductEdges } from '../utils/shopifyTransformers';
import { ApiError } from '../utils/errors';
import {
  InitialSearchScreenResponse,
  SearchContextResponse,
} from '../types/api/search';

/**
 * Search Controller
 * Comprehensive search functionality including product search, suggestions, analytics, and search context
 */
@Route('customer/search')
@Tags('Search')
export class SearchController extends Controller {
  private validateStoreId(storeId?: string): string {
    if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
      throw new ApiError('A valid x-store-id header is required', 400, true, undefined, true);
    }

    return storeId;
  }

  private throwStorefrontSearchError(error: unknown): never {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      'Failed to fetch tenant-scoped Storefront search results',
      502,
      true,
      undefined,
      true
    );
  }

  private setErrorStatus(error: unknown): void {
    if (error instanceof ApiError) {
      this.setStatus(error.statusCode);
    } else {
      this.setStatus(500);
    }
  }

  /**
   * Get Initial Search Screen Data
   * Returns trending products and collections for the search screen with complete data including images, ratings, and enriched product information.
   * Products and collections match the homescreen data format for UI component reuse.
   *
   * @param limit - Number of items to return (default: 10)
   * @param timeframe - Timeframe in days for trending calculation (default: 7)
   */
  @Get('initial-screen')
  @TsoaResponse(500, 'Internal Server Error')
  public async getInitialSearchScreen(
    @Query() limit?: number,
    @Query() timeframe?: number
  ): Promise<InitialSearchScreenResponse> {
    try {
      const limitNum = limit || 10;
      const timeframeNum = timeframe || 7;

      // Fetch all data in parallel for better performance
      const [trendingProductsData, trendingCollections] = await Promise.all([
        ProductView.getTrendingProducts(limitNum, timeframeNum),
        CollectionView.getTrendingCollections(limitNum, timeframeNum)
      ]);

      // Extract just the product documents (already populated from aggregation)
      let trendingProducts = trendingProductsData.map((item: any) => item.product);
      let usedProductFallback = false;

      // Fallback: Fetch products from Shopify if no trending products
      if (trendingProducts.length === 0) {
        try {
          const shopifyProductsResponse = await ShopifyStorefrontService.getProducts(limitNum);

          if (shopifyProductsResponse?.data?.products?.edges) {
            // Transform Shopify products to our format
            const transformedProducts = transformShopifyProductEdges(shopifyProductsResponse.data.products.edges);

            // Enrich products with ratings (match homescreen format)
            trendingProducts = await productEnrichment.enrichProducts(transformedProducts);
            usedProductFallback = true;
          }
        } catch (error) {
          console.error('Error fetching Shopify products as fallback:', error);
          // Keep trendingProducts as empty array if Shopify fetch fails
        }
      } else {
        // Enrich products with ratings (match homescreen format)
        trendingProducts = await productEnrichment.enrichProducts(trendingProducts);
      }

      // Fallback: Fetch collections from Shopify if no trending collections
      let finalCollections = trendingCollections;

      if (finalCollections.length === 0) {
        try {
          const shopifyCollectionsResponse = await ShopifyStorefrontService.getCollections(limitNum);

          // Fetch full collection data with products (match homescreen format)
          const enrichedCollections = await Promise.all(
            shopifyCollectionsResponse.data.collections.edges.map(async (edge: any) => {
              try {
                const collectionId = edge.node.id;

                // Fetch full collection with products
                const fullCollectionResponse = await ShopifyStorefrontService.getCollectionById(collectionId, 20);

                if (!fullCollectionResponse?.data?.collection) {
                  return null;
                }

                // Transform collection (like homescreen does)
                const transformedCollection = transformShopifyCollection(fullCollectionResponse.data.collection);

                // Enrich products with ratings (like homescreen does)
                const enrichedProducts = await productEnrichment.enrichProducts(
                  transformedCollection.products || []
                );

                return {
                  ...transformedCollection,
                  products: enrichedProducts
                };
              } catch (error) {
                console.error('Error fetching collection details:', error);
                return null;
              }
            })
          );

          // Filter out failed fetches
          finalCollections = enrichedCollections.filter(c => c !== null);
        } catch (error) {
          console.error('Error fetching Shopify collections as fallback:', error);
          // Keep finalCollections as empty array if Shopify fetch fails
        }
      }

      return {
        success: true,
        data: {
          trendingProducts,
          trendingCollections: finalCollections,
          metadata: {
            timeframe: timeframeNum,
            productsCount: trendingProducts.length,
            collectionsCount: finalCollections.length,
            lastUpdated: new Date().toISOString(),
            isFallback: {
              products: usedProductFallback,
              collections: trendingCollections.length === 0
            }
          }
        }
      };
    } catch (error) {
      console.error('Error getting initial search screen data:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Get Search Context Data
   * Returns personalized search context with enriched product/collection data for recent and trending searches.
   * Authentication is optional - recent searches only included for authenticated users.
   *
   * @param request - Express request with optional user auth
   * @param limit - Number of items to return per category (default: 5, max 5)
   * @param timeframe - Timeframe in days for trending calculation (default: 7)
   */
  @Get('context')
  @Security('jwt-optional')
  @TsoaResponse(500, 'Internal Server Error')
  public async getSearchContext(
    @Request() request: any,
    @Query() limit?: number,
    @Query() timeframe?: number
  ): Promise<SearchContextResponse> {
    try {
      const limitNum = Math.min(limit || 5, 5); // Max 5 for performance
      const timeframeNum = timeframe || 7;
      const userId = request.user?.id;

      // Fetch enriched searches from database (products/collections only)
      const promises: Promise<any>[] = [
        SearchHistory.getTrendingEnrichedSearches(limitNum, timeframeNum), // Trending searches
        ProductView.getTrendingProducts(10, timeframeNum) // Bonus trending products
      ];

      // Add recent searches if user is authenticated
      if (userId) {
        promises.push(SearchHistory.getUserEnrichedSearches(userId, limitNum));
      } else {
        promises.push(Promise.resolve([])); // Empty for guests
      }

      const [trendingSearchesRaw, trendingProductsData, recentSearchesRaw] = await Promise.all(promises);

      // Helper function to enrich a single search item
      const enrichSearchItem = async (item: any): Promise<any | null> => {
        try {
          if (item.searchType === 'product' && item.selectedProductId) {
            // Fetch product from Shopify
            const productResponse = await ShopifyStorefrontService.getProductById(item.selectedProductId);

            if (productResponse?.data?.product) {
              // Transform and enrich product
              const transformedProduct = transformShopifyProductEdges([{ node: productResponse.data.product, cursor: '' }] as any)[0];
              const enrichedProducts = await productEnrichment.enrichProducts([transformedProduct]);

              return {
                query: item.query,
                searchedAt: item.searchedAt,
                type: 'product' as const,
                productId: item.selectedProductId,
                product: enrichedProducts[0]
              };
            }
          } else if (item.searchType === 'collection' && item.selectedCollectionId) {
            // Fetch collection from Shopify
            const collectionResponse = await ShopifyStorefrontService.getCollectionById(item.selectedCollectionId, 20);

            if (collectionResponse?.data?.collection) {
              // Transform and enrich collection
              const transformedCollection = transformShopifyCollection(collectionResponse.data.collection);
              const enrichedProducts = await productEnrichment.enrichProducts(
                transformedCollection.products || []
              );

              return {
                query: item.query,
                searchedAt: item.searchedAt,
                type: 'collection' as const,
                collectionId: item.selectedCollectionId,
                collection: {
                  ...transformedCollection,
                  products: enrichedProducts
                }
              };
            }
          }

          return null;
        } catch (error) {
          console.error(`Error enriching search item (${item.searchType}):`, error);
          return null;
        }
      };

      // Enrich recent searches with complete Shopify data
      const recentSearchesPromises = recentSearchesRaw.map(enrichSearchItem);
      const recentSearchesResults = await Promise.all(recentSearchesPromises);
      const recentSearches = recentSearchesResults.filter(item => item !== null);

      // Enrich trending searches with complete Shopify data + metrics
      const trendingSearchesPromises = trendingSearchesRaw.map(async (item: any): Promise<any | null> => {
        try {
          const enrichedItem = await enrichSearchItem(item);

          if (enrichedItem) {
            return {
              ...enrichedItem,
              recentCount: item.recentCount,
              growthRate: item.growthRate
            };
          }

          return null;
        } catch (error) {
          console.error('Error enriching trending search:', error);
          return null;
        }
      });

      const trendingSearchesResults = await Promise.all(trendingSearchesPromises);
      let trendingSearches = trendingSearchesResults.filter(item => item !== null);
      let usedTrendingSearchesFallback = false;

      // Fallback: If no trending searches, create mix of products + collections from Shopify
      if (trendingSearches.length === 0) {
        try {
          usedTrendingSearchesFallback = true;

          // Fetch trending products (3) and collections (2) from Shopify
          const [shopifyProducts, shopifyCollections] = await Promise.all([
            ShopifyStorefrontService.getProducts(3),
            ShopifyStorefrontService.getCollections(2)
          ]);

          const fallbackSearches: any[] = [];

          // Add products as trending searches
          if (shopifyProducts?.data?.products?.edges) {
            const transformedProducts = transformShopifyProductEdges(shopifyProducts.data.products.edges);
            const enrichedProducts = await productEnrichment.enrichProducts(transformedProducts);

            enrichedProducts.forEach((product, index) => {
              fallbackSearches.push({
                query: product.title,
                type: 'product' as const,
                recentCount: 5 - index, // Mock count: 5, 4, 3
                growthRate: 0.5 + (index * 0.1), // Mock growth: 0.5, 0.6, 0.7
                productId: product.productId,
                product
              });
            });
          }

          // Add collections as trending searches
          if (shopifyCollections?.data?.collections?.edges) {
            const collectionPromises = shopifyCollections.data.collections.edges.map(async (edge: any) => {
              try {
                const collectionId = edge.node.id;
                const fullCollectionResponse = await ShopifyStorefrontService.getCollectionById(collectionId, 20);

                if (!fullCollectionResponse?.data?.collection) {
                  return null;
                }

                const transformedCollection = transformShopifyCollection(fullCollectionResponse.data.collection);
                const enrichedProducts = await productEnrichment.enrichProducts(
                  transformedCollection.products || []
                );

                return {
                  ...transformedCollection,
                  products: enrichedProducts
                };
              } catch (error) {
                console.error('Error fetching fallback collection:', error);
                return null;
              }
            });

            const enrichedCollections = await Promise.all(collectionPromises);
            const validCollections = enrichedCollections.filter(c => c !== null);

            validCollections.forEach((collection, index) => {
              fallbackSearches.push({
                query: collection.title,
                type: 'collection' as const,
                recentCount: 4 - index, // Mock count: 4, 3
                growthRate: 0.4 + (index * 0.1), // Mock growth: 0.4, 0.5
                collectionId: collection.id,
                collection
              });
            });
          }

          // Limit to max 5 and shuffle for variety
          trendingSearches = fallbackSearches.slice(0, limitNum);
        } catch (error) {
          console.error('Error creating fallback trending searches:', error);
          // Keep trendingSearches as empty if fallback fails
        }
      }

      // Process trending products (bonus data)
      let trendingProducts = trendingProductsData.map((item: any) => item.product);
      let usedProductFallback = false;

      if (trendingProducts.length === 0) {
        try {
          const shopifyProductsResponse = await ShopifyStorefrontService.getProducts(10);

          if (shopifyProductsResponse?.data?.products?.edges) {
            const transformedProducts = transformShopifyProductEdges(shopifyProductsResponse.data.products.edges);
            trendingProducts = await productEnrichment.enrichProducts(transformedProducts);
            usedProductFallback = true;
          }
        } catch (error) {
          console.error('Error fetching Shopify products as fallback:', error);
        }
      } else {
        trendingProducts = await productEnrichment.enrichProducts(trendingProducts);
      }

      return {
        success: true,
        data: {
          recentSearches, // Enriched with product/collection data
          trendingSearches, // Enriched with product/collection data + metrics (mix of products & collections)
          trendingProducts, // Bonus trending products
          metadata: {
            isAuthenticated: !!userId,
            recentSearchesCount: recentSearches.length,
            trendingSearchesCount: trendingSearches.length,
            productsCount: trendingProducts.length,
            timeframe: timeframeNum,
            lastUpdated: new Date().toISOString(),
            isFallback: {
              products: usedProductFallback,
              trendingSearches: usedTrendingSearchesFallback
            }
          }
        }
      };
    } catch (error) {
      console.error('Error getting search context data:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Main Product & Collection Search
   * Comprehensive search with filters, pagination, and sorting.
   * Returns both products and collections for better discovery.
   *
   * @param q - Search query
   * @param page - Page number (default: 1)
   * @param limit - Results per page (default: 20)
   * @param category - Category filter (ObjectId)
   * @param priceMin - Minimum price filter
   * @param priceMax - Maximum price filter
   * @param brand - Brand/vendor filter
   * @param rating - Minimum rating filter
   * @param inStock - Only in-stock products
   * @param sortBy - Sort order (relevance, price_low, price_high, rating, popular, newest)
   */
  @Get('')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async search(
    @Request() request: any,
    @Header('x-store-id') storeId: string,
    @Query() q: string,
    @Query() page?: number,
    @Query() limit?: number,
    @Query() category?: string,
    @Query() priceMin?: number,
    @Query() priceMax?: number,
    @Query() brand?: string,
    @Query() rating?: number,
    @Query() inStock?: string,
    @Query() sortBy?: string
  ): Promise<any> {
    try {
      if (!q || q.trim().length === 0) {
        this.setStatus(400);
        throw new Error('Search query is required');
      }

      const pageNum = page || 1;
      const limitNum = limit || 20;
      const searchQuery = q.trim();
      const validatedStoreId = this.validateStoreId(storeId);

      // Check if filters are applied
      const hasFilters = !!(category || priceMin || priceMax || brand || rating || inStock);

      let products: any[] = [];
      let collections: any[] = [];
      let total = 0;

      const applySupportedFilters = (items: any[]): any[] => {
        const normalizedBrand = brand?.toLowerCase();

        return items.filter((product) => {
          if (normalizedBrand && !(product.vendor || '').toLowerCase().includes(normalizedBrand)) {
            return false;
          }
          if (priceMin && product.price < priceMin) {
            return false;
          }
          if (priceMax && product.price > priceMax) {
            return false;
          }
          if (rating && (product.rating || 0) < rating) {
            return false;
          }
          if (inStock === 'true' && !product.inStock) {
            return false;
          }

          return true;
        });
      };

      const sortOptions = (() => {
        switch (sortBy) {
          case 'price_low':
            return { sortKey: 'PRICE' as const, reverse: false };
          case 'price_high':
            return { sortKey: 'PRICE' as const, reverse: true };
          case 'newest':
            return { sortKey: 'CREATED_AT' as const, reverse: true };
          case 'popular':
            return { sortKey: 'BEST_SELLING' as const, reverse: false };
          default:
            return { sortKey: 'RELEVANCE' as const, reverse: false };
        }
      })();

      let productPageInfo: {
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        endCursor: string | null;
        startCursor: string | null;
      } = {
        hasNextPage: false,
        hasPreviousPage: pageNum > 1,
        endCursor: null,
        startCursor: null,
      };

      const emptyProductSearchPage = {
        data: {
          products: {
            edges: [],
            pageInfo: productPageInfo,
          },
        },
      };

      const inferTotalResults = () => {
        const previousPageResults = (pageNum - 1) * limitNum;

        if (productPageInfo.hasNextPage) {
          return pageNum * limitNum + 1;
        }

        return previousPageResults + products.length;
      };

      const fetchProductSearchPage = async (): Promise<any> => {
        let cursor: string | undefined;
        let response: any = emptyProductSearchPage;

        for (let currentPage = 1; currentPage <= pageNum; currentPage += 1) {
          response = await ShopifyStorefrontService.searchProductsForStore(validatedStoreId, searchQuery, {
            limit: limitNum,
            cursor,
            sortKey: sortOptions.sortKey,
            reverse: sortOptions.reverse,
          });

          if (currentPage < pageNum) {
            const pageInfo = response?.data?.products?.pageInfo;

            if (!pageInfo?.hasNextPage || !pageInfo.endCursor) {
              return emptyProductSearchPage;
            }

            cursor = pageInfo.endCursor;
          }
        }

        return response;
      };

      // If no filters: Use Shopify predictive search for both products and collections
      if (!hasFilters && pageNum === 1) {
        try {
          const shopifyResults = await ShopifyStorefrontService.predictiveSearchForStore(validatedStoreId, searchQuery, limitNum);

          if (shopifyResults?.data?.predictiveSearch) {
            // Transform and enrich products
            const shopifyProducts = shopifyResults.data.predictiveSearch.products || [];
            const transformedProducts = shopifyProducts.map((product: any) => ({
              productId: product.id,
              title: product.title,
              handle: product.handle,
              vendor: product.vendor,
              productType: product.productType,
              tags: product.tags,
              images: product.featuredImage ? [product.featuredImage.url] : [],
              price: parseFloat(product.priceRange.minVariantPrice.amount),
              compareAtPrice: product.compareAtPriceRange?.minVariantPrice
                ? parseFloat(product.compareAtPriceRange.minVariantPrice.amount)
                : 0,
              currency: product.priceRange.minVariantPrice.currencyCode,
              inStock: true,
              availableQuantity: 0,
              totalQuantity: 0,
              rating: 0,
              reviewsCount: 0
            }));

            // Enrich with ratings from MongoDB
            products = await productEnrichment.enrichProducts(transformedProducts);

            // Transform collections
            const shopifyCollections = shopifyResults.data.predictiveSearch.collections || [];
            collections = shopifyCollections.map((collection: any) => ({
              id: collection.id,
              title: collection.title,
              handle: collection.handle,
              image: collection.image?.url || null,
              description: null
            }));

            total = products.length;
          }
        } catch (shopifyError) {
          console.error('Shopify predictive search failed:', shopifyError);
          this.throwStorefrontSearchError(shopifyError);
        }
      }

      // Use tenant-scoped Storefront product search for filters, later pages, or zero predictive products.
      if (hasFilters || pageNum > 1 || products.length === 0) {
        try {
          if (category) {
            throw new ApiError(
              'Category filter is not supported for tenant-scoped Storefront search',
              400,
              true,
              undefined,
              true
            );
          }

          const shopifySearchResults = await fetchProductSearchPage();

          if (shopifySearchResults?.data?.products?.edges) {
            productPageInfo = shopifySearchResults.data.products.pageInfo || productPageInfo;
            const shopifyProducts = shopifySearchResults.data.products.edges.map((edge: any) => edge.node);
            const transformedProducts = shopifyProducts.map((product: any) => ({
              productId: product.id,
              title: product.title,
              handle: product.handle,
              vendor: product.vendor,
              productType: product.productType,
              tags: product.tags,
              description: product.description || '',
              images: product.images?.edges.map((e: any) => e.node.url) || [],
              price: parseFloat(product.priceRange.minVariantPrice.amount),
              compareAtPrice: product.compareAtPriceRange?.minVariantPrice
                ? parseFloat(product.compareAtPriceRange.minVariantPrice.amount)
                : 0,
              currency: product.priceRange.minVariantPrice.currencyCode,
              inStock: product.availableForSale,
              availableQuantity: product.totalInventory || 0,
              totalQuantity: product.totalInventory || 0,
              rating: 0,
              reviewsCount: 0
            }));

            // Enrich with ratings from MongoDB
            products = applySupportedFilters(await productEnrichment.enrichProducts(transformedProducts));
            total = inferTotalResults();

            // Also try to get collections from Shopify predictiveSearch
            if (!hasFilters && collections.length === 0) {
              try {
                const collectionsResult = await ShopifyStorefrontService.predictiveSearchForStore(validatedStoreId, searchQuery, 5);
                if (collectionsResult?.data?.predictiveSearch?.collections) {
                  const shopifyCollections = collectionsResult.data.predictiveSearch.collections;
                  collections = shopifyCollections.map((collection: any) => ({
                    id: collection.id,
                    title: collection.title,
                    handle: collection.handle,
                    image: collection.image?.url || null,
                    description: null
                  }));
                }
              } catch (collectionError) {
                console.error('Failed to fetch collections after searchProducts:', collectionError);
                collections = [];
              }
            }
          }
        } catch (shopifySearchError) {
          console.error('Shopify searchProducts fallback failed:', shopifySearchError);
          this.throwStorefrontSearchError(shopifySearchError);
        }
      }

      // Log search history
      const userId = request.user?.id;
      const sessionId = request.sessionID || 'anonymous';

      await SearchHistory.create({
        storeId: new mongoose.Types.ObjectId(validatedStoreId),
        user: userId,
        anonymousId: !userId ? sessionId : undefined,
        sessionId,
        query: searchQuery,
        searchType: 'text',
        resultsCount: total,
        hasResults: products.length > 0,
        normalizedQuery: searchQuery.toLowerCase(),
        queryType: 'text',
        source: 'search_bar',
        filters: {
          category,
          priceMin,
          priceMax,
          brand,
          rating,
          inStock: inStock === 'true',
          sortBy
        },
        results: {
          totalResults: total,
          resultsShown: products.length,
          hasResults: products.length > 0,
          topResultId: products.length > 0 ? products[0]._id : undefined,
          clickedResults: []
        },
        device: {
          platform: request.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
          isMobile: request.headers['user-agent']?.includes('Mobile') || false
        }
      });

      return {
        success: true,
        data: {
          products,
          collections, // Collections matching the search query
          query: searchQuery,
          filters: {
            category,
            priceMin,
            priceMax,
            brand,
            rating,
            inStock,
            sortBy
          },
          pagination: {
            current: pageNum,
            total: Math.ceil(total / limitNum),
            count: products.length,
            totalResults: total,
            hasNextPage: productPageInfo.hasNextPage,
            hasPreviousPage: productPageInfo.hasPreviousPage,
            endCursor: productPageInfo.endCursor,
            startCursor: productPageInfo.startCursor
          },
          metadata: {
            productsCount: products.length,
            collectionsCount: collections.length,
            hasFilters: hasFilters
          }
        }
      };
    } catch (error) {
      console.error('Error performing search:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setErrorStatus(error);
      }
      throw error;
    }
  }

  /**
   * Get Search Suggestions
   * Fast autocomplete suggestions from search history and products
   *
   * @param q - Search query (minimum 2 characters)
   * @param limit - Number of suggestions (default: 10)
   */
  @Get('suggestions')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async getSearchSuggestions(
    @Header('x-store-id') storeId: string,
    @Query() q?: string,
    @Query() limit?: number
  ): Promise<any> {
    try {
      if (!q || q.trim().length < 2) {
        return {
          success: true,
          data: {
            suggestions: []
          }
        };
      }

      const limitNum = limit || 10;
      const searchQuery = q.trim();
      const validatedStoreId = this.validateStoreId(storeId);

      // Get suggestions from search history
      const suggestions = await SearchHistory.getSearchSuggestions(searchQuery, limitNum, validatedStoreId);
      let productSuggestions: Array<{ type: string; text: string; handle: string }> = [];
      let categorySuggestions: Array<{ type: string; text: string; slug: string }> = [];

      try {
        const shopifyResults = await ShopifyStorefrontService.predictiveSearchForStore(
          validatedStoreId,
          searchQuery,
          Math.min(limitNum, 10)
        );

        if (shopifyResults?.data?.predictiveSearch) {
          productSuggestions = (shopifyResults.data.predictiveSearch.products || []).map((product: any) => ({
            type: 'product',
            text: product.title,
            handle: product.handle
          }));

          categorySuggestions = (shopifyResults.data.predictiveSearch.collections || []).map((collection: any) => ({
            type: 'category',
            text: collection.title,
            slug: collection.handle
          }));
        }
      } catch (shopifyError) {
        console.error('Shopify predictive suggestions failed:', shopifyError);
        this.throwStorefrontSearchError(shopifyError);
      }

      return {
        success: true,
        data: {
          suggestions: suggestions.slice(0, limitNum),
          products: productSuggestions,
          categories: categorySuggestions
        }
      };
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      this.setErrorStatus(error);
      throw error;
    }
  }

  /**
   * Get Popular Searches
   * Returns most frequently searched terms
   *
   * @param limit - Number of results (default: 10)
   * @param days - Days to look back (default: 30)
   */
  @Get('popular')
  @TsoaResponse(500, 'Internal Server Error')
  public async getPopularSearches(
    @Query() limit?: number,
    @Query() days?: number
  ): Promise<any> {
    try {
      const limitNum = limit || 10;
      const daysNum = days || 30;

      const popularSearches = await SearchHistory.getPopularSearches(limitNum, daysNum);

      return {
        success: true,
        data: {
          searches: popularSearches
        }
      };
    } catch (error) {
      console.error('Error getting popular searches:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Get Trending Searches
   * Returns searches with highest growth rate
   *
   * @param limit - Number of results (default: 10)
   */
  @Get('trending')
  @TsoaResponse(500, 'Internal Server Error')
  public async getTrendingSearches(
    @Query() limit?: number
  ): Promise<any> {
    try {
      const limitNum = limit || 10;

      // Get searches from last 7 days with growth rate
      const trendingSearches = await SearchHistory.aggregate([
        {
          $match: {
            searchedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            'results.hasResults': true
          }
        },
        {
          $group: {
            _id: '$normalizedQuery',
            recentCount: { $sum: 1 },
            successRate: { $avg: { $cond: ['$isSuccessful', 1, 0] } }
          }
        },
        {
          $lookup: {
            from: 'searchhistories',
            let: { query: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$normalizedQuery', '$$query'] },
                  searchedAt: {
                    $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                    $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'previousWeek'
          }
        },
        {
          $addFields: {
            previousCount: { $ifNull: [{ $arrayElemAt: ['$previousWeek.count', 0] }, 0] },
            growthRate: {
              $cond: {
                if: { $gt: [{ $arrayElemAt: ['$previousWeek.count', 0] }, 0] },
                then: {
                  $divide: [
                    { $subtract: ['$recentCount', { $arrayElemAt: ['$previousWeek.count', 0] }] },
                    { $arrayElemAt: ['$previousWeek.count', 0] }
                  ]
                },
                else: 1
              }
            }
          }
        },
        {
          $match: {
            recentCount: { $gte: 3 }, // Minimum threshold
            growthRate: { $gte: 0.2 } // At least 20% growth
          }
        },
        {
          $sort: { growthRate: -1, recentCount: -1 }
        },
        {
          $limit: limitNum
        },
        {
          $project: {
            query: '$_id',
            recentCount: 1,
            previousCount: 1,
            growthRate: 1,
            successRate: 1
          }
        }
      ]);

      return {
        success: true,
        data: {
          trending: trendingSearches
        }
      };
    } catch (error) {
      console.error('Error getting trending searches:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Get Failed Searches
   * Returns searches that returned no results (admin analytics)
   *
   * @param limit - Number of results (default: 10)
   * @param days - Days to look back (default: 7)
   */
  @Get('failed')
  @TsoaResponse(500, 'Internal Server Error')
  public async getFailedSearches(
    @Query() limit?: number,
    @Query() days?: number
  ): Promise<any> {
    try {
      const limitNum = limit || 10;
      const daysNum = days || 7;

      const failedSearches = await SearchHistory.getFailedSearches(limitNum, daysNum);

      return {
        success: true,
        data: {
          searches: failedSearches
        }
      };
    } catch (error) {
      console.error('Error getting failed searches:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Track Search Click
   * Track when user clicks on a search result
   *
   * @param searchId - The search record ID
   * @param productId - The clicked product ID
   * @param position - Position in search results
   */
  @Post('track-click')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(404, 'Not Found')
  @TsoaResponse(500, 'Internal Server Error')
  public async trackSearchClick(
    @Body() body: { searchId: string; productId: string; position?: number }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { searchId, productId, position } = body;

      if (!searchId || !productId) {
        this.setStatus(400);
        throw new Error('Search ID and Product ID are required');
      }

      const searchRecord = await SearchHistory.findById(searchId);

      if (!searchRecord) {
        this.setStatus(404);
        throw new Error('Search record not found');
      }

      // Update search record with click data
      (searchRecord as any).results = (searchRecord as any).results || { clickedResults: [] };
      (searchRecord as any).results.clickedResults.push(new mongoose.Types.ObjectId(productId));
      if (position) {
        (searchRecord as any).selectedResultPosition = position;
      }
      (searchRecord as any).isSuccessful = true;

      await searchRecord.save();

      return {
        success: true,
        message: 'Search click tracked'
      };
    } catch (error) {
      console.error('Error tracking search click:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Get User Search History
   * Returns authenticated user's recent search history
   *
   * @param request - Express request with user auth
   * @param limit - Number of results (default: 20)
   */
  @Get('history')
  @Security('jwt')
  @TsoaResponse(401, 'Unauthorized')
  @TsoaResponse(500, 'Internal Server Error')
  public async getUserSearchHistory(
    @Request() request: any,
    @Query() limit?: number
  ): Promise<any> {
    try {
      const userId = request.user?.id;

      if (!userId) {
        this.setStatus(401);
        throw new Error('Authentication required');
      }

      const limitNum = limit || 20;

      const searchHistory = await SearchHistory.getUserSearchHistory(userId, limitNum);

      return {
        success: true,
        data: {
          searches: searchHistory
        }
      };
    } catch (error) {
      console.error('Error getting user search history:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Clear User Search History
   * Deletes authenticated user's search history
   *
   * @param request - Express request with user auth
   */
  @Post('history/clear')
  @Security('jwt')
  @TsoaResponse(401, 'Unauthorized')
  @TsoaResponse(500, 'Internal Server Error')
  public async clearUserSearchHistory(
    @Request() request: any
  ): Promise<{ success: boolean; message: string }> {
    try {
      const userId = request.user?.id;

      if (!userId) {
        this.setStatus(401);
        throw new Error('Authentication required');
      }

      await SearchHistory.deleteMany({ user: userId });

      return {
        success: true,
        message: 'Search history cleared'
      };
    } catch (error) {
      console.error('Error clearing search history:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Get Search Analytics
   * Comprehensive search analytics including volume, trends, device stats
   *
   * @param timeframe - Days to analyze (default: 30)
   */
  @Get('analytics')
  @TsoaResponse(500, 'Internal Server Error')
  public async getSearchAnalytics(
    @Query() timeframe?: number
  ): Promise<any> {
    try {
      const days = timeframe || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get search volume trend
      const searchVolume = await SearchHistory.aggregate([
        {
          $match: {
            searchedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$searchedAt'
              }
            },
            totalSearches: { $sum: 1 },
            successfulSearches: { $sum: { $cond: ['$isSuccessful', 1, 0] } },
            uniqueQueries: { $addToSet: '$normalizedQuery' }
          }
        },
        {
          $addFields: {
            successRate: { $divide: ['$successfulSearches', '$totalSearches'] },
            uniqueQueryCount: { $size: '$uniqueQueries' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Get query type distribution
      const queryTypes = await SearchHistory.aggregate([
        {
          $match: {
            searchedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$queryType',
            count: { $sum: 1 },
            successRate: { $avg: { $cond: ['$isSuccessful', 1, 0] } }
          }
        }
      ]);

      // Get device/platform analytics
      const deviceStats = await SearchHistory.aggregate([
        {
          $match: {
            searchedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$device.platform',
            count: { $sum: 1 },
            successRate: { $avg: { $cond: ['$isSuccessful', 1, 0] } }
          }
        }
      ]);

      // Get search source analytics
      const sourceStats = await SearchHistory.aggregate([
        {
          $match: {
            searchedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 },
            successRate: { $avg: { $cond: ['$isSuccessful', 1, 0] } }
          }
        }
      ]);

      return {
        success: true,
        data: {
          searchVolume,
          queryTypes,
          deviceStats,
          sourceStats,
          summary: {
            totalSearches: searchVolume.reduce((sum, day) => sum + day.totalSearches, 0),
            overallSuccessRate: searchVolume.length > 0
              ? searchVolume.reduce((sum, day) => sum + day.successRate, 0) / searchVolume.length
              : 0,
            uniqueQueries: searchVolume.reduce((sum, day) => sum + day.uniqueQueryCount, 0)
          }
        }
      };
    } catch (error) {
      console.error('Error getting search analytics:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Get Trending Collections
   * Returns most viewed collections in given timeframe
   *
   * @param limit - Number of results (default: 10)
   * @param timeframe - Days to look back (default: 7)
   */
  @Get('collections/trending')
  @TsoaResponse(500, 'Internal Server Error')
  public async getTrendingCollections(
    @Query() limit?: number,
    @Query() timeframe?: number
  ): Promise<any> {
    try {
      const limitNum = limit || 10;
      const timeframeNum = timeframe || 7;

      const trendingCollections = await CollectionView.getTrendingCollections(limitNum, timeframeNum);

      return {
        success: true,
        data: {
          collections: trendingCollections,
          timeframe: timeframeNum,
          count: trendingCollections.length
        }
      };
    } catch (error) {
      console.error('Error getting trending collections:', error);
      this.setStatus(500);
      throw error;
    }
  }

  /**
   * Track Collection View
   * Track when user views a collection page
   */
  @Post('collections/track-view')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async trackCollectionView(
    @Request() request: any,
    @Body() body: {
      collectionId: string;
      collectionHandle?: string;
      collectionTitle?: string;
      viewDuration?: number;
      scrollDepth?: number;
      interactions?: any;
      viewContext?: string;
      searchQuery?: string;
      sessionId?: string;
      deviceInfo?: any;
    }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const {
        collectionId,
        collectionHandle,
        collectionTitle,
        viewDuration,
        scrollDepth,
        interactions,
        viewContext,
        searchQuery,
        sessionId,
        deviceInfo
      } = body;

      if (!collectionId) {
        this.setStatus(400);
        throw new Error('Collection ID is required');
      }

      const userId = request.user?.id;
      const anonymousId = !userId ? (sessionId || request.sessionID || 'anonymous') : undefined;

      await CollectionView.create({
        user: userId,
        anonymousId,
        collectionId,
        collectionHandle,
        collectionTitle,
        viewedAt: new Date(),
        viewDuration,
        scrollDepth,
        session: {
          sessionId: sessionId || request.sessionID || 'anonymous',
          isNewSession: false,
          sessionStartTime: new Date(),
          referrer: request.headers.referer,
          source: 'direct'
        },
        device: {
          platform: deviceInfo?.platform || (request.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop'),
          userAgent: request.headers['user-agent'],
          os: deviceInfo?.os,
          browser: deviceInfo?.browser,
          screenWidth: deviceInfo?.screenWidth,
          screenHeight: deviceInfo?.screenHeight
        },
        interactions: interactions || {
          productsViewed: 0,
          productsClicked: 0,
          filtersApplied: 0,
          sortingChanged: 0,
          addedToWishlist: false,
          addedToCart: false,
          shared: false
        },
        viewContext: viewContext || 'direct',
        searchQuery
      });

      return {
        success: true,
        message: 'Collection view tracked successfully'
      };
    } catch (error) {
      console.error('Error tracking collection view:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }

  /**
   * Log Search
   * Explicitly log a search from the mobile app to populate recent searches.
   * Call this when user performs a search and views results.
   *
   * @param request - Express request with optional user auth
   * @param body - Search details
   */
  @Post('log')
  @Security('jwt-optional')
  @TsoaResponse(400, 'Bad Request')
  @TsoaResponse(500, 'Internal Server Error')
  public async logSearch(
    @Request() request: any,
    @Body() body: {
      query: string;
      searchType: 'text' | 'product' | 'collection';
      selectedProductId?: string;
      selectedCollectionId?: string;
      resultsCount?: number;
      sessionId?: string;
    }
  ): Promise<{ success: boolean; message: string; searchId: string }> {
    try {
      const {
        query,
        searchType,
        selectedProductId,
        selectedCollectionId,
        resultsCount,
        sessionId
      } = body;

      // Validation
      if (!query || query.trim().length === 0) {
        this.setStatus(400);
        throw new Error('Search query is required');
      }

      if (!searchType || !['text', 'product', 'collection'].includes(searchType)) {
        this.setStatus(400);
        throw new Error('Valid searchType is required: text, product, or collection');
      }

      if (searchType === 'product' && !selectedProductId) {
        this.setStatus(400);
        throw new Error('selectedProductId is required for product searches');
      }

      if (searchType === 'collection' && !selectedCollectionId) {
        this.setStatus(400);
        throw new Error('selectedCollectionId is required for collection searches');
      }

      const userId = request.user?.id;
      const hasResults = resultsCount !== undefined ? resultsCount > 0 : true;

      // Create search history record
      const searchRecord = await SearchHistory.create({
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        query: query.trim(),
        searchType,
        selectedProductId,
        selectedCollectionId,
        resultsCount: resultsCount || 0,
        hasResults,
        sessionId: sessionId || request.sessionID || 'anonymous',
        userAgent: request.headers['user-agent']
      });

      return {
        success: true,
        message: 'Search logged successfully',
        searchId: searchRecord._id.toString()
      };
    } catch (error) {
      console.error('Error logging search:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }
      throw error;
    }
  }
}
