import mongoose, { Schema, Document } from 'mongoose';
import { SearchSortKey } from '../types/api/search';

/**
 * Search History Model
 * Tracks user search queries for analytics and personalization
 *
 * Per Shopify best practices:
 * - Store search queries for autocomplete suggestions
 * - Track results count to identify failed searches
 * - Monitor user engagement (clicks) for relevance tuning
 * - Expire old searches after 90 days (GDPR compliance)
 *
 * Reference: https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
 */

export interface ISearchFilters {
  sortKey?: SearchSortKey;
  reverse?: boolean;
  minPrice?: number;
  maxPrice?: number;
  vendor?: string;
  productType?: string;
}

export interface ISearchHistory {
  storeId?: mongoose.Types.ObjectId; // Tenant scope - which store the search was performed against
  userId?: mongoose.Types.ObjectId; // Optional - supports guest searches (dashboard users)
  customerId?: mongoose.Types.ObjectId; // Optional - for mobile app customers
  query: string; // The search query text
  searchType?: 'text' | 'product' | 'collection'; // Type of search performed
  resultsCount: number; // Number of results returned
  hasResults: boolean; // Quick flag for zero-result searches
  selectedProduct?: string; // Product ID if user clicked a result
  selectedProductId?: string; // Direct product search/click
  selectedCollectionId?: string; // Direct collection search/click
  filters?: ISearchFilters; // Applied filters
  sessionId?: string; // For tracking guest user sessions
  userAgent?: string; // Device/browser information
  createdAt: Date;
  updatedAt: Date;
}

export interface ISearchHistoryDocument extends ISearchHistory, Document {}

const SearchFiltersSchema = new Schema(
  {
    sortKey: {
      type: String,
      enum: ['RELEVANCE', 'PRICE', 'BEST_SELLING', 'CREATED_AT', 'TITLE', 'PRODUCT_TYPE', 'VENDOR'],
    },
    reverse: {
      type: Boolean,
      default: false,
    },
    minPrice: {
      type: Number,
      min: 0,
    },
    maxPrice: {
      type: Number,
      min: 0,
    },
    vendor: {
      type: String,
      trim: true,
    },
    productType: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const SearchHistorySchema = new Schema<ISearchHistory>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      index: true,
      sparse: true, // Legacy records (and non-tenant-scoped sources) may lack a store
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      sparse: true, // Allow null for guest searches
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
      sparse: true, // Allow null for guest/user searches
    },
    query: {
      type: String,
      required: [true, 'Search query is required'],
      trim: true,
      lowercase: true, // Normalize for better analytics
      maxlength: [200, 'Search query cannot exceed 200 characters'],
      index: true,
    },
    searchType: {
      type: String,
      enum: ['text', 'product', 'collection'],
      default: 'text',
      index: true,
    },
    resultsCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    hasResults: {
      type: Boolean,
      required: true,
      default: false,
      index: true, // Index for finding failed searches
    },
    selectedProduct: {
      type: String,
      trim: true,
      index: true, // Track popular products
    },
    selectedProductId: {
      type: String,
      trim: true,
      index: true, // For direct product searches
    },
    selectedCollectionId: {
      type: String,
      trim: true,
      index: true, // For direct collection searches
    },
    filters: {
      type: SearchFiltersSchema,
    },
    sessionId: {
      type: String,
      trim: true,
      index: true, // For guest user tracking
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'User agent cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'search_history',
  }
);

// =============================================================================
// INDEXES
// =============================================================================

// Compound indexes for common queries
// Tenant-scoped analytics (popular searches per store)
SearchHistorySchema.index({ storeId: 1, hasResults: 1, createdAt: -1 });
SearchHistorySchema.index({ storeId: 1, query: 1, createdAt: -1 });
SearchHistorySchema.index({ query: 1, createdAt: -1 });
SearchHistorySchema.index({ userId: 1, createdAt: -1 });
SearchHistorySchema.index({ customerId: 1, createdAt: -1 });  // Index for customer search history
SearchHistorySchema.index({ hasResults: 1, createdAt: -1 });
SearchHistorySchema.index({ query: 1, hasResults: 1 });
SearchHistorySchema.index({ userId: 1, searchType: 1, createdAt: -1 }); // For enriched searches
SearchHistorySchema.index({ customerId: 1, searchType: 1, createdAt: -1 }); // For customer enriched searches
SearchHistorySchema.index({ searchType: 1, createdAt: -1 }); // For trending by type

// TTL index - auto-delete records older than 90 days (GDPR compliance)
SearchHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Text index for search suggestions
SearchHistorySchema.index({ query: 'text' });

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Get popular searches (most searched terms)
 * @param limit - Number of results to return
 * @param days - Number of days to look back (default: 30)
 * @param storeId - Optional tenant scope; when provided, only that store's searches are counted
 */
SearchHistorySchema.statics.getPopularSearches = async function (
  limit: number = 10,
  days: number = 30,
  storeId?: string
): Promise<Array<{ query: string; searchCount: number; avgResultsCount: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const match: Record<string, unknown> = {
    createdAt: { $gte: cutoffDate },
    hasResults: true, // Only successful searches
  };

  // Scope to a single tenant when a store is supplied (multi-tenant isolation)
  if (storeId) {
    match.storeId = new mongoose.Types.ObjectId(storeId);
  }

  const results = await this.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: '$query',
        searchCount: { $sum: 1 },
        avgResultsCount: { $avg: '$resultsCount' },
      },
    },
    {
      $sort: { searchCount: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        query: '$_id',
        searchCount: 1,
        avgResultsCount: { $round: ['$avgResultsCount', 0] },
      },
    },
  ]);

  return results;
};

/**
 * Get failed searches (zero results)
 * @param limit - Number of results to return
 * @param days - Number of days to look back (default: 7)
 */
SearchHistorySchema.statics.getFailedSearches = async function (
  limit: number = 20,
  days: number = 7
): Promise<Array<{ query: string; searchCount: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const results = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffDate },
        hasResults: false,
      },
    },
    {
      $group: {
        _id: '$query',
        searchCount: { $sum: 1 },
      },
    },
    {
      $sort: { searchCount: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        query: '$_id',
        searchCount: 1,
      },
    },
  ]);

  return results;
};

/**
 * Get user's recent search history
 * @param userId - User ID
 * @param limit - Number of results to return
 */
SearchHistorySchema.statics.getUserRecentSearches = async function (
  userId: string,
  limit: number = 10
): Promise<
  Array<{
    query: string;
    resultsCount: number;
    searchedAt: Date;
  }>
> {
  const results = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: limit * 2, // Get more to allow for deduplication
    },
    {
      $group: {
        _id: '$query',
        lastSearched: { $first: '$createdAt' },
        resultsCount: { $first: '$resultsCount' },
      },
    },
    {
      $sort: { lastSearched: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        query: '$_id',
        resultsCount: 1,
        searchedAt: '$lastSearched',
      },
    },
  ]);

  return results;
};

/**
 * Get user's recent searches with entity information (for enriched display)
 * @param userId - User ID
 * @param limit - Number of results to return (default: 5)
 */
SearchHistorySchema.statics.getUserEnrichedSearches = async function (
  userId: string,
  limit: number = 5,
  storeId?: string
): Promise<
  Array<{
    query: string;
    searchedAt: Date;
    searchType: 'text' | 'product' | 'collection';
    selectedProductId?: string;
    selectedCollectionId?: string;
  }>
> {
  const matchStage: Record<string, unknown> = {
    userId: new mongoose.Types.ObjectId(userId),
    searchType: { $in: ['product', 'collection'] }, // Only product/collection searches
  };

  if (storeId) {
    matchStage.storeId = new mongoose.Types.ObjectId(storeId);
  }

  const results = await this.aggregate([
    {
      $match: matchStage,
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: limit * 2, // Get more to allow for deduplication
    },
    {
      $group: {
        _id: {
          searchType: '$searchType',
          entityId: {
            $cond: [
              { $eq: ['$searchType', 'product'] },
              '$selectedProductId',
              '$selectedCollectionId'
            ]
          }
        },
        lastSearched: { $first: '$createdAt' },
        query: { $first: '$query' },
        searchType: { $first: '$searchType' },
        selectedProductId: { $first: '$selectedProductId' },
        selectedCollectionId: { $first: '$selectedCollectionId' },
      },
    },
    {
      $sort: { lastSearched: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        query: 1,
        searchedAt: '$lastSearched',
        searchType: 1,
        selectedProductId: 1,
        selectedCollectionId: 1,
      },
    },
  ]);

  return results;
};

/**
 * Get trending searches with entity information (for enriched display)
 * @param limit - Number of results to return (default: 5)
 * @param days - Days to look back (default: 7)
 */
SearchHistorySchema.statics.getTrendingEnrichedSearches = async function (
  limit: number = 5,
  days: number = 7,
  storeId?: string
): Promise<
  Array<{
    query: string;
    searchType: 'text' | 'product' | 'collection';
    recentCount: number;
    growthRate: number;
    selectedProductId?: string;
    selectedCollectionId?: string;
  }>
> {
  const recentCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const previousCutoff = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
  const storeObjectId = storeId ? new mongoose.Types.ObjectId(storeId) : undefined;
  const matchStage: Record<string, unknown> = {
    createdAt: { $gte: recentCutoff },
    searchType: { $in: ['product', 'collection'] }, // Only product/collection searches
  };

  if (storeObjectId) {
    matchStage.storeId = storeObjectId;
  }

  const results = await this.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: {
          searchType: '$searchType',
          entityId: {
            $cond: [
              { $eq: ['$searchType', 'product'] },
              '$selectedProductId',
              '$selectedCollectionId'
            ]
          }
        },
        recentCount: { $sum: 1 },
        query: { $first: '$query' },
        searchType: { $first: '$searchType' },
        selectedProductId: { $first: '$selectedProductId' },
        selectedCollectionId: { $first: '$selectedCollectionId' },
      },
    },
    {
      $lookup: {
        from: 'search_history',
        let: {
          searchType: '$searchType',
          entityId: '$_id.entityId'
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$searchType', '$$searchType'] },
                  { $gte: ['$createdAt', previousCutoff] },
                  { $lt: ['$createdAt', recentCutoff] },
                  ...(storeObjectId ? [{ $eq: ['$storeId', storeObjectId] }] : []),
                  {
                    $eq: [
                      {
                        $cond: [
                          { $eq: ['$searchType', 'product'] },
                          '$selectedProductId',
                          '$selectedCollectionId'
                        ]
                      },
                      '$$entityId'
                    ]
                  }
                ]
              }
            }
          },
          { $count: 'count' }
        ],
        as: 'previousPeriod'
      }
    },
    {
      $addFields: {
        previousCount: { $ifNull: [{ $arrayElemAt: ['$previousPeriod.count', 0] }, 0] },
        growthRate: {
          $cond: {
            if: { $gt: [{ $arrayElemAt: ['$previousPeriod.count', 0] }, 0] },
            then: {
              $divide: [
                { $subtract: ['$recentCount', { $arrayElemAt: ['$previousPeriod.count', 0] }] },
                { $arrayElemAt: ['$previousPeriod.count', 0] }
              ]
            },
            else: 1
          }
        }
      }
    },
    {
      $match: {
        recentCount: { $gte: 2 }, // Minimum threshold
        growthRate: { $gte: 0.2 } // At least 20% growth
      }
    },
    {
      $sort: { growthRate: -1, recentCount: -1 }
    },
    {
      $limit: limit
    },
    {
      $project: {
        _id: 0,
        query: 1,
        searchType: 1,
        recentCount: 1,
        growthRate: 1,
        selectedProductId: 1,
        selectedCollectionId: 1,
      }
    }
  ]);

  return results;
};

/**
 * Get search suggestions based on partial query
 * @param partialQuery - Partial search query
 * @param limit - Number of suggestions to return
 */
SearchHistorySchema.statics.getSearchSuggestions = async function (
  partialQuery: string,
  limit: number = 5,
  storeId?: string
): Promise<Array<{ query: string; popularity: number }>> {
  const escapedQuery = partialQuery.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matchStage: Record<string, unknown> = {
    query: { $regex: `^${escapedQuery}`, $options: 'i' },
    hasResults: true,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
  };

  if (storeId) {
    matchStage.storeId = new mongoose.Types.ObjectId(storeId);
  }

  const results = await this.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: '$query',
        popularity: { $sum: 1 },
      },
    },
    {
      $sort: { popularity: -1 },
    },
    {
      $limit: limit,
    },
    {
      $project: {
        _id: 0,
        query: '$_id',
        popularity: 1,
      },
    },
  ]);

  return results;
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

export interface ISearchHistoryModel extends mongoose.Model<ISearchHistoryDocument> {
  getPopularSearches(
    limit?: number,
    days?: number,
    storeId?: string
  ): Promise<Array<{ query: string; searchCount: number; avgResultsCount: number }>>;
  getFailedSearches(
    limit?: number,
    days?: number
  ): Promise<Array<{ query: string; searchCount: number }>>;
  getUserRecentSearches(
    userId: string,
    limit?: number
  ): Promise<Array<{ query: string; resultsCount: number; searchedAt: Date }>>;
  getUserEnrichedSearches(
    userId: string,
    limit?: number,
    storeId?: string
  ): Promise<Array<{
    query: string;
    searchedAt: Date;
    searchType: 'text' | 'product' | 'collection';
    selectedProductId?: string;
    selectedCollectionId?: string;
  }>>;
  getTrendingEnrichedSearches(
    limit?: number,
    days?: number,
    storeId?: string
  ): Promise<Array<{
    query: string;
    searchType: 'text' | 'product' | 'collection';
    recentCount: number;
    growthRate: number;
    selectedProductId?: string;
    selectedCollectionId?: string;
  }>>;
  getSearchSuggestions(
    partialQuery: string,
    limit?: number,
    storeId?: string
  ): Promise<Array<{ query: string; popularity: number }>>;
  getUserSearchHistory(
    userId: string,
    limit?: number
  ): Promise<any[]>;
}

const SearchHistory = mongoose.model('SearchHistory', SearchHistorySchema) as unknown as ISearchHistoryModel;

export default SearchHistory;
