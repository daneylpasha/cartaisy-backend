"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSearchAnalytics = exports.clearUserSearchHistory = exports.getUserSearchHistory = exports.trackSearchClick = exports.getFailedSearches = exports.getTrendingSearches = exports.getPopularSearches = exports.getSearchSuggestions = exports.search = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const SearchHistory_1 = __importDefault(require("../models/SearchHistory"));
const Product_1 = __importDefault(require("../models/Product"));
const ProductCategory_1 = __importDefault(require("../models/ProductCategory"));
const search = async (req, res) => {
    try {
        const { q: query, page = 1, limit = 20, category, priceMin, priceMax, brand, rating, inStock, sortBy = 'relevance', filters } = req.query;
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const searchQuery = query.trim();
        // Build search aggregation pipeline
        const pipeline = [
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
        const filterStage = {};
        if (category) {
            filterStage.category = new mongoose_1.default.Types.ObjectId(category);
        }
        if (brand) {
            filterStage.vendor = new RegExp(brand, 'i');
        }
        if (priceMin || priceMax) {
            filterStage.price = {};
            if (priceMin)
                filterStage.price.$gte = parseFloat(priceMin);
            if (priceMax)
                filterStage.price.$lte = parseFloat(priceMax);
        }
        if (rating) {
            filterStage['reviews.averageRating'] = { $gte: parseFloat(rating) };
        }
        if (inStock === 'true') {
            filterStage['inventoryTracking.totalQuantity'] = { $gt: 0 };
        }
        if (Object.keys(filterStage).length > 0) {
            pipeline.push({ $match: filterStage });
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
        const countResult = await Product_1.default.aggregate(countPipeline);
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
        const products = await Product_1.default.aggregate(pipeline);
        // Log search history
        const userId = req.user?.id;
        const sessionId = req.sessionID || 'anonymous';
        await SearchHistory_1.default.create({
            user: userId,
            anonymousId: !userId ? sessionId : undefined,
            sessionId,
            query: searchQuery,
            normalizedQuery: searchQuery.toLowerCase(),
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
    }
    catch (error) {
        console.error('Error performing search:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
        });
    }
};
exports.search = search;
const getSearchSuggestions = async (req, res) => {
    try {
        const { q: query, limit = 10 } = req.query;
        if (!query || query.trim().length < 2) {
            return res.json({
                success: true,
                data: {
                    suggestions: []
                }
            });
        }
        const limitNum = parseInt(limit);
        const searchQuery = query.trim();
        // Get suggestions from search history
        const suggestions = await SearchHistory_1.default.getSearchSuggestions(searchQuery, limitNum);
        // Get product suggestions based on title/tags
        const productSuggestions = await Product_1.default.find({
            $text: { $search: searchQuery },
            status: 'active'
        })
            .sort({ score: { $meta: 'textScore' } })
            .limit(5)
            .select('title handle');
        // Get category suggestions
        const categorySuggestions = await ProductCategory_1.default.find({
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
    }
    catch (error) {
        console.error('Error getting search suggestions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get suggestions'
        });
    }
};
exports.getSearchSuggestions = getSearchSuggestions;
const getPopularSearches = async (req, res) => {
    try {
        const { limit = 10, days = 30 } = req.query;
        const limitNum = parseInt(limit);
        const daysNum = parseInt(days);
        const popularSearches = await SearchHistory_1.default.getPopularSearches(limitNum, daysNum);
        res.json({
            success: true,
            data: {
                searches: popularSearches
            }
        });
    }
    catch (error) {
        console.error('Error getting popular searches:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get popular searches'
        });
    }
};
exports.getPopularSearches = getPopularSearches;
const getTrendingSearches = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const limitNum = parseInt(limit);
        // Get searches from last 7 days with growth rate
        const trendingSearches = await SearchHistory_1.default.aggregate([
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
    }
    catch (error) {
        console.error('Error getting trending searches:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get trending searches'
        });
    }
};
exports.getTrendingSearches = getTrendingSearches;
const getFailedSearches = async (req, res) => {
    try {
        const { limit = 10, days = 7 } = req.query;
        const limitNum = parseInt(limit);
        const daysNum = parseInt(days);
        const failedSearches = await SearchHistory_1.default.getFailedSearches(limitNum, daysNum);
        res.json({
            success: true,
            data: {
                searches: failedSearches
            }
        });
    }
    catch (error) {
        console.error('Error getting failed searches:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get failed searches'
        });
    }
};
exports.getFailedSearches = getFailedSearches;
const trackSearchClick = async (req, res) => {
    try {
        const { searchId, productId, position } = req.body;
        if (!searchId || !productId) {
            return res.status(400).json({
                success: false,
                message: 'Search ID and Product ID are required'
            });
        }
        const searchRecord = await SearchHistory_1.default.findById(searchId);
        if (!searchRecord) {
            return res.status(404).json({
                success: false,
                message: 'Search record not found'
            });
        }
        // Update search record with click data
        searchRecord.results.clickedResults.push(new mongoose_1.default.Types.ObjectId(productId));
        if (position) {
            searchRecord.selectedResultPosition = position;
        }
        searchRecord.isSuccessful = true;
        await searchRecord.save();
        res.json({
            success: true,
            message: 'Search click tracked'
        });
    }
    catch (error) {
        console.error('Error tracking search click:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track search click'
        });
    }
};
exports.trackSearchClick = trackSearchClick;
const getUserSearchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { limit = 20 } = req.query;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        const limitNum = parseInt(limit);
        const searchHistory = await SearchHistory_1.default.getUserSearchHistory(userId, limitNum);
        res.json({
            success: true,
            data: {
                searches: searchHistory
            }
        });
    }
    catch (error) {
        console.error('Error getting user search history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get search history'
        });
    }
};
exports.getUserSearchHistory = getUserSearchHistory;
const clearUserSearchHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        await SearchHistory_1.default.deleteMany({ user: userId });
        res.json({
            success: true,
            message: 'Search history cleared'
        });
    }
    catch (error) {
        console.error('Error clearing search history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear search history'
        });
    }
};
exports.clearUserSearchHistory = clearUserSearchHistory;
const getSearchAnalytics = async (req, res) => {
    try {
        const { timeframe = '30' } = req.query;
        const days = parseInt(timeframe);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        // Get search volume trend
        const searchVolume = await SearchHistory_1.default.aggregate([
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
        const queryTypes = await SearchHistory_1.default.aggregate([
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
        const deviceStats = await SearchHistory_1.default.aggregate([
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
        const sourceStats = await SearchHistory_1.default.aggregate([
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
    }
    catch (error) {
        console.error('Error getting search analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get search analytics'
        });
    }
};
exports.getSearchAnalytics = getSearchAnalytics;
//# sourceMappingURL=searchController.js.map