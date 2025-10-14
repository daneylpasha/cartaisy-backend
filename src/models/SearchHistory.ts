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
  userId?: mongoose.Types.ObjectId; // Optional - supports guest searches
  query: string; // The search query text
  resultsCount: number; // Number of results returned
  hasResults: boolean; // Quick flag for zero-result searches
  selectedProduct?: string; // Product ID if user clicked a result
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
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      sparse: true, // Allow null for guest searches
    },
    query: {
      type: String,
      required: [true, 'Search query is required'],
      trim: true,
      lowercase: true, // Normalize for better analytics
      maxlength: [200, 'Search query cannot exceed 200 characters'],
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
SearchHistorySchema.index({ query: 1, createdAt: -1 });
SearchHistorySchema.index({ userId: 1, createdAt: -1 });
SearchHistorySchema.index({ hasResults: 1, createdAt: -1 });
SearchHistorySchema.index({ query: 1, hasResults: 1 });

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
 */
SearchHistorySchema.statics.getPopularSearches = async function (
  limit: number = 10,
  days: number = 30
): Promise<Array<{ query: string; searchCount: number; avgResultsCount: number }>> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const results = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffDate },
        hasResults: true, // Only successful searches
      },
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
 * Get search suggestions based on partial query
 * @param partialQuery - Partial search query
 * @param limit - Number of suggestions to return
 */
SearchHistorySchema.statics.getSearchSuggestions = async function (
  partialQuery: string,
  limit: number = 5
): Promise<Array<{ query: string; popularity: number }>> {
  const results = await this.aggregate([
    {
      $match: {
        query: { $regex: `^${partialQuery.toLowerCase()}`, $options: 'i' },
        hasResults: true,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      },
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
    days?: number
  ): Promise<Array<{ query: string; searchCount: number; avgResultsCount: number }>>;
  getFailedSearches(
    limit?: number,
    days?: number
  ): Promise<Array<{ query: string; searchCount: number }>>;
  getUserRecentSearches(
    userId: string,
    limit?: number
  ): Promise<Array<{ query: string; resultsCount: number; searchedAt: Date }>>;
  getSearchSuggestions(
    partialQuery: string,
    limit?: number
  ): Promise<Array<{ query: string; popularity: number }>>;
}

const SearchHistory = mongoose.model<ISearchHistoryDocument, ISearchHistoryModel>(
  'SearchHistory',
  SearchHistorySchema
);

export default SearchHistory;
