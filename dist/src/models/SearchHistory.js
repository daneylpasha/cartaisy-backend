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
const SearchFiltersSchema = new mongoose_1.Schema({
    category: String,
    priceMin: { type: Number, min: 0 },
    priceMax: { type: Number, min: 0 },
    brand: String,
    tags: [String],
    inStock: Boolean,
    rating: { type: Number, min: 1, max: 5 },
    sortBy: {
        type: String,
        enum: ['relevance', 'price_low', 'price_high', 'newest', 'rating', 'popular']
    }
}, { _id: false });
const SearchResultsSchema = new mongoose_1.Schema({
    totalResults: { type: Number, required: true, min: 0 },
    resultsShown: { type: Number, required: true, min: 0 },
    hasResults: { type: Boolean, required: true },
    topResultId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product' },
    clickedResults: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Product' }]
}, { _id: false });
const SearchHistorySchema = new mongoose_1.Schema({
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
    sessionId: {
        type: String,
        required: true,
        index: true
    },
    // Search details
    query: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    normalizedQuery: {
        type: String,
        required: true,
        lowercase: true,
        index: true
    },
    queryType: {
        type: String,
        enum: ['text', 'voice', 'barcode', 'image'],
        default: 'text',
        index: true
    },
    // Context
    searchedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    source: {
        type: String,
        enum: ['search_bar', 'autocomplete', 'voice_search', 'category_filter', 'suggestion'],
        default: 'search_bar',
        index: true
    },
    // Filters and results
    filters: SearchFiltersSchema,
    results: SearchResultsSchema,
    // User behavior
    selectedResultPosition: {
        type: Number,
        min: 1
    },
    timeSpentOnResults: {
        type: Number,
        min: 0
    },
    refinedSearch: {
        type: Boolean,
        default: false
    },
    followUpQueries: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'SearchHistory' }],
    // Context data
    location: {
        country: String,
        timezone: String
    },
    device: {
        platform: { type: String, enum: ['mobile', 'desktop', 'tablet'] },
        isMobile: { type: Boolean, default: false }
    },
    // Analytics
    isSuccessful: {
        type: Boolean,
        default: false,
        index: true
    },
    conversionValue: {
        type: Number,
        min: 0
    },
    // Privacy
    isAnonymized: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});
// Indexes for analytics and search suggestions
SearchHistorySchema.index({ normalizedQuery: 1, searchedAt: -1 });
SearchHistorySchema.index({ query: 'text' });
SearchHistorySchema.index({ searchedAt: -1 });
SearchHistorySchema.index({ user: 1, searchedAt: -1 });
SearchHistorySchema.index({ queryType: 1, source: 1 });
SearchHistorySchema.index({ 'results.hasResults': 1, searchedAt: -1 });
// Compound index for personalization
SearchHistorySchema.index({
    user: 1,
    normalizedQuery: 1,
    searchedAt: -1
});
// TTL index to automatically delete old searches (180 days for privacy)
SearchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
// Static methods for analytics
SearchHistorySchema.statics.getPopularSearches = function (limit = 10, days = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.aggregate([
        {
            $match: {
                searchedAt: { $gte: startDate },
                'results.hasResults': true,
                normalizedQuery: { $ne: '' }
            }
        },
        {
            $group: {
                _id: '$normalizedQuery',
                count: { $sum: 1 },
                successfulSearches: { $sum: { $cond: ['$isSuccessful', 1, 0] } },
                averageResults: { $avg: '$results.totalResults' },
                totalConversionValue: { $sum: '$conversionValue' }
            }
        },
        {
            $addFields: {
                successRate: { $divide: ['$successfulSearches', '$count'] },
                avgConversionValue: { $divide: ['$totalConversionValue', '$count'] }
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: limit
        }
    ]);
};
SearchHistorySchema.statics.getFailedSearches = function (limit = 10, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.aggregate([
        {
            $match: {
                searchedAt: { $gte: startDate },
                $or: [
                    { 'results.hasResults': false },
                    { 'results.totalResults': 0 }
                ]
            }
        },
        {
            $group: {
                _id: '$normalizedQuery',
                count: { $sum: 1 },
                lastSearched: { $max: '$searchedAt' }
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: limit
        }
    ]);
};
SearchHistorySchema.statics.getSearchSuggestions = async function (partialQuery, limit = 10) {
    const normalized = partialQuery.toLowerCase().trim();
    const suggestions = await this.aggregate([
        {
            $match: {
                normalizedQuery: new RegExp(`^${normalized}`),
                'results.hasResults': true,
                searchedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
            }
        },
        {
            $group: {
                _id: '$normalizedQuery',
                count: { $sum: 1 },
                successRate: { $avg: { $cond: ['$isSuccessful', 1, 0] } },
                lastSearched: { $max: '$searchedAt' }
            }
        },
        {
            $addFields: {
                score: {
                    $multiply: [
                        '$count',
                        { $add: [1, '$successRate'] }, // Boost successful searches
                        { $divide: [1, { $add: [1, { $divide: [{ $subtract: [new Date(), '$lastSearched'] }, 86400000] }] }] } // Recency boost
                    ]
                }
            }
        },
        {
            $sort: { score: -1 }
        },
        {
            $limit: limit
        },
        {
            $project: { _id: 1 }
        }
    ]);
    return suggestions.map(s => s._id);
};
SearchHistorySchema.statics.getUserSearchHistory = function (userId, limit = 20) {
    return this.find({ user: userId })
        .sort({ searchedAt: -1 })
        .limit(limit)
        .select('query searchedAt results.hasResults results.totalResults isSuccessful');
};
// Pre-save hook to normalize query
SearchHistorySchema.pre('save', function (next) {
    if (this.isModified('query') || this.isNew) {
        this.normalizedQuery = this.query.toLowerCase().trim();
    }
    // Auto-detect successful searches based on behavior
    if (this.selectedResultPosition && this.timeSpentOnResults && this.timeSpentOnResults > 10) {
        this.isSuccessful = true;
    }
    next();
});
// Method to create search suggestion
SearchHistorySchema.methods.createSuggestion = function () {
    const words = this.normalizedQuery.split(' ');
    // Return the query if it's likely to be a good suggestion
    if (this.results.hasResults &&
        this.results.totalResults > 0 &&
        this.results.totalResults < 1000 && // Not too broad
        words.length <= 4) { // Not too complex
        return this.query;
    }
    return '';
};
exports.default = mongoose_1.default.model('SearchHistory', SearchHistorySchema);
//# sourceMappingURL=SearchHistory.js.map