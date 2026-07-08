import { Response } from 'express';
import mongoose from 'mongoose';
import Product from '../models/Product';
import ProductView from '../models/ProductView';
import ProductReview from '../models/ProductReview';
import ProductCategory from '../models/ProductCategory';
import SearchHistory from '../models/SearchHistory';
import { AuthenticatedRequest } from '../types';
import { getStoreIdFromRequest } from '../middleware/storeAuth';

const getEffectiveStoreId = (req: AuthenticatedRequest): string | null => {
  const userStoreId = req.user?.storeId;
  if (userStoreId) {
    return userStoreId.toString();
  }

  return getStoreIdFromRequest(req);
};

const getStoreObjectIdOrResponse = (
  req: AuthenticatedRequest,
  res: Response
): mongoose.Types.ObjectId | null => {
  const storeId = getEffectiveStoreId(req);

  if (!storeId) {
    res.status(400).json({
      success: false,
      message: 'Store ID is required'
    });
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(storeId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid Store ID format'
    });
    return null;
  }

  return new mongoose.Types.ObjectId(storeId);
};

export const getProducts = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const {
      page = 1,
      limit = 20,
      category,
      brand,
      priceMin,
      priceMax,
      inStock,
      rating,
      sortBy = 'relevance',
      search,
      tags,
      featured
    } = req.query as any;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter object
    const filter: any = { storeId, status: 'active' };

    if (category) {
      filter.category = category;
    }

    if (brand) {
      filter.vendor = new RegExp(brand as string, 'i');
    }

    if (priceMin || priceMax) {
      filter.price = {};
      if (priceMin) filter.price.$gte = parseFloat(priceMin as string);
      if (priceMax) filter.price.$lte = parseFloat(priceMax as string);
    }

    if (inStock === 'true') {
      filter['inventoryTracking.totalQuantity'] = { $gt: 0 };
    }

    if (rating) {
      filter['reviews.averageRating'] = { $gte: parseFloat(rating as string) };
    }

    if (search) {
      filter.$text = { $search: search as string };
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      filter.tags = { $in: tagArray };
    }

    if (featured === 'true') {
      filter['mobileDisplay.isFeatured'] = true;
    }

    // Build sort object
    let sort: any = {};
    switch (sortBy) {
      case 'price_low':
        sort = { price: 1 };
        break;
      case 'price_high':
        sort = { price: -1 };
        break;
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'rating':
        sort = { 'reviews.averageRating': -1 };
        break;
      case 'popular':
        sort = { 'analytics.viewCount': -1 };
        break;
      case 'relevance':
      default:
        if (search) {
          sort = { score: { $meta: 'textScore' } };
        } else {
          sort = { 'mobileDisplay.priority': -1, createdAt: -1 };
        }
        break;
    }

    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('category', 'name slug path')
      .select('-seo -inventoryTracking.history -analytics.conversionEvents');

    const total = await Product.countDocuments(filter);

    return res.json({
      success: true,
      data: {
        products,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: products.length,
          totalProducts: total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

export const getProduct = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const { id } = req.params as any;
    const userId = req.user?._id;

    const product = await Product.findOne({ _id: id, storeId })
      .populate('category', 'name slug path fullPath')
      .populate({
        path: 'relatedProducts',
        match: { storeId },
        select: 'title handle price images mobileDisplay.thumbnailUrl'
      });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Get recent reviews
    const reviews = await ProductReview.find({ 
      product: id, 
      status: 'approved' 
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'name avatar')
      .select('-adminNotes');

    // Track product view
    if (userId) {
      await trackProductView(id, userId.toString(), req);
    }

    // Update analytics
    // await (product as any).updateAnalytics('view');

    return res.json({
      success: true,
      data: {
        product,
        reviews,
        availability: {
          inStock: (product as any).inventoryTracking?.totalQuantity > 0,
          quantity: (product as any).inventoryTracking?.totalQuantity,
          lowStock: (product as any).inventoryTracking?.lowStockThreshold && 
                   (product as any).inventoryTracking?.totalQuantity <= (product as any).inventoryTracking?.lowStockThreshold
        }
      }
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product'
    });
  }
};

export const searchProducts = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

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
      sortBy = 'relevance'
    } = req.query as any;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const searchMatch = {
      $text: { $search: query as string },
      status: 'active',
      storeId
    };

    // Build search pipeline
    const pipeline: any[] = [
      {
        $match: searchMatch
      },
      {
        $addFields: {
          score: { $meta: 'textScore' }
        }
      }
    ];

    // Add additional filters
    const additionalFilters: any = {};

    if (category) {
      additionalFilters.category = new mongoose.Types.ObjectId(category as string);
    }
    if (brand) {
      additionalFilters.vendor = new RegExp(brand as string, 'i');
    }
    if (priceMin || priceMax) {
      additionalFilters.price = {};
      if (priceMin) additionalFilters.price.$gte = parseFloat(priceMin as string);
      if (priceMax) additionalFilters.price.$lte = parseFloat(priceMax as string);
    }
    if (rating) {
      additionalFilters['reviews.averageRating'] = { $gte: parseFloat(rating as string) };
    }
    if (inStock === 'true') {
      additionalFilters['inventoryTracking.totalQuantity'] = { $gt: 0 };
    }

    if (Object.keys(additionalFilters).length > 0) {
      pipeline.push({ $match: additionalFilters });
    }

    const countPipeline = [...pipeline, { $count: 'total' }];

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
      case 'relevance':
      default:
        sortStage = { score: -1 };
        break;
    }

    pipeline.push({ $sort: sortStage });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limitNum });

    // Add population
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
    
    // Get total count for pagination
    const countResult = await Product.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Save search history
    const userId = req.user?._id;
    const sessionId = req.sessionID || 'anonymous';
    const searchHistorySortKey = (() => {
      switch (sortBy) {
        case 'price_low':
        case 'price_high':
          return 'PRICE';
        case 'popular':
          return 'BEST_SELLING';
        default:
          return 'RELEVANCE';
      }
    })();
    
    await SearchHistory.create({
      storeId,
      userId: userId ? new mongoose.Types.ObjectId(userId.toString()) : undefined,
      sessionId,
      query: query as string,
      searchType: 'text',
      resultsCount: total,
      hasResults: total > 0,
      filters: {
        sortKey: searchHistorySortKey,
        minPrice: priceMin ? parseFloat(priceMin as string) : undefined,
        maxPrice: priceMax ? parseFloat(priceMax as string) : undefined,
        vendor: brand
      },
      userAgent: req.headers['user-agent']
    });

    return res.json({
      success: true,
      data: {
        products,
        query: query as string,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: products.length,
          totalProducts: total
        }
      }
    });
  } catch (error) {
    console.error('Error searching products:', error);
    return res.status(500).json({
      success: false,
      message: 'Search failed'
    });
  }
};

export const getFeaturedProducts = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const { limit = 10, category } = req.query as any;
    const userId = req.user?._id;
    const limitNum = parseInt(limit as string);

    const filter: any = {
      storeId,
      status: 'active',
      'mobileDisplay.isFeatured': true
    };

    if (category) {
      filter.category = category;
    }

    let products = await Product.find(filter)
      .sort({ 'mobileDisplay.priority': -1, 'analytics.viewCount': -1 })
      .limit(limitNum)
      .populate('category', 'name slug path')
      .select('title handle price images mobileDisplay vendor reviews analytics');

    // Personalization based on user behavior
    if (userId) {
      try {
        // Get user's recent views and preferences
        const recentViews = await ProductView.find({ user: userId })
          .sort({ viewedAt: -1 })
          .limit(20)
          .populate({
            path: 'product',
            match: { storeId },
            select: 'category vendor'
          });

        if (recentViews.length > 0) {
          const viewedCategories = recentViews
            .map(view => (view.product as any)?.category)
            .filter(cat => cat);
          
          const viewedVendors = recentViews
            .map(view => (view.product as any)?.vendor)
            .filter(vendor => vendor);

          // Boost products from preferred categories/vendors
          products = products.map(product => {
            let score = (product as any).mobileDisplay?.priority || 0;
            
            if (viewedCategories.some(cat => cat.toString() === (product as any).category?.toString())) {
              score += 10;
            }
            if (viewedVendors.includes((product as any).vendor)) {
              score += 5;
            }
            
            return { ...(product as any).toObject(), personalizedScore: score };
          }).sort((a, b) => (b as any).personalizedScore - (a as any).personalizedScore) as any;
        }
      } catch (personalizationError) {
        console.error('Personalization error:', personalizationError);
        // Continue with non-personalized results
      }
    }

    return res.json({
      success: true,
      data: {
        products: products.slice(0, limitNum),
        personalized: !!userId
      }
    });
  } catch (error) {
    console.error('Error fetching featured products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch featured products'
    });
  }
};

export const getProductsByCategory = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const { categoryId } = req.params as any;
    const {
      page = 1,
      limit = 20,
      sortBy = 'priority',
      priceMin,
      priceMax,
      brand,
      inStock
    } = req.query as any;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Get category and its children
    const category = await ProductCategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    const childCategories = await category.getAllChildren();
    const categoryIds = [categoryId, ...childCategories.map(cat => cat._id)];

    // Build filter
    const filter: any = {
      storeId,
      status: 'active',
      category: { $in: categoryIds }
    };

    if (priceMin || priceMax) {
      filter.price = {};
      if (priceMin) filter.price.$gte = parseFloat(priceMin as string);
      if (priceMax) filter.price.$lte = parseFloat(priceMax as string);
    }

    if (brand) {
      filter.vendor = new RegExp(brand as string, 'i');
    }

    if (inStock === 'true') {
      filter['inventoryTracking.totalQuantity'] = { $gt: 0 };
    }

    // Build sort
    let sort: any = {};
    switch (sortBy) {
      case 'price_low':
        sort = { price: 1 };
        break;
      case 'price_high':
        sort = { price: -1 };
        break;
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'rating':
        sort = { 'reviews.averageRating': -1 };
        break;
      case 'popular':
        sort = { 'analytics.viewCount': -1 };
        break;
      case 'priority':
      default:
        sort = { 'mobileDisplay.priority': -1, createdAt: -1 };
        break;
    }

    const products = await Product.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('category', 'name slug path')
      .select('-seo -inventoryTracking.history');

    const total = await Product.countDocuments(filter);

    return res.json({
      success: true,
      data: {
        category: {
          id: category._id,
          name: category.name,
          slug: (category as any).slug,
          description: category.description,
          fullPath: category.getFullPath()
        },
        products,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: products.length,
          totalProducts: total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
};

export const getRecommendations = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const { limit = 10, type = 'general' } = req.query as any;
    const userId = req.user?._id;
    const limitNum = parseInt(limit as string);

    if (!userId) {
      // Return popular products for anonymous users
      const products = await Product.find({ storeId, status: 'active' })
        .sort({ 'analytics.viewCount': -1, 'reviews.averageRating': -1 })
        .limit(limitNum)
        .populate('category', 'name slug path')
        .select('title handle price images mobileDisplay vendor reviews');

      return res.json({
        success: true,
        data: {
          products,
          type: 'popular',
          personalized: false
        }
      });
    }

    // Get user's interaction history
    const recentViews = await ProductView.find({ user: userId })
      .sort({ viewedAt: -1 })
      .limit(50)
      .populate({
        path: 'product',
        match: { storeId },
        select: 'category vendor tags'
      });

    const viewedProducts = recentViews
      .map(view => view.product)
      .filter(Boolean)
      .map(product => (product as any)._id);

    if (recentViews.length === 0) {
      // New user - return trending products
      const trendingProducts = await Product.find({ storeId, status: 'active' })
        .sort({ 'analytics.viewCount': -1, 'reviews.averageRating': -1 })
        .limit(limitNum)
        .populate('category', 'name slug path')
        .select('title handle price images mobileDisplay vendor reviews');
      
      return res.json({
        success: true,
        data: {
          products: trendingProducts,
          type: 'trending',
          personalized: false
        }
      });
    }

    // Build recommendation based on user behavior
    const categoryPreferences = new Map();
    const vendorPreferences = new Map();
    const tagPreferences = new Map();

    recentViews.forEach(view => {
      const product = view.product as any;
      if (!product) {
        return;
      }
      
      // Category preferences
      if (product.category) {
        const catId = product.category.toString();
        categoryPreferences.set(catId, (categoryPreferences.get(catId) || 0) + 1);
      }

      // Vendor preferences
      if (product.vendor) {
        vendorPreferences.set(product.vendor, (vendorPreferences.get(product.vendor) || 0) + 1);
      }

      // Tag preferences
      if (product.tags) {
        product.tags.forEach((tag: string) => {
          tagPreferences.set(tag, (tagPreferences.get(tag) || 0) + 1);
        });
      }
    });

    // Get top preferences
    const topCategories = Array.from(categoryPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    const topVendors = Array.from(vendorPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(entry => entry[0]);

    const topTags = Array.from(tagPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);

    // Build recommendation query
    const recommendationFilter: any = {
      storeId,
      status: 'active',
      _id: { $nin: viewedProducts }, // Exclude already viewed products
      $or: []
    };

    if (topCategories.length > 0) {
      recommendationFilter.$or.push({ category: { $in: topCategories } });
    }
    if (topVendors.length > 0) {
      recommendationFilter.$or.push({ vendor: { $in: topVendors } });
    }
    if (topTags.length > 0) {
      recommendationFilter.$or.push({ tags: { $in: topTags } });
    }

    // If no preferences found, fall back to popular products
    if (recommendationFilter.$or.length === 0) {
      delete recommendationFilter.$or;
    }

    const recommendedProducts = await Product.find(recommendationFilter)
      .sort({ 'reviews.averageRating': -1, 'analytics.viewCount': -1 })
      .limit(limitNum)
      .populate('category', 'name slug path')
      .select('title handle price images mobileDisplay vendor reviews');

    return res.json({
      success: true,
      data: {
        products: recommendedProducts,
        type: 'personalized',
        personalized: true,
        basedOn: {
          categories: topCategories.length,
          vendors: topVendors.length,
          tags: topTags.length
        }
      }
    });
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate recommendations'
    });
  }
};

export const trackProductView = async (productId: string, userId: string, req: any) => {
  try {
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
    
    await ProductView.create({
      user: userId,
      product: productId,
      viewedAt: new Date(),
      session: {
        sessionId: req.sessionID || 'anonymous',
        isNewSession: false,
        sessionStartTime: new Date(),
        referrer: req.headers.referer,
        source: 'direct'
      },
      device: {
        userAgent,
        platform: isMobile ? 'mobile' : 'desktop',
        isMobile
      },
      viewContext: req.query?.from as string || 'direct',
      searchQuery: req.query?.search as string
    });
  } catch (error) {
    console.error('Error tracking product view:', error);
  }
};

export const getProductReviews = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const productId = (req.params as any).productId || (req.params as any).id;
    const {
      page = 1,
      limit = 10,
      sortBy = 'newest',
      rating,
      verified
    } = req.query as any;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const product = await Product.findOne({ _id: productId, storeId }).select('_id').lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const filter: any = {
      product: productId,
      status: 'approved'
    };

    if (rating) {
      filter.rating = parseInt(rating as string);
    }

    if (verified === 'true') {
      filter.verifiedPurchase = true;
    }

    let sort: any = {};
    switch (sortBy) {
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'rating_high':
        sort = { rating: -1, createdAt: -1 };
        break;
      case 'rating_low':
        sort = { rating: 1, createdAt: -1 };
        break;
      case 'helpful':
        sort = { 'helpfulVotes.helpful': -1, createdAt: -1 };
        break;
      case 'newest':
      default:
        sort = { createdAt: -1 };
        break;
    }

    const reviews = await ProductReview.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('user', 'name avatar')
      .select('-adminNotes');

    const total = await ProductReview.countDocuments(filter);

    // Get rating distribution
    const ratingDistribution = await ProductReview.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    return res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: reviews.length,
          totalReviews: total
        },
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Error fetching product reviews:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

export const getRelatedProducts = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const storeId = getStoreObjectIdOrResponse(req, res);
    if (!storeId) {
      return res;
    }

    const productId = (req.params as any).productId || (req.params as any).id;
    const { limit = 8 } = req.query as any;
    const limitNum = parseInt(limit as string);

    const product = await Product.findOne({ _id: productId, storeId })
      .populate('category')
      .select('category vendor tags');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const categoryId = (product as any).category?._id || (product as any).category;

    // Find related products based on category, vendor, and tags
    const relatedProducts = await Product.aggregate([
      {
        $match: {
          _id: { $ne: new mongoose.Types.ObjectId(productId) },
          storeId,
          status: 'active',
          $or: [
            { category: categoryId },
            { vendor: (product as any).vendor },
            { tags: { $in: (product as any).tags || [] } }
          ]
        }
      },
      {
        $addFields: {
          relevanceScore: {
            $sum: [
              { $cond: [{ $eq: ['$category', categoryId] }, 3, 0] },
              { $cond: [{ $eq: ['$vendor', (product as any).vendor] }, 2, 0] },
              {
                $size: {
                  $ifNull: [
                    { $setIntersection: ['$tags', (product as any).tags || []] },
                    []
                  ]
                }
              }
            ]
          }
        }
      },
      { $sort: { relevanceScore: -1, 'analytics.viewCount': -1 } },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'productcategories',
          localField: 'category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          title: 1,
          handle: 1,
          price: 1,
          images: 1,
          'mobileDisplay.thumbnailUrl': 1,
          vendor: 1,
          'reviews.averageRating': 1,
          'reviews.count': 1,
          'category.name': 1,
          relevanceScore: 1
        }
      }
    ]);

    return res.json({
      success: true,
      data: {
        products: relatedProducts
      }
    });
  } catch (error) {
    console.error('Error fetching related products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch related products'
    });
  }
};
