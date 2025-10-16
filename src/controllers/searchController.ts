import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SearchHistory from '../models/SearchHistory';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import ProductCategory from '../models/ProductCategory';
import CollectionView from '../models/CollectionView';
import ShopifyStorefrontService from '../services/shopifyStorefrontService';
import productEnrichment from '../services/productEnrichmentService';
import { transformShopifyCollection, transformShopifyProductEdges } from '../utils/shopifyTransformers';

export const search = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      q: query,
      page = 1,
      limit = 20,
      category,
      priceMin,
      priceMax,
      brand,
      rating,
      inStock,
      sortBy = 'relevance',
      filters
    } = req.query;

    if (!query || (query as string).trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    const searchQuery = (query as string).trim();

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
      filterStage.category = new mongoose.Types.ObjectId(category as string);
    }
    if (brand) {
      filterStage.vendor = new RegExp(brand as string, 'i');
    }
    if (priceMin || priceMax) {
      filterStage.price = {};
      if (priceMin) filterStage.price.$gte = parseFloat(priceMin as string);
      if (priceMax) filterStage.price.$lte = parseFloat(priceMax as string);
    }
    if (rating) {
      filterStage['reviews.averageRating'] = { $gte: parseFloat(rating as string) };
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
    const userId = req.user?.id;
    const sessionId = req.sessionID || 'anonymous';
    
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
        priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
        priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
        brand,
        rating: rating ? parseFloat(rating as string) : undefined,
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
        platform: req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop',
        isMobile: req.headers['user-agent']?.includes('Mobile') || false
      }
    });

    res.json({
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
    });
  } catch (error) {
    console.error('Error performing search:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

export const getSearchSuggestions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q: query, limit = 10 } = req.query;

    if (!query || (query as string).trim().length < 2) {
      return res.json({
        success: true,
        data: {
          suggestions: []
        }
      });
    }

    const limitNum = parseInt(limit as string);
    const searchQuery = (query as string).trim();

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

    res.json({
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
    });
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggestions'
    });
  }
};

export const getPopularSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10, days = 30 } = req.query;

    const limitNum = parseInt(limit as string);
    const daysNum = parseInt(days as string);

    const popularSearches = await SearchHistory.getPopularSearches(limitNum, daysNum);

    res.json({
      success: true,
      data: {
        searches: popularSearches
      }
    });
  } catch (error) {
    console.error('Error getting popular searches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get popular searches'
    });
  }
};

export const getTrendingSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = parseInt(limit as string);

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

    res.json({
      success: true,
      data: {
        trending: trendingSearches
      }
    });
  } catch (error) {
    console.error('Error getting trending searches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trending searches'
    });
  }
};

export const getFailedSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10, days = 7 } = req.query;

    const limitNum = parseInt(limit as string);
    const daysNum = parseInt(days as string);

    const failedSearches = await SearchHistory.getFailedSearches(limitNum, daysNum);

    res.json({
      success: true,
      data: {
        searches: failedSearches
      }
    });
  } catch (error) {
    console.error('Error getting failed searches:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get failed searches'
    });
  }
};

export const trackSearchClick = async (req: Request, res: Response): Promise<void> => {
  try {
    const { searchId, productId, position } = req.body;

    if (!searchId || !productId) {
      return res.status(400).json({
        success: false,
        message: 'Search ID and Product ID are required'
      });
    }

    const searchRecord = await SearchHistory.findById(searchId);

    if (!searchRecord) {
      return res.status(404).json({
        success: false,
        message: 'Search record not found'
      });
    }

    // Update search record with click data
    searchRecord.results.clickedResults.push(new mongoose.Types.ObjectId(productId));
    if (position) {
      searchRecord.selectedResultPosition = position;
    }
    searchRecord.isSuccessful = true;

    await searchRecord.save();

    res.json({
      success: true,
      message: 'Search click tracked'
    });
  } catch (error) {
    console.error('Error tracking search click:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track search click'
    });
  }
};

export const getUserSearchHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { limit = 20 } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const limitNum = parseInt(limit as string);

    const searchHistory = await SearchHistory.getUserSearchHistory(userId, limitNum);

    res.json({
      success: true,
      data: {
        searches: searchHistory
      }
    });
  } catch (error) {
    console.error('Error getting user search history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get search history'
    });
  }
};

export const clearUserSearchHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    await SearchHistory.deleteMany({ user: userId });

    res.json({
      success: true,
      message: 'Search history cleared'
    });
  } catch (error) {
    console.error('Error clearing search history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear search history'
    });
  }
};

export const getSearchAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
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

    res.json({
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
    });
  } catch (error) {
    console.error('Error getting search analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get search analytics'
    });
  }
};

// ==================== COLLECTION ENDPOINTS ====================

export const getTrendingCollections = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10, timeframe = 7 } = req.query;
    const limitNum = parseInt(limit as string);
    const timeframeNum = parseInt(timeframe as string);

    const trendingCollections = await CollectionView.getTrendingCollections(limitNum, timeframeNum);

    res.json({
      success: true,
      data: {
        collections: trendingCollections,
        timeframe: timeframeNum,
        count: trendingCollections.length
      }
    });
  } catch (error) {
    console.error('Error getting trending collections:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trending collections'
    });
  }
};

export const trackCollectionView = async (req: Request, res: Response): Promise<void> => {
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
    } = req.body;

    if (!collectionId) {
      return res.status(400).json({
        success: false,
        message: 'Collection ID is required'
      });
    }

    const userId = req.user?.id;
    const anonymousId = !userId ? (sessionId || req.sessionID || 'anonymous') : undefined;

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
        sessionId: sessionId || req.sessionID || 'anonymous',
        isNewSession: false,
        sessionStartTime: new Date(),
        referrer: req.headers.referer,
        source: 'direct'
      },
      device: {
        platform: deviceInfo?.platform || (req.headers['user-agent']?.includes('Mobile') ? 'mobile' : 'desktop'),
        userAgent: req.headers['user-agent'],
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

    res.json({
      success: true,
      message: 'Collection view tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking collection view:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track collection view'
    });
  }
};

// ==================== UNIFIED SEARCH SCREEN ENDPOINTS ====================

export const getInitialSearchScreen = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10, timeframe = 7 } = req.query;
    const limitNum = parseInt(limit as string);
    const timeframeNum = parseInt(timeframe as string);

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

    res.json({
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
    });
  } catch (error) {
    console.error('Error getting initial search screen data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get initial search screen data'
    });
  }
};

export const getSearchContext = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = 10, timeframe = 7 } = req.query;
    const limitNum = parseInt(limit as string);
    const timeframeNum = parseInt(timeframe as string);
    const userId = req.user?.id;

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

    res.json({
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
    });
  } catch (error) {
    console.error('Error getting search context data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get search context data'
    });
  }
};