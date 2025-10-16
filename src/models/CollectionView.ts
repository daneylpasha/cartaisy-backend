import mongoose, { Document, Schema } from 'mongoose';

export interface IDeviceInfo {
  userAgent?: string;
  platform: string; // 'mobile', 'desktop', 'tablet'
  os?: string; // 'iOS', 'Android', 'Windows', etc.
  browser?: string;
  version?: string;
  screenWidth?: number;
  screenHeight?: number;
  deviceModel?: string;
}

export interface ILocationData {
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface ISessionData {
  sessionId: string;
  isNewSession: boolean;
  sessionStartTime: Date;
  previousPage?: string;
  referrer?: string;
  source?: string; // 'organic', 'social', 'email', 'direct', 'paid'
  medium?: string; // 'search', 'banner', 'link', etc.
  campaign?: string;
}

export interface ICollectionView extends Document {
  // User reference (optional for anonymous tracking)
  user?: mongoose.Types.ObjectId;
  anonymousId?: string; // For anonymous users

  // Collection reference
  collectionId: string; // Shopify collection ID or handle
  collectionHandle?: string; // Denormalized for faster queries
  collectionTitle?: string; // For easier display

  // View details
  viewedAt: Date;
  viewDuration?: number; // In seconds
  scrollDepth?: number; // Percentage of page scrolled

  // Session information
  session: ISessionData;

  // Device and browser info
  device: IDeviceInfo;

  // Location data (privacy compliant)
  location?: ILocationData;

  // Interaction data
  interactions: {
    productsViewed: number; // How many products in collection were viewed
    productsClicked: number; // How many products were clicked
    filtersApplied: number; // How many times filters were used
    sortingChanged: number; // How many times sorting was changed
    addedToWishlist: boolean; // Added any product to wishlist
    addedToCart: boolean; // Added any product to cart
    shared: boolean; // Shared the collection
  };

  // Context
  viewContext?: string; // 'search', 'navigation', 'recommendation', 'direct', 'featured'
  searchQuery?: string; // If viewed from search

  // Timestamps
  createdAt: Date;
}

const DeviceInfoSchema = new Schema({
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

const LocationDataSchema = new Schema({
  country: String,
  region: String,
  city: String,
  timezone: String,
  coordinates: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  }
}, { _id: false });

const SessionDataSchema = new Schema({
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

const InteractionsSchema = new Schema({
  productsViewed: { type: Number, default: 0 },
  productsClicked: { type: Number, default: 0 },
  filtersApplied: { type: Number, default: 0 },
  sortingChanged: { type: Number, default: 0 },
  addedToWishlist: { type: Boolean, default: false },
  addedToCart: { type: Boolean, default: false },
  shared: { type: Boolean, default: false }
}, { _id: false });

const CollectionViewSchema = new Schema({
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

  // Collection reference
  collectionId: {
    type: String,
    required: true,
    index: true
  },
  collectionHandle: {
    type: String,
    index: true
  },
  collectionTitle: String,

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
    enum: ['search', 'navigation', 'recommendation', 'direct', 'featured', 'category'],
    default: 'direct',
    index: true
  },
  searchQuery: {
    type: String,
    index: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }, // Only track creation time
  collection: 'collectionviews' // Use specific collection name
});

// Indexes for analytics queries
CollectionViewSchema.index({ collectionId: 1, viewedAt: -1 });
CollectionViewSchema.index({ user: 1, viewedAt: -1 });
CollectionViewSchema.index({ 'session.sessionId': 1, viewedAt: 1 });
CollectionViewSchema.index({ viewedAt: -1 }); // For time-based analytics
CollectionViewSchema.index({ 'device.platform': 1, viewedAt: -1 });
CollectionViewSchema.index({ viewContext: 1, viewedAt: -1 });

// Compound indexes for common analytics queries
CollectionViewSchema.index({
  collectionId: 1,
  'device.platform': 1,
  viewedAt: -1
});
CollectionViewSchema.index({
  viewContext: 1,
  collectionId: 1,
  viewedAt: -1
});

// TTL index to automatically delete old views (90 days)
CollectionViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Static methods for analytics
CollectionViewSchema.statics.getCollectionViews = function(
  collectionId: string,
  startDate: Date,
  endDate: Date
) {
  return this.countDocuments({
    collectionId: collectionId,
    viewedAt: { $gte: startDate, $lte: endDate }
  });
};

CollectionViewSchema.statics.getUniqueViewers = function(
  collectionId: string,
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        collectionId: collectionId,
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

CollectionViewSchema.statics.getViewsByPlatform = function(
  collectionId: string,
  startDate: Date,
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        collectionId: collectionId,
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

CollectionViewSchema.statics.getTrendingCollections = function(
  limit: number = 10,
  timeframe: number = 7 // days
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
        _id: '$collectionId',
        collectionHandle: { $first: '$collectionHandle' },
        collectionTitle: { $first: '$collectionTitle' },
        views: { $sum: 1 },
        uniqueViews: { $addToSet: { user: '$user', anonymousId: '$anonymousId' } },
        avgDuration: { $avg: '$viewDuration' },
        totalInteractions: {
          $sum: {
            $add: [
              '$interactions.productsViewed',
              '$interactions.productsClicked',
              '$interactions.filtersApplied',
              { $cond: ['$interactions.addedToWishlist', 2, 0] }, // Weight wishlist higher
              { $cond: ['$interactions.addedToCart', 3, 0] } // Weight cart even higher
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
      $project: {
        collectionId: '$_id',
        collectionHandle: 1,
        collectionTitle: 1,
        views: 1,
        uniqueViewCount: 1,
        avgDuration: 1,
        totalInteractions: 1,
        engagementScore: 1,
        _id: 0
      }
    }
  ]);
};

// Method to get growth rate for trending detection
CollectionViewSchema.statics.getCollectionsWithGrowth = function(
  limit: number = 10,
  currentPeriodDays: number = 7,
  previousPeriodDays: number = 7
) {
  const now = new Date();
  const currentPeriodStart = new Date(now.getTime() - currentPeriodDays * 24 * 60 * 60 * 1000);
  const previousPeriodStart = new Date(now.getTime() - (currentPeriodDays + previousPeriodDays) * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        viewedAt: { $gte: previousPeriodStart }
      }
    },
    {
      $group: {
        _id: '$collectionId',
        collectionHandle: { $first: '$collectionHandle' },
        collectionTitle: { $first: '$collectionTitle' },
        currentPeriodViews: {
          $sum: {
            $cond: [
              { $gte: ['$viewedAt', currentPeriodStart] },
              1,
              0
            ]
          }
        },
        previousPeriodViews: {
          $sum: {
            $cond: [
              { $and: [
                { $gte: ['$viewedAt', previousPeriodStart] },
                { $lt: ['$viewedAt', currentPeriodStart] }
              ]},
              1,
              0
            ]
          }
        }
      }
    },
    {
      $addFields: {
        growthRate: {
          $cond: [
            { $gt: ['$previousPeriodViews', 0] },
            {
              $divide: [
                { $subtract: ['$currentPeriodViews', '$previousPeriodViews'] },
                '$previousPeriodViews'
              ]
            },
            { $cond: [{ $gt: ['$currentPeriodViews', 0] }, 1, 0] } // 100% growth if new
          ]
        }
      }
    },
    {
      $match: {
        currentPeriodViews: { $gte: 3 }, // Minimum 3 views
        growthRate: { $gte: 0.2 } // At least 20% growth
      }
    },
    {
      $sort: { growthRate: -1 }
    },
    {
      $limit: limit
    },
    {
      $project: {
        collectionId: '$_id',
        collectionHandle: 1,
        collectionTitle: 1,
        currentPeriodViews: 1,
        previousPeriodViews: 1,
        growthRate: 1,
        _id: 0
      }
    }
  ]);
};

// =============================================================================
// MODEL EXPORT WITH STATIC METHODS INTERFACE
// =============================================================================

export interface ICollectionViewModel extends mongoose.Model<ICollectionView> {
  getCollectionViews(
    collectionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number>;
  getUniqueViewers(
    collectionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]>;
  getViewsByPlatform(
    collectionId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]>;
  getTrendingCollections(
    limit?: number,
    timeframe?: number
  ): Promise<any[]>;
  getCollectionsWithGrowth(
    limit?: number,
    currentPeriodDays?: number,
    previousPeriodDays?: number
  ): Promise<any[]>;
}

const CollectionView = mongoose.model<ICollectionView, ICollectionViewModel>(
  'CollectionView',
  CollectionViewSchema
);

export default CollectionView;
