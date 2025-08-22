import mongoose, { Document, Schema } from 'mongoose';

export interface ISearchFilters {
  category?: string;
  priceMin?: number;
  priceMax?: number;
  brand?: string;
  tags?: string[];
  inStock?: boolean;
  rating?: number;
  sortBy?: string;
}

export interface ISearchResults {
  totalResults: number;
  resultsShown: number;
  hasResults: boolean;
  topResultId?: mongoose.Types.ObjectId;
  clickedResults: mongoose.Types.ObjectId[];
}

export interface ISearchHistory extends Document {
  // User identification (optional for privacy)
  user?: mongoose.Types.ObjectId;
  anonymousId?: string;
  sessionId: string;
  
  // Search details
  query: string;
  normalizedQuery: string; // Lowercased, trimmed query for analysis
  queryType: 'text' | 'voice' | 'barcode' | 'image';
  
  // Search context
  searchedAt: Date;
  source: string; // 'search_bar', 'autocomplete', 'voice_search', 'category_filter'
  
  // Filters applied
  filters: ISearchFilters;
  
  // Results
  results: ISearchResults;
  
  // User behavior
  selectedResultPosition?: number; // Which result was clicked (1-based)
  timeSpentOnResults?: number; // Seconds spent viewing results
  refinedSearch: boolean; // Did user refine the search?
  followUpQueries: mongoose.Types.ObjectId[]; // Related search IDs
  
  // Location and device (for personalization)
  location?: {
    country?: string;
    timezone?: string;
  };
  device?: {
    platform: string;
    isMobile: boolean;
  };
  
  // Analytics flags
  isSuccessful: boolean; // Did user find what they were looking for?
  conversionValue?: number; // Value of purchases made from this search
  
  // Privacy settings
  isAnonymized: boolean;
  
  // Timestamps
  createdAt: Date;
}

const SearchFiltersSchema = new Schema({
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

const SearchResultsSchema = new Schema({
  totalResults: { type: Number, required: true, min: 0 },
  resultsShown: { type: Number, required: true, min: 0 },
  hasResults: { type: Boolean, required: true },
  topResultId: { type: Schema.Types.ObjectId, ref: 'Product' },
  clickedResults: [{ type: Schema.Types.ObjectId, ref: 'Product' }]
}, { _id: false });

const SearchHistorySchema = new Schema({
  // User identification
  user: { 
    type: Schema.Types.ObjectId, 
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
  followUpQueries: [{ type: Schema.Types.ObjectId, ref: 'SearchHistory' }],
  
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
SearchHistorySchema.statics.getPopularSearches = function(limit: number = 10, days: number = 30) {
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

SearchHistorySchema.statics.getFailedSearches = function(limit: number = 10, days: number = 7) {
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

SearchHistorySchema.statics.getSearchSuggestions = async function(
  partialQuery: string, 
  limit: number = 10
): Promise<string[]> {
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

SearchHistorySchema.statics.getUserSearchHistory = function(
  userId: string, 
  limit: number = 20
) {
  return this.find({ user: userId })
    .sort({ searchedAt: -1 })
    .limit(limit)
    .select('query searchedAt results.hasResults results.totalResults isSuccessful');
};

// Pre-save hook to normalize query
SearchHistorySchema.pre('save', function(next) {
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
SearchHistorySchema.methods.createSuggestion = function(): string {
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

export default mongoose.model<ISearchHistory>('SearchHistory', SearchHistorySchema);