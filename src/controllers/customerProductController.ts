import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import Order from '../models/Order';
import Wishlist from '../models/Wishlist';
import { CustomerInfo } from '../middleware/customerAuth';

// Extend Request to include customer info from authenticateCustomer middleware
interface CustomerRequest extends Request {
  customer: CustomerInfo;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const getCustomerStoreObjectId = (req: CustomerRequest, res: Response): mongoose.Types.ObjectId | null => {
  const storeId = req.customer?.storeId;

  if (!storeId) {
    res.status(400).json({
      status: 'error',
      message: 'Store ID is required'
    });
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(storeId)) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid Store ID format'
    });
    return null;
  }

  return new mongoose.Types.ObjectId(storeId);
};

/**
 * Get customer's viewed product categories and tags for recommendations
 */
const getCustomerPreferences = async (customerId: string, storeId: mongoose.Types.ObjectId) => {
  // Get recent views
  const recentViews = await ProductView.find({ customer: customerId })
    .sort({ viewedAt: -1 })
    .limit(50)
    .populate({
      path: 'product',
      match: { storeId },
      select: 'category vendor tags'
    })
    .lean();

  // Get purchase history
  const orders = await Order.find({ customer: customerId, storeId })
    .select('lineItems')
    .limit(20)
    .lean();

  // Extract categories and tags from views
  const viewedCategories: string[] = [];
  const viewedTags: string[] = [];
  const viewedProductIds: string[] = [];

  recentViews.forEach((view: any) => {
    if (view.product) {
      viewedProductIds.push(view.product._id.toString());
      if (view.product.category) {
        viewedCategories.push(view.product.category.toString());
      }
      if (view.product.tags) {
        viewedTags.push(...view.product.tags);
      }
    }
  });

  // Extract product IDs from orders
  const purchasedProductIds: string[] = [];
  orders.forEach((order: any) => {
    if (order.lineItems) {
      order.lineItems.forEach((item: any) => {
        if (item.productId) {
          purchasedProductIds.push(item.productId.toString());
        }
      });
    }
  });

  return {
    viewedCategories: [...new Set(viewedCategories)],
    viewedTags: [...new Set(viewedTags)],
    viewedProductIds,
    purchasedProductIds
  };
};

// =============================================================================
// CONTROLLER FUNCTIONS
// =============================================================================

/**
 * Get personalized product recommendations for the customer
 */
export const getRecommendations = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const storeId = getCustomerStoreObjectId(req, res);
    if (!storeId) {
      return;
    }

    const customerId = req.customer.id;
    const {
      limit = '10',
      type = 'general' // general, similar, trending, for_you
    } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 10, 50);

    // Get customer preferences
    const preferences = await getCustomerPreferences(customerId, storeId);
    const excludeProductIds = [
      ...preferences.viewedProductIds.slice(0, 20), // Exclude recently viewed
      ...preferences.purchasedProductIds // Exclude already purchased
    ];

    let products: any[] = [];
    let recommendationType = type as string;

    if (type === 'trending') {
      // Get trending products
      products = await Product.find({
        storeId,
        status: 'active',
        _id: { $nin: excludeProductIds.map(id => new mongoose.Types.ObjectId(id)) }
      })
        .sort({ 'analytics.viewCount': -1, 'analytics.orderCount': -1 })
        .limit(limitNum)
        .populate('category', 'name slug path')
        .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
        .lean();
    } else if (type === 'for_you' || type === 'general') {
      // Personalized recommendations based on viewing/purchase history
      const categoryFilter = preferences.viewedCategories.length > 0
        ? { category: { $in: preferences.viewedCategories.map(id => new mongoose.Types.ObjectId(id)) } }
        : {};

      products = await Product.find({
        storeId,
        status: 'active',
        _id: { $nin: excludeProductIds.map(id => new mongoose.Types.ObjectId(id)) },
        ...categoryFilter
      })
        .sort({ 'analytics.averageRating': -1, 'analytics.orderCount': -1 })
        .limit(limitNum)
        .populate('category', 'name slug path')
        .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
        .lean();

      // If not enough personalized results, fill with popular products
      if (products.length < limitNum) {
        const additionalProducts = await Product.find({
          storeId,
          status: 'active',
          _id: {
            $nin: [
              ...excludeProductIds.map(id => new mongoose.Types.ObjectId(id)),
              ...products.map(p => p._id)
            ]
          }
        })
          .sort({ 'analytics.viewCount': -1 })
          .limit(limitNum - products.length)
          .populate('category', 'name slug path')
          .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
          .lean();

        products = [...products, ...additionalProducts];
      }

      recommendationType = preferences.viewedCategories.length > 0 ? 'personalized' : 'popular';
    } else if (type === 'similar') {
      // Get similar to recently viewed
      const recentViewedIds = preferences.viewedProductIds.slice(0, 5);

      if (recentViewedIds.length > 0) {
        // Get categories of recently viewed products
        const recentProducts = await Product.find({
          storeId,
          _id: { $in: recentViewedIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).select('category vendor tags').lean();

        const categories = recentProducts
          .filter(p => p.category)
          .map(p => p.category);

        products = await Product.find({
          storeId,
          status: 'active',
          _id: { $nin: excludeProductIds.map(id => new mongoose.Types.ObjectId(id)) },
          category: { $in: categories }
        })
          .sort({ 'analytics.averageRating': -1 })
          .limit(limitNum)
          .populate('category', 'name slug path')
          .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
          .lean();
      }

      // Fallback to trending if no similar products
      if (products.length === 0) {
        products = await Product.find({
          storeId,
          status: 'active',
          _id: { $nin: excludeProductIds.map(id => new mongoose.Types.ObjectId(id)) }
        })
          .sort({ 'analytics.viewCount': -1 })
          .limit(limitNum)
          .populate('category', 'name slug path')
          .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
          .lean();
        recommendationType = 'trending';
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        products: products.map(product => ({
          id: product._id,
          title: product.title,
          handle: product.handle,
          price: product.price,
          images: product.images,
          mobileDisplay: product.mobileDisplay,
          vendor: product.vendor,
          category: product.category,
          rating: product.analytics?.averageRating || 0,
          reviewCount: product.analytics?.reviewCount || 0
        })),
        type: recommendationType,
        personalized: recommendationType === 'personalized' || recommendationType === 'for_you',
        count: products.length
      }
    });
  } catch (error) {
    console.error('Get customer recommendations error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get recommendations'
    });
  }
};

/**
 * Track product view for customer analytics
 */
export const trackProductView = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const storeId = getCustomerStoreObjectId(req, res);
    if (!storeId) {
      return;
    }

    const customerId = req.customer.id;
    const { productId } = req.params;
    const {
      from = 'direct', // search, category, recommendation, direct, related, featured
      searchQuery,
      categoryId,
      duration,
      scrollDepth
    } = req.body;

    // Verify product exists
    const product = await Product.findOne({ _id: productId, storeId }).select('handle');
    if (!product) {
      res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
      return;
    }

    // Extract device info from request
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);

    // Create product view record
    await ProductView.create({
      customer: customerId,
      product: productId,
      productHandle: product.handle,
      viewedAt: new Date(),
      viewDuration: duration,
      scrollDepth,
      session: {
        sessionId: (req as any).sessionID || `mobile-${customerId}-${Date.now()}`,
        isNewSession: false,
        sessionStartTime: new Date(),
        referrer: req.headers.referer,
        source: 'mobile'
      },
      device: {
        userAgent,
        platform: 'mobile',
        isMobile: true,
        os: /iPhone|iPad/.test(userAgent) ? 'iOS' : /Android/.test(userAgent) ? 'Android' : 'Other'
      },
      interactions: {
        clickedImages: 0,
        clickedVariants: 0,
        addedToWishlist: false,
        addedToCart: false,
        shared: false,
        reviewsViewed: false
      },
      viewContext: from,
      searchQuery: searchQuery,
      categoryId: categoryId ? new mongoose.Types.ObjectId(categoryId) : undefined
    });

    res.status(200).json({
      status: 'success',
      message: 'View tracked successfully'
    });
  } catch (error) {
    console.error('Track product view error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to track view'
    });
  }
};

/**
 * Get customer's recently viewed products
 */
export const getRecentlyViewed = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const storeId = getCustomerStoreObjectId(req, res);
    if (!storeId) {
      return;
    }

    const customerId = req.customer.id;
    const { limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 10, 50);

    // Get unique recently viewed products
    const views = await ProductView.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(customerId) } },
      { $sort: { viewedAt: -1 } },
      {
        $group: {
          _id: '$product',
          lastViewedAt: { $first: '$viewedAt' },
          viewCount: { $sum: 1 }
        }
      },
      { $sort: { lastViewedAt: -1 } },
      { $limit: limitNum }
    ]);

    const productIds = views.map(v => v._id);

    // Get product details
    const products = await Product.find({
      storeId,
      _id: { $in: productIds },
      status: 'active'
    })
      .populate('category', 'name slug path')
      .select('title handle price images mobileDisplay vendor analytics.averageRating analytics.reviewCount')
      .lean();

    // Map products with view data
    const productsWithViews = productIds
      .map(id => {
        const product = products.find(p => p._id.toString() === id.toString());
        const viewData = views.find(v => v._id.toString() === id.toString());
        if (!product) return null;
        return {
          id: product._id,
          title: product.title,
          handle: product.handle,
          price: product.price,
          images: product.images,
          mobileDisplay: product.mobileDisplay,
          vendor: product.vendor,
          category: product.category,
          rating: (product as any).analytics?.averageRating || 0,
          reviewCount: (product as any).analytics?.reviewCount || 0,
          lastViewedAt: viewData?.lastViewedAt,
          viewCount: viewData?.viewCount
        };
      })
      .filter(Boolean);

    res.status(200).json({
      status: 'success',
      data: {
        products: productsWithViews,
        count: productsWithViews.length
      }
    });
  } catch (error) {
    console.error('Get recently viewed error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get recently viewed products'
    });
  }
};

/**
 * Clear customer's view history
 */
export const clearViewHistory = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;

    await ProductView.deleteMany({ customer: customerId });

    res.status(200).json({
      status: 'success',
      message: 'View history cleared successfully'
    });
  } catch (error) {
    console.error('Clear view history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to clear view history'
    });
  }
};
