"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRelatedProducts = exports.getProductReviews = exports.trackProductView = exports.getRecommendations = exports.getProductsByCategory = exports.getFeaturedProducts = exports.searchProducts = exports.getProduct = exports.getProducts = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = __importDefault(require("../models/Product"));
const ProductView_1 = __importDefault(require("../models/ProductView"));
const ProductReview_1 = __importDefault(require("../models/ProductReview"));
const ProductCategory_1 = __importDefault(require("../models/ProductCategory"));
const SearchHistory_1 = __importDefault(require("../models/SearchHistory"));
const getProducts = async (req, res) => {
    try {
        const { page = 1, limit = 20, category, brand, priceMin, priceMax, inStock, rating, sortBy = 'relevance', search, tags, featured } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        // Build filter object
        const filter = { status: 'active' };
        if (category) {
            filter.category = category;
        }
        if (brand) {
            filter.vendor = new RegExp(brand, 'i');
        }
        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin)
                filter.price.$gte = parseFloat(priceMin);
            if (priceMax)
                filter.price.$lte = parseFloat(priceMax);
        }
        if (inStock === 'true') {
            filter['inventoryTracking.totalQuantity'] = { $gt: 0 };
        }
        if (rating) {
            filter['reviews.averageRating'] = { $gte: parseFloat(rating) };
        }
        if (search) {
            filter.$text = { $search: search };
        }
        if (tags) {
            const tagArray = Array.isArray(tags) ? tags : [tags];
            filter.tags = { $in: tagArray };
        }
        if (featured === 'true') {
            filter['mobileDisplay.isFeatured'] = true;
        }
        // Build sort object
        let sort = {};
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
                }
                else {
                    sort = { 'mobileDisplay.priority': -1, createdAt: -1 };
                }
                break;
        }
        const products = await Product_1.default.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .populate('category', 'name slug')
            .select('-seo -inventoryTracking.history -analytics.conversionEvents');
        const total = await Product_1.default.countDocuments(filter);
        res.json({
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
    }
    catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};
exports.getProducts = getProducts;
const getProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const product = await Product_1.default.findById(id)
            .populate('category', 'name slug fullPath')
            .populate('relatedProducts', 'title handle price images mobileDisplay.thumbnailUrl');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        // Get recent reviews
        const reviews = await ProductReview_1.default.find({
            product: id,
            status: 'approved'
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name avatar')
            .select('-adminNotes');
        // Track product view
        if (userId) {
            await (0, exports.trackProductView)(id, userId, req);
        }
        // Update analytics
        await product.updateAnalytics('view');
        res.json({
            success: true,
            data: {
                product,
                reviews,
                availability: {
                    inStock: product.inventoryTracking.totalQuantity > 0,
                    quantity: product.inventoryTracking.totalQuantity,
                    lowStock: product.inventoryTracking.lowStockThreshold &&
                        product.inventoryTracking.totalQuantity <= product.inventoryTracking.lowStockThreshold
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};
exports.getProduct = getProduct;
const searchProducts = async (req, res) => {
    try {
        const { q: query, page = 1, limit = 20, category, priceMin, priceMax, brand, rating, inStock, sortBy = 'relevance' } = req.query;
        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        // Build search pipeline
        const pipeline = [
            {
                $match: {
                    $text: { $search: query },
                    status: 'active'
                }
            },
            {
                $addFields: {
                    score: { $meta: 'textScore' }
                }
            }
        ];
        // Add additional filters
        const additionalFilters = {};
        if (category) {
            additionalFilters.category = new mongoose_1.default.Types.ObjectId(category);
        }
        if (brand) {
            additionalFilters.vendor = new RegExp(brand, 'i');
        }
        if (priceMin || priceMax) {
            additionalFilters.price = {};
            if (priceMin)
                additionalFilters.price.$gte = parseFloat(priceMin);
            if (priceMax)
                additionalFilters.price.$lte = parseFloat(priceMax);
        }
        if (rating) {
            additionalFilters['reviews.averageRating'] = { $gte: parseFloat(rating) };
        }
        if (inStock === 'true') {
            additionalFilters['inventoryTracking.totalQuantity'] = { $gt: 0 };
        }
        if (Object.keys(additionalFilters).length > 0) {
            pipeline.push({ $match: additionalFilters });
        }
        // Add sorting
        let sortStage = {};
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
        const products = await Product_1.default.aggregate(pipeline);
        // Get total count for pagination
        const countPipeline = pipeline.slice(0, -3); // Remove skip, limit, and lookup
        countPipeline.push({ $count: 'total' });
        const countResult = await Product_1.default.aggregate(countPipeline);
        const total = countResult.length > 0 ? countResult[0].total : 0;
        // Save search history
        const userId = req.user?.id;
        const sessionId = req.sessionID || 'anonymous';
        await SearchHistory_1.default.create({
            user: userId,
            sessionId,
            query: query,
            normalizedQuery: query.toLowerCase().trim(),
            queryType: 'text',
            source: 'search_bar',
            filters: {
                category,
                priceMin: priceMin ? parseFloat(priceMin) : undefined,
                priceMax: priceMax ? parseFloat(priceMax) : undefined,
                brand,
                rating: rating ? parseFloat(rating) : undefined,
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
                query: query,
                pagination: {
                    current: pageNum,
                    total: Math.ceil(total / limitNum),
                    count: products.length,
                    totalProducts: total
                }
            }
        });
    }
    catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
        });
    }
};
exports.searchProducts = searchProducts;
const getFeaturedProducts = async (req, res) => {
    try {
        const { limit = 10, category } = req.query;
        const userId = req.user?.id;
        const limitNum = parseInt(limit);
        const filter = {
            status: 'active',
            'mobileDisplay.isFeatured': true
        };
        if (category) {
            filter.category = category;
        }
        let products = await Product_1.default.find(filter)
            .sort({ 'mobileDisplay.priority': -1, 'analytics.viewCount': -1 })
            .limit(limitNum)
            .populate('category', 'name slug')
            .select('title handle price images mobileDisplay vendor reviews analytics');
        // Personalization based on user behavior
        if (userId) {
            try {
                // Get user's recent views and preferences
                const recentViews = await ProductView_1.default.find({ user: userId })
                    .sort({ viewedAt: -1 })
                    .limit(20)
                    .populate('product', 'category vendor');
                if (recentViews.length > 0) {
                    const viewedCategories = recentViews
                        .map(view => view.product?.category)
                        .filter(cat => cat);
                    const viewedVendors = recentViews
                        .map(view => view.product?.vendor)
                        .filter(vendor => vendor);
                    // Boost products from preferred categories/vendors
                    products = products.map(product => {
                        let score = product.mobileDisplay.priority || 0;
                        if (viewedCategories.some(cat => cat.toString() === product.category?.toString())) {
                            score += 10;
                        }
                        if (viewedVendors.includes(product.vendor)) {
                            score += 5;
                        }
                        return { ...product.toObject(), personalizedScore: score };
                    }).sort((a, b) => b.personalizedScore - a.personalizedScore);
                }
            }
            catch (personalizationError) {
                console.error('Personalization error:', personalizationError);
                // Continue with non-personalized results
            }
        }
        res.json({
            success: true,
            data: {
                products: products.slice(0, limitNum),
                personalized: !!userId
            }
        });
    }
    catch (error) {
        console.error('Error fetching featured products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch featured products'
        });
    }
};
exports.getFeaturedProducts = getFeaturedProducts;
const getProductsByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { page = 1, limit = 20, sortBy = 'priority', priceMin, priceMax, brand, inStock } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        // Get category and its children
        const category = await ProductCategory_1.default.findById(categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        const childCategories = await category.getAllChildren();
        const categoryIds = [categoryId, ...childCategories.map(cat => cat._id)];
        // Build filter
        const filter = {
            status: 'active',
            category: { $in: categoryIds }
        };
        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin)
                filter.price.$gte = parseFloat(priceMin);
            if (priceMax)
                filter.price.$lte = parseFloat(priceMax);
        }
        if (brand) {
            filter.vendor = new RegExp(brand, 'i');
        }
        if (inStock === 'true') {
            filter['inventoryTracking.totalQuantity'] = { $gt: 0 };
        }
        // Build sort
        let sort = {};
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
        const products = await Product_1.default.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .populate('category', 'name slug')
            .select('-seo -inventoryTracking.history');
        const total = await Product_1.default.countDocuments(filter);
        res.json({
            success: true,
            data: {
                category: {
                    id: category._id,
                    name: category.name,
                    slug: category.slug,
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
    }
    catch (error) {
        console.error('Error fetching products by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};
exports.getProductsByCategory = getProductsByCategory;
const getRecommendations = async (req, res) => {
    try {
        const { limit = 10, type = 'general' } = req.query;
        const userId = req.user?.id;
        const limitNum = parseInt(limit);
        if (!userId) {
            // Return popular products for anonymous users
            const products = await Product_1.default.find({ status: 'active' })
                .sort({ 'analytics.viewCount': -1, 'reviews.averageRating': -1 })
                .limit(limitNum)
                .populate('category', 'name slug')
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
        const recentViews = await ProductView_1.default.find({ user: userId })
            .sort({ viewedAt: -1 })
            .limit(50)
            .populate('product', 'category vendor tags');
        const viewedProducts = recentViews.map(view => view.product._id);
        if (recentViews.length === 0) {
            // New user - return trending products
            const trendingProducts = await ProductView_1.default.getTrendingProducts(limitNum);
            return res.json({
                success: true,
                data: {
                    products: trendingProducts.map(item => item.product),
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
            const product = view.product;
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
                product.tags.forEach((tag) => {
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
        const recommendationFilter = {
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
        const recommendedProducts = await Product_1.default.find(recommendationFilter)
            .sort({ 'reviews.averageRating': -1, 'analytics.viewCount': -1 })
            .limit(limitNum)
            .populate('category', 'name slug')
            .select('title handle price images mobileDisplay vendor reviews');
        res.json({
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
    }
    catch (error) {
        console.error('Error generating recommendations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate recommendations'
        });
    }
};
exports.getRecommendations = getRecommendations;
const trackProductView = async (productId, userId, req) => {
    try {
        const userAgent = req.headers['user-agent'] || '';
        const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
        await ProductView_1.default.create({
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
            viewContext: req.query.from || 'direct',
            searchQuery: req.query.search
        });
    }
    catch (error) {
        console.error('Error tracking product view:', error);
    }
};
exports.trackProductView = trackProductView;
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { page = 1, limit = 10, sortBy = 'newest', rating, verified } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const filter = {
            product: productId,
            status: 'approved'
        };
        if (rating) {
            filter.rating = parseInt(rating);
        }
        if (verified === 'true') {
            filter.verifiedPurchase = true;
        }
        let sort = {};
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
        const reviews = await ProductReview_1.default.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limitNum)
            .populate('user', 'name avatar')
            .select('-adminNotes');
        const total = await ProductReview_1.default.countDocuments(filter);
        // Get rating distribution
        const ratingDistribution = await ProductReview_1.default.aggregate([
            { $match: { product: new mongoose_1.default.Types.ObjectId(productId), status: 'approved' } },
            { $group: { _id: '$rating', count: { $sum: 1 } } },
            { $sort: { _id: -1 } }
        ]);
        res.json({
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
    }
    catch (error) {
        console.error('Error fetching product reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews'
        });
    }
};
exports.getProductReviews = getProductReviews;
const getRelatedProducts = async (req, res) => {
    try {
        const { productId } = req.params;
        const { limit = 8 } = req.query;
        const limitNum = parseInt(limit);
        const product = await Product_1.default.findById(productId)
            .populate('category')
            .select('category vendor tags');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        // Find related products based on category, vendor, and tags
        const relatedProducts = await Product_1.default.aggregate([
            {
                $match: {
                    _id: { $ne: new mongoose_1.default.Types.ObjectId(productId) },
                    status: 'active',
                    $or: [
                        { category: product.category },
                        { vendor: product.vendor },
                        { tags: { $in: product.tags || [] } }
                    ]
                }
            },
            {
                $addFields: {
                    relevanceScore: {
                        $sum: [
                            { $cond: [{ $eq: ['$category', product.category] }, 3, 0] },
                            { $cond: [{ $eq: ['$vendor', product.vendor] }, 2, 0] },
                            {
                                $size: {
                                    $ifNull: [
                                        { $setIntersection: ['$tags', product.tags || []] },
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
        res.json({
            success: true,
            data: {
                products: relatedProducts
            }
        });
    }
    catch (error) {
        console.error('Error fetching related products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch related products'
        });
    }
};
exports.getRelatedProducts = getRelatedProducts;
//# sourceMappingURL=productController.js.map