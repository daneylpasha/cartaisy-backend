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

export interface IProductView extends Document {
  // User reference (optional for anonymous tracking)
  user?: mongoose.Types.ObjectId;
  anonymousId?: string; // For anonymous users
  
  // Product reference
  product: mongoose.Types.ObjectId;
  productHandle?: string; // Denormalized for faster queries
  
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
    clickedImages: number;
    clickedVariants: number;
    addedToWishlist: boolean;
    addedToCart: boolean;
    shared: boolean;
    reviewsViewed: boolean;
  };
  
  // Context
  viewContext?: string; // 'search', 'category', 'recommendation', 'direct', 'related'
  searchQuery?: string; // If viewed from search
  categoryId?: mongoose.Types.ObjectId; // If viewed from category
  
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
  clickedImages: { type: Number, default: 0 },
  clickedVariants: { type: Number, default: 0 },
  addedToWishlist: { type: Boolean, default: false },
  addedToCart: { type: Boolean, default: false },
  shared: { type: Boolean, default: false },
  reviewsViewed: { type: Boolean, default: false }
}, { _id: false });

const ProductViewSchema = new Schema({
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
  
  // Product reference
  product: { 
    type: Schema.Types.ObjectId, 
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
    type: Schema.Types.ObjectId, 
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
ProductViewSchema.statics.getProductViews = function(
  productId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.countDocuments({
    product: productId,
    viewedAt: { $gte: startDate, $lte: endDate }
  });
};

ProductViewSchema.statics.getUniqueViewers = function(
  productId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
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

ProductViewSchema.statics.getViewsByPlatform = function(
  productId: string, 
  startDate: Date, 
  endDate: Date
) {
  return this.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
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

ProductViewSchema.statics.getTrendingProducts = function(
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
ProductViewSchema.post('save', async function() {
  try {
    const Product = mongoose.model('Product');
    await Product.findByIdAndUpdate(this.product, {
      $inc: { 'analytics.viewCount': 1 },
      'analytics.lastViewedAt': this.viewedAt
    });
  } catch (error) {
    console.error('Error updating product view count:', error);
  }
});

// =============================================================================
// MODEL EXPORT WITH STATIC METHODS INTERFACE
// =============================================================================

export interface IProductViewModel extends mongoose.Model<IProductView> {
  getProductViews(
    productId: string,
    startDate: Date,
    endDate: Date
  ): Promise<number>;
  getUniqueViewers(
    productId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]>;
  getViewsByPlatform(
    productId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]>;
  getTrendingProducts(
    limit?: number,
    timeframe?: number
  ): Promise<any[]>;
}

const ProductView = mongoose.model<IProductView, IProductViewModel>(
  'ProductView',
  ProductViewSchema
);

export default ProductView;