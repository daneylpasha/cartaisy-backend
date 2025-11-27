import { Request, Response } from 'express';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import SearchHistory from '../models/SearchHistory';
import Order from '../models/Order';
import ProductReview from '../models/ProductReview';
import shopifyAnalyticsService from '../services/shopifyAnalyticsService';
import appAnalyticsService from '../services/appAnalyticsService';

export const getDashboardAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get key metrics
    const [
      productViews,
      totalSearches,
      totalOrders,
      totalRevenue,
      averageOrderValue,
      newProducts,
      totalReviews,
      averageRating
    ] = await Promise.all([
      ProductView.countDocuments({ viewedAt: { $gte: startDate } }),
      SearchHistory.countDocuments({ searchedAt: { $gte: startDate } }),
      Order.countDocuments({ placedAt: { $gte: startDate } }),
      Order.aggregate([
        { $match: { placedAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]).then(result => result[0]?.total || 0),
      Order.aggregate([
        { $match: { placedAt: { $gte: startDate } } },
        { $group: { _id: null, avg: { $avg: '$totalPrice' } } }
      ]).then(result => result[0]?.avg || 0),
      Product.countDocuments({ createdAt: { $gte: startDate } }),
      ProductReview.countDocuments({ createdAt: { $gte: startDate } }),
      ProductReview.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ]).then(result => result[0]?.avg || 0)
    ]);

    // Get growth rates compared to previous period
    const previousStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
    const previousEndDate = startDate;

    const [
      previousViews,
      previousSearches,
      previousOrders,
      previousRevenue
    ] = await Promise.all([
      ProductView.countDocuments({ 
        viewedAt: { $gte: previousStartDate, $lt: previousEndDate } 
      }),
      SearchHistory.countDocuments({ 
        searchedAt: { $gte: previousStartDate, $lt: previousEndDate } 
      }),
      Order.countDocuments({ 
        placedAt: { $gte: previousStartDate, $lt: previousEndDate } 
      }),
      Order.aggregate([
        { 
          $match: { 
            placedAt: { $gte: previousStartDate, $lt: previousEndDate } 
          } 
        },
        { $group: { _id: null, total: { $sum: '$totalPrice' } } }
      ]).then(result => result[0]?.total || 0)
    ]);

    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    res.json({
      success: true,
      data: {
        metrics: {
          productViews: {
            value: productViews,
            growth: calculateGrowth(productViews, previousViews)
          },
          searches: {
            value: totalSearches,
            growth: calculateGrowth(totalSearches, previousSearches)
          },
          orders: {
            value: totalOrders,
            growth: calculateGrowth(totalOrders, previousOrders)
          },
          revenue: {
            value: totalRevenue,
            growth: calculateGrowth(totalRevenue, previousRevenue)
          },
          averageOrderValue: {
            value: Math.round(averageOrderValue * 100) / 100,
            growth: 0 // Would need to calculate previous AOV
          },
          newProducts: {
            value: newProducts,
            growth: 0 // Would need to calculate previous period
          },
          reviews: {
            value: totalReviews,
            rating: Math.round(averageRating * 10) / 10
          }
        },
        timeframe: `${days} days`
      }
    });
  } catch (error) {
    console.error('Error getting dashboard analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics'
    });
  }
};

export const getProductAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Most viewed products
    const mostViewed = await ProductView.aggregate([
      {
        $match: {
          viewedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$product',
          views: { $sum: 1 },
          uniqueViews: { $addToSet: '$user' }
        }
      },
      {
        $addFields: {
          uniqueViewCount: { $size: '$uniqueViews' }
        }
      },
      {
        $sort: { views: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          title: '$product.title',
          handle: '$product.handle',
          price: '$product.price',
          views: 1,
          uniqueViews: '$uniqueViewCount'
        }
      }
    ]);

    // Best selling products
    const bestSelling = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: startDate }
        }
      },
      {
        $unwind: '$lineItems'
      },
      {
        $group: {
          _id: '$lineItems.productId',
          totalSold: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
          orders: { $addToSet: '$_id' }
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' }
        }
      },
      {
        $sort: { totalSold: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          title: '$product.title',
          handle: '$product.handle',
          price: '$product.price',
          totalSold: 1,
          revenue: 1,
          orderCount: 1
        }
      }
    ]);

    // Trending products (high view growth)
    const trending = await ProductView.aggregate([
      {
        $match: {
          viewedAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: '$productId',
          viewCount: { $sum: 1 }
        }
      },
      {
        $sort: { viewCount: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      }
    ]);

    // Top rated products
    const topRated = await Product.find({
      'reviews.count': { $gte: 5 },
      'reviews.averageRating': { $gte: 4.0 }
    })
      .sort({ 'reviews.averageRating': -1, 'reviews.count': -1 })
      .limit(10)
      .select('title handle price reviews images');

    // Category performance
    const categoryPerformance = await ProductView.aggregate([
      {
        $match: {
          viewedAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $lookup: {
          from: 'productcategories',
          localField: 'product.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          views: { $sum: 1 },
          uniqueProducts: { $addToSet: '$product._id' }
        }
      },
      {
        $addFields: {
          productCount: { $size: '$uniqueProducts' }
        }
      },
      {
        $sort: { views: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json({
      success: true,
      data: {
        mostViewed,
        bestSelling,
        trending: trending.map((item: any) => ({
          ...item.product,
          views: item.views,
          engagementScore: item.engagementScore
        })),
        topRated,
        categoryPerformance
      }
    });
  } catch (error) {
    console.error('Error getting product analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get product analytics'
    });
  }
};

export const getUserBehaviorAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Platform usage
    const platformUsage = await ProductView.aggregate([
      {
        $match: {
          viewedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$device.platform',
          views: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' },
          avgViewDuration: { $avg: '$viewDuration' }
        }
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' }
        }
      }
    ]);

    // Search behavior
    const searchBehavior = await SearchHistory.aggregate([
      {
        $match: {
          searchedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          successfulSearches: { $sum: { $cond: ['$isSuccessful', 1, 0] } },
          avgResultsShown: { $avg: '$results.resultsShown' },
          topQueries: { $push: '$normalizedQuery' }
        }
      },
      {
        $addFields: {
          successRate: { $divide: ['$successfulSearches', '$totalSearches'] }
        }
      }
    ]);

    // User engagement metrics
    const engagementMetrics = await ProductView.aggregate([
      {
        $match: {
          viewedAt: { $gte: startDate },
          user: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$user',
          sessionCount: { $addToSet: '$session.sessionId' },
          totalViews: { $sum: 1 },
          avgViewDuration: { $avg: '$viewDuration' },
          totalInteractions: {
            $sum: {
              $add: [
                '$interactions.clickedImages',
                '$interactions.clickedVariants',
                { $cond: ['$interactions.addedToWishlist', 1, 0] },
                { $cond: ['$interactions.addedToCart', 1, 0] }
              ]
            }
          }
        }
      },
      {
        $addFields: {
          sessionCount: { $size: '$sessionCount' },
          interactionRate: { $divide: ['$totalInteractions', '$totalViews'] }
        }
      },
      {
        $group: {
          _id: null,
          avgSessionCount: { $avg: '$sessionCount' },
          avgViewsPerUser: { $avg: '$totalViews' },
          avgViewDuration: { $avg: '$avgViewDuration' },
          avgInteractionRate: { $avg: '$interactionRate' }
        }
      }
    ]);

    // Conversion funnel
    const totalViews = await ProductView.countDocuments({
      viewedAt: { $gte: startDate }
    });

    const wishlistAdditions = await ProductView.countDocuments({
      viewedAt: { $gte: startDate },
      'interactions.addedToWishlist': true
    });

    const cartAdditions = await ProductView.countDocuments({
      viewedAt: { $gte: startDate },
      'interactions.addedToCart': true
    });

    const orders = await Order.countDocuments({
      placedAt: { $gte: startDate }
    });

    const conversionFunnel = {
      views: totalViews,
      wishlistAdditions,
      cartAdditions,
      orders,
      wishlistConversionRate: totalViews > 0 ? (wishlistAdditions / totalViews) * 100 : 0,
      cartConversionRate: totalViews > 0 ? (cartAdditions / totalViews) * 100 : 0,
      orderConversionRate: totalViews > 0 ? (orders / totalViews) * 100 : 0
    };

    res.json({
      success: true,
      data: {
        platformUsage,
        searchBehavior: searchBehavior[0] || {
          totalSearches: 0,
          successfulSearches: 0,
          successRate: 0,
          avgResultsShown: 0
        },
        engagement: engagementMetrics[0] || {
          avgSessionCount: 0,
          avgViewsPerUser: 0,
          avgViewDuration: 0,
          avgInteractionRate: 0
        },
        conversionFunnel
      }
    });
  } catch (error) {
    console.error('Error getting user behavior analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user behavior analytics'
    });
  }
};

export const getRevenueAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe = '30' } = req.query;
    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Daily revenue trend
    const dailyRevenue = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$placedAt'
            }
          },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
          averageOrderValue: { $avg: '$totalPrice' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Revenue by source/channel
    const revenueBySource = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            source: '$source',
            channel: '$channel'
          },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalPrice' }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ]);

    // Top revenue generating products
    const topRevenueProducts = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: startDate }
        }
      },
      {
        $unwind: '$lineItems'
      },
      {
        $group: {
          _id: '$lineItems.productId',
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
          quantitySold: { $sum: '$lineItems.quantity' },
          orders: { $addToSet: '$_id' }
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' }
        }
      },
      {
        $sort: { revenue: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          title: '$product.title',
          handle: '$product.handle',
          price: '$product.price',
          revenue: 1,
          quantitySold: 1,
          orderCount: 1
        }
      }
    ]);

    // Customer segments by order value
    const customerSegments = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$user',
          totalSpent: { $sum: '$totalPrice' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalPrice' }
        }
      },
      {
        $bucket: {
          groupBy: '$totalSpent',
          boundaries: [0, 50, 200, 500, 1000, 5000],
          default: '5000+',
          output: {
            customerCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalSpent' },
            avgOrderValue: { $avg: '$avgOrderValue' }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        dailyRevenue,
        revenueBySource,
        topRevenueProducts,
        customerSegments,
        summary: {
          totalRevenue: dailyRevenue.reduce((sum, day) => sum + day.revenue, 0),
          totalOrders: dailyRevenue.reduce((sum, day) => sum + day.orders, 0),
          averageOrderValue: dailyRevenue.length > 0 
            ? dailyRevenue.reduce((sum, day) => sum + day.averageOrderValue, 0) / dailyRevenue.length 
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get revenue analytics'
    });
  }
};

export const getInventoryAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Low stock products
    const lowStockProducts = await Product.find({
      'inventoryTracking.lowStockThreshold': { $exists: true },
      $expr: {
        $lte: [
          '$inventoryTracking.totalQuantity',
          '$inventoryTracking.lowStockThreshold'
        ]
      }
    })
      .sort({ 'inventoryTracking.totalQuantity': 1 })
      .limit(20)
      .select('title handle inventoryTracking price analytics.viewCount');

    // Out of stock products
    const outOfStockProducts = await Product.find({
      'inventoryTracking.totalQuantity': 0
    })
      .sort({ 'analytics.viewCount': -1 })
      .limit(20)
      .select('title handle inventoryTracking price analytics.viewCount');

    // Inventory value by category
    const inventoryByCategory = await Product.aggregate([
      {
        $match: {
          status: 'active'
        }
      },
      {
        $lookup: {
          from: 'productcategories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $group: {
          _id: '$category._id',
          categoryName: { $first: '$category.name' },
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: '$inventoryTracking.totalQuantity' },
          totalValue: { $sum: { $multiply: ['$inventoryTracking.totalQuantity', '$price'] } },
          lowStockCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $exists: ['$inventoryTracking.lowStockThreshold'] },
                    { $lte: ['$inventoryTracking.totalQuantity', '$inventoryTracking.lowStockThreshold'] }
                  ]
                },
                then: 1,
                else: 0
              }
            }
          },
          outOfStockCount: {
            $sum: { $cond: [{ $eq: ['$inventoryTracking.totalQuantity', 0] }, 1, 0] }
          }
        }
      },
      {
        $sort: { totalValue: -1 }
      }
    ]);

    // Fast moving products (high sales velocity)
    const fastMovingProducts = await Order.aggregate([
      {
        $match: {
          placedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $unwind: '$lineItems'
      },
      {
        $group: {
          _id: '$lineItems.productId',
          totalSold: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $addFields: {
          velocityScore: {
            $divide: ['$totalSold', '$product.inventoryTracking.totalQuantity']
          }
        }
      },
      {
        $match: {
          'product.inventoryTracking.totalQuantity': { $gt: 0 }
        }
      },
      {
        $sort: { velocityScore: -1 }
      },
      {
        $limit: 20
      },
      {
        $project: {
          title: '$product.title',
          handle: '$product.handle',
          currentStock: '$product.inventoryTracking.totalQuantity',
          totalSold: 1,
          velocityScore: 1,
          revenue: 1
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        lowStockProducts,
        outOfStockProducts,
        inventoryByCategory,
        fastMovingProducts,
        summary: {
          totalLowStock: lowStockProducts.length,
          totalOutOfStock: outOfStockProducts.length,
          totalInventoryValue: inventoryByCategory.reduce((sum, cat) => sum + cat.totalValue, 0)
        }
      }
    });
  } catch (error) {
    console.error('Error getting inventory analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get inventory analytics'
    });
  }
};

// ============================================
// NEW: COMBINED ANALYTICS (Shopify + App)
// ============================================

/**
 * Get complete analytics dashboard combining Shopify and App data
 */
export const getCombinedDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const [shopifyDashboard, appDashboard] = await Promise.all([
      shopifyAnalyticsService.getDashboardAnalytics(storeId, dateRange),
      appAnalyticsService.getAppDashboard(storeId, dateRange),
    ]);

    res.json({
      success: true,
      data: {
        // Shopify data (sales, revenue, orders)
        sales: shopifyDashboard.overview,
        topSellingProducts: shopifyDashboard.topProducts,
        customers: shopifyDashboard.customerMetrics,
        salesTrends: shopifyDashboard.salesTrends,
        recentOrders: shopifyDashboard.recentOrders,
        lowStockProducts: shopifyDashboard.lowStockProducts,

        // App data (engagement, views, searches)
        engagement: appDashboard.engagement,
        topViewedProducts: appDashboard.topProducts,
        topSearches: appDashboard.topSearches,
        platformBreakdown: appDashboard.platformBreakdown,
        eventCounts: appDashboard.eventCounts,
        hourlyActivity: appDashboard.hourlyActivity,
      },
      metadata: {
        dateRange: dateRange || { startDate: 'last 30 days', endDate: 'now' },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting combined dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get combined dashboard'
    });
  }
};

// ============================================
// SHOPIFY ANALYTICS ENDPOINTS
// ============================================

export const getSalesOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getSalesOverview(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting sales overview:', error);
    res.status(500).json({ success: false, message: 'Failed to get sales overview' });
  }
};

export const getTopSellingProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate, limit } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getTopProducts(storeId, dateRange, Number(limit) || 10);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting top selling products:', error);
    res.status(500).json({ success: false, message: 'Failed to get top selling products' });
  }
};

export const getCustomerMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getCustomerMetrics(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting customer metrics:', error);
    res.status(500).json({ success: false, message: 'Failed to get customer metrics' });
  }
};

export const getSalesTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getSalesTrends(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting sales trends:', error);
    res.status(500).json({ success: false, message: 'Failed to get sales trends' });
  }
};

export const getRevenueByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getRevenueByCategory(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting revenue by category:', error);
    res.status(500).json({ success: false, message: 'Failed to get revenue by category' });
  }
};

export const getFulfillmentStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await shopifyAnalyticsService.getFulfillmentStats(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting fulfillment stats:', error);
    res.status(500).json({ success: false, message: 'Failed to get fulfillment stats' });
  }
};

export const getRecentOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { limit } = req.query;

    const data = await shopifyAnalyticsService.getRecentOrders(storeId, Number(limit) || 10);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting recent orders:', error);
    res.status(500).json({ success: false, message: 'Failed to get recent orders' });
  }
};

export const getLowStockProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { limit } = req.query;

    const data = await shopifyAnalyticsService.getLowStockProducts(storeId, Number(limit) || 10);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting low stock products:', error);
    res.status(500).json({ success: false, message: 'Failed to get low stock products' });
  }
};

// ============================================
// APP ANALYTICS ENDPOINTS
// ============================================

/**
 * Track a single event (public - for mobile app)
 */
export const trackEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const userId = (req as any).user?.id;

    const event = await appAnalyticsService.trackEvent(storeId, {
      ...req.body,
      userId,
    });

    res.json({
      success: true,
      data: { eventId: event._id },
    });
  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({ success: false, message: 'Failed to track event' });
  }
};

/**
 * Track multiple events in batch (public - for mobile app)
 */
export const trackEventsBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const userId = (req as any).user?.id;

    const eventsWithUser = req.body.events.map((event: any) => ({
      ...event,
      userId,
    }));

    const count = await appAnalyticsService.trackEventsBatch(storeId, eventsWithUser);

    res.json({
      success: true,
      data: { trackedCount: count },
    });
  } catch (error) {
    console.error('Error tracking events batch:', error);
    res.status(500).json({ success: false, message: 'Failed to track events batch' });
  }
};

/**
 * Get app engagement metrics
 */
export const getEngagementMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getEngagementMetrics(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting engagement metrics:', error);
    res.status(500).json({ success: false, message: 'Failed to get engagement metrics' });
  }
};

/**
 * Get top products by engagement
 */
export const getTopProductsByEngagement = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate, limit } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getTopProductsByEngagement(storeId, dateRange, Number(limit) || 10);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting top products by engagement:', error);
    res.status(500).json({ success: false, message: 'Failed to get top products by engagement' });
  }
};

/**
 * Get top search queries
 */
export const getTopSearches = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate, limit } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getTopSearches(storeId, dateRange, Number(limit) || 20);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting top searches:', error);
    res.status(500).json({ success: false, message: 'Failed to get top searches' });
  }
};

/**
 * Get platform breakdown
 */
export const getPlatformBreakdown = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getPlatformBreakdown(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting platform breakdown:', error);
    res.status(500).json({ success: false, message: 'Failed to get platform breakdown' });
  }
};

/**
 * Get funnel analysis
 */
export const getFunnelAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getFunnelAnalysis(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting funnel analysis:', error);
    res.status(500).json({ success: false, message: 'Failed to get funnel analysis' });
  }
};

/**
 * Get hourly activity pattern
 */
export const getHourlyActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const storeId = (req as any).storeId;
    const { startDate, endDate } = req.query;

    const dateRange = startDate && endDate ? {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    } : undefined;

    const data = await appAnalyticsService.getHourlyActivity(storeId, dateRange);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting hourly activity:', error);
    res.status(500).json({ success: false, message: 'Failed to get hourly activity' });
  }
};

/**
 * Get user journey for a session
 */
export const getUserJourney = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const data = await appAnalyticsService.getUserJourney(sessionId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting user journey:', error);
    res.status(500).json({ success: false, message: 'Failed to get user journey' });
  }
};