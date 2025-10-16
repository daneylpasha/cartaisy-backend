import { Body, Controller, Get, Post, Query, Request, Route, Security, Tags, Response as TsoaResponse } from 'tsoa';
import mongoose from 'mongoose';
import SearchHistory from '../models/SearchHistory';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import ProductCategory from '../models/ProductCategory';
import CollectionView from '../models/CollectionView';
import ShopifyStorefrontService from '../services/shopifyStorefrontService';
import productEnrichment from '../services/productEnrichmentService';
import { transformShopifyCollection, transformShopifyProductEdges } from '../utils/shopifyTransformers';
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
   * Returns personalized search context including user's recent searches, trending searches, and trending products.
   * Authentication is optional - recent searches only included for authenticated users.
   *
   * @param request - Express request with optional user auth
   * @param limit - Number of items to return (default: 10)
   * @param timeframe - Timeframe in days for trending calculation (default: 7)
   */
  @Get('context')
  @TsoaResponse(500, 'Internal Server Error')
  public async getSearchContext(
    @Request() request: any,
    @Query() limit?: number,
    @Query() timeframe?: number
  ): Promise<SearchContextResponse> {
    try {
      const limitNum = limit || 10;
      const timeframeNum = timeframe || 7;
      const userId = request.user?.id;

      // Build array of promises to fetch all data in parallel
      const promises: Promise<any>[] = [
        // Trending searches (global)
        SearchHistory.aggregate([
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
              recentCount: { $gte: 3 },
              growthRate: { $gte: 0.2 }
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
              successRate: 1,
              _id: 0
            }
          }
        ]),
        // Trending products
        ProductView.getTrendingProducts(limitNum, timeframeNum)
      ];

      // Add recent searches if user is authenticated
      if (userId) {
        promises.push(SearchHistory.getUserSearchHistory(userId, limitNum));
      } else {
        promises.push(Promise.resolve([])); // Empty array for guests
      }

      const [trendingSearches, trendingProductsData, recentSearches] = await Promise.all(promises);

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

      return {
        success: true,
        data: {
          recentSearches: recentSearches, // User-specific, empty if not authenticated
          trendingSearches: trendingSearches, // Global trending
          trendingProducts, // Return products in same format as other endpoints
          metadata: {
            isAuthenticated: !!userId,
            recentSearchesCount: recentSearches.length,
            trendingSearchesCount: trendingSearches.length,
            productsCount: trendingProducts.length,
            timeframe: timeframeNum,
            lastUpdated: new Date().toISOString(),
            isFallback: {
              products: usedProductFallback
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
   * Main Product Search
   * Comprehensive search with filters, pagination, and sorting
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
      const skip = (pageNum - 1) * limitNum;
      const searchQuery = q.trim();

      // Build search aggregation pipeline
      const pipeline: any[] = [
        {
          $match: {
            $text: { $search: searchQuery },
            status: 'active'
          }
        },
        {
          $addFields: {
            score: { $meta: 'textScore' }
          }
        }
      ];

      // Add filters
      const filterStage: any = {};

      if (category) {
        filterStage.category = new mongoose.Types.ObjectId(category);
      }
      if (brand) {
        filterStage.vendor = new RegExp(brand, 'i');
      }
      if (priceMin || priceMax) {
        filterStage.price = {};
        if (priceMin) filterStage.price.$gte = priceMin;
        if (priceMax) filterStage.price.$lte = priceMax;
      }
      if (rating) {
        filterStage['reviews.averageRating'] = { $gte: rating };
      }
      if (inStock === 'true') {
        filterStage['inventoryTracking.totalQuantity'] = { $gt: 0 };
      }

      if (Object.keys(filterStage).length > 0) {
        pipeline.push({ $match: filterStage });
      }

      // Add sorting
      let sortStage: any = {};
      switch (sortBy) {
        case 'price_low':
          sortStage = { price: 1 };
          break;
        case 'price_high':
          sortStage = { price: -1 };
          break;
        case 'rating':
          sortStage = { 'reviews.averageRating': -1 };
          break;
        case 'popular':
          sortStage = { 'analytics.viewCount': -1 };
          break;
        case 'newest':
          sortStage = { createdAt: -1 };
          break;
        case 'relevance':
        default:
          sortStage = { score: -1 };
          break;
      }

      pipeline.push({ $sort: sortStage });

      // Get total count for pagination
      const countPipeline = [...pipeline];
      countPipeline.push({ $count: 'total' });
      const countResult = await Product.aggregate(countPipeline);
      const total = countResult.length > 0 ? countResult[0].total : 0;

      // Add pagination and lookup
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limitNum });
      pipeline.push({
        $lookup: {
          from: 'productcategories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      });
      pipeline.push({
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true
        }
      });

      const products = await Product.aggregate(pipeline);

      // Log search history
      const userId = request.user?.id;
      const sessionId = request.sessionID || 'anonymous';

      await SearchHistory.create({
        user: userId,
        anonymousId: !userId ? sessionId : undefined,
        sessionId,
        query: searchQuery,
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
            totalResults: total
          }
        }
      };
    } catch (error) {
      console.error('Error performing search:', error);
      if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
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
  @TsoaResponse(500, 'Internal Server Error')
  public async getSearchSuggestions(
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

      // Get suggestions from search history
      const suggestions = await SearchHistory.getSearchSuggestions(searchQuery, limitNum);

      // Get product suggestions based on title/tags
      const productSuggestions = await Product.find({
        $text: { $search: searchQuery },
        status: 'active'
      })
        .sort({ score: { $meta: 'textScore' } })
        .limit(5)
        .select('title handle');

      // Get category suggestions
      const categorySuggestions = await ProductCategory.find({
        $text: { $search: searchQuery }
      })
        .limit(3)
        .select('name slug');

      return {
        success: true,
        data: {
          suggestions: suggestions.slice(0, limitNum),
          products: productSuggestions.map(p => ({
            type: 'product',
            text: p.title,
            handle: p.handle
          })),
          categories: categorySuggestions.map(c => ({
            type: 'category',
            text: c.name,
            slug: c.slug
          }))
        }
      };
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      this.setStatus(500);
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
      searchRecord.results.clickedResults.push(new mongoose.Types.ObjectId(productId));
      if (position) {
        searchRecord.selectedResultPosition = position;
      }
      searchRecord.isSuccessful = true;

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
}
