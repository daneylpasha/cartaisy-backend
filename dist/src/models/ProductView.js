"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const DeviceInfoSchema = new mongoose_1.Schema({
    userAgent: String,
    platform: {
        type: String,
        enum: ['mobile', 'desktop', 'tablet'],
        required: true
    },
    os: String,
    browser: String,
    version: String,
    screenWidth: Number,
    screenHeight: Number,
    deviceModel: String
}, { _id: false });
const LocationDataSchema = new mongoose_1.Schema({
    country: String,
    region: String,
    city: String,
    timezone: String,
    coordinates: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 }
    }
}, { _id: false });
const SessionDataSchema = new mongoose_1.Schema({
    sessionId: { type: String, required: true, index: true },
    isNewSession: { type: Boolean, default: false },
    sessionStartTime: { type: Date, required: true },
    previousPage: String,
    referrer: String,
    source: {
        type: String,
        enum: ['organic', 'social', 'email', 'direct', 'paid', 'referral'],
        default: 'direct'
    },
    medium: String,
    campaign: String
}, { _id: false });
const InteractionsSchema = new mongoose_1.Schema({
    clickedImages: { type: Number, default: 0 },
    clickedVariants: { type: Number, default: 0 },
    addedToWishlist: { type: Boolean, default: false },
    addedToCart: { type: Boolean, default: false },
    shared: { type: Boolean, default: false },
    reviewsViewed: { type: Boolean, default: false }
}, { _id: false });
const ProductViewSchema = new mongoose_1.Schema({
    // User identification
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        sparse: true,
        index: true
    },
    anonymousId: {
        type: String,
        sparse: true,
        index: true
    },
    // Product reference
    product: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    productHandle: {
        type: String,
        index: true
    },
    // View details
    viewedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    viewDuration: {
        type: Number,
        min: 0
    },
    scrollDepth: {
        type: Number,
        min: 0,
        max: 100
    },
    // Session and device info
    session: SessionDataSchema,
    device: DeviceInfoSchema,
    location: LocationDataSchema,
    // Interactions
    interactions: InteractionsSchema,
    // Context
    viewContext: {
        type: String,
        enum: ['search', 'category', 'recommendation', 'direct', 'related', 'featured'],
        default: 'direct',
        index: true
    },
    searchQuery: {
        type: String,
        index: true
    },
    categoryId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'ProductCategory',
        index: true
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
    collection: 'productviews' // Use specific collection name
});
// Indexes for analytics queries
ProductViewSchema.index({ product: 1, viewedAt: -1 });
ProductViewSchema.index({ user: 1, viewedAt: -1 });
ProductViewSchema.index({ 'session.sessionId': 1, viewedAt: 1 });
ProductViewSchema.index({ viewedAt: -1 }); // For time-based analytics
ProductViewSchema.index({ 'device.platform': 1, viewedAt: -1 });
ProductViewSchema.index({ viewContext: 1, viewedAt: -1 });
// Compound indexes for common analytics queries
ProductViewSchema.index({
    product: 1,
    'device.platform': 1,
    viewedAt: -1
});
ProductViewSchema.index({
    viewContext: 1,
    product: 1,
    viewedAt: -1
});
// TTL index to automatically delete old views (90 days)
ProductViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
// Static methods for analytics
ProductViewSchema.statics.getProductViews = function (productId, startDate, endDate) {
    return this.countDocuments({
        product: productId,
        viewedAt: { $gte: startDate, $lte: endDate }
    });
};
ProductViewSchema.statics.getUniqueViewers = function (productId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                product: new mongoose_1.default.Types.ObjectId(productId),
                viewedAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    user: '$user',
                    anonymousId: '$anonymousId'
                }
            }
        },
        {
            $count: 'uniqueViewers'
        }
    ]);
};
ProductViewSchema.statics.getViewsByPlatform = function (productId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                product: new mongoose_1.default.Types.ObjectId(productId),
                viewedAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$device.platform',
                count: { $sum: 1 },
                avgDuration: { $avg: '$viewDuration' },
                avgScrollDepth: { $avg: '$scrollDepth' }
            }
        }
    ]);
};
ProductViewSchema.statics.getTrendingProducts = function (limit = 10, timeframe = 7 // days
) {
    const startDate = new Date(Date.now() - timeframe * 24 * 60 * 60 * 1000);
    return this.aggregate([
        {
            $match: {
                viewedAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: '$product',
                views: { $sum: 1 },
                uniqueViews: { $addToSet: { user: '$user', anonymousId: '$anonymousId' } },
                avgDuration: { $avg: '$viewDuration' },
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
                uniqueViewCount: { $size: '$uniqueViews' },
                engagementScore: {
                    $multiply: [
                        { $divide: ['$totalInteractions', '$views'] },
                        { $ln: { $add: ['$views', 1] } }
                    ]
                }
            }
        },
        {
            $sort: { engagementScore: -1 }
        },
        {
            $limit: limit
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
};
// Post-save hook to update product analytics
ProductViewSchema.post('save', async function () {
    try {
        const Product = mongoose_1.default.model('Product');
        await Product.findByIdAndUpdate(this.product, {
            $inc: { 'analytics.viewCount': 1 },
            'analytics.lastViewedAt': this.viewedAt
        });
    }
    catch (error) {
        console.error('Error updating product view count:', error);
    }
});
exports.default = mongoose_1.default.model('ProductView', ProductViewSchema);
//# sourceMappingURL=ProductView.js.map