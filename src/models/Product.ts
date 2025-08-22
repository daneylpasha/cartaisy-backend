import mongoose, { Schema, Document } from 'mongoose';
import {
  IProduct,
  IProductVariant,
  IProductImage,
  IInventoryTracking,
  IMobileDisplay,
  IProductAnalytics,
  IProductReviews,
  IProductSEO,
  MongooseDocument,
} from '../types/index';

/**
 * Product Mongoose Model
 * 
 * Comprehensive product model that extends Shopify products with mobile-specific features,
 * analytics, SEO optimization, and inventory management.
 */

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const VariantInventorySchema = new Schema({
  quantity: { type: Number, required: true, min: 0, default: 0 },
  policy: { 
    type: String, 
    enum: ['deny', 'continue'], 
    default: 'deny' 
  },
  tracked: { type: Boolean, default: true }
}, { _id: false });

const VariantOptionsSchema = new Schema({
  option1: { type: String },
  option2: { type: String },
  option3: { type: String }
}, { _id: false });

const ProductVariantSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true, maxlength: 255 },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, min: 0 },
  sku: { type: String, sparse: true },
  inventory: { type: VariantInventorySchema, required: true },
  weight: { type: Number, min: 0 },
  weightUnit: { 
    type: String, 
    enum: ['g', 'kg', 'oz', 'lb'], 
    default: 'kg' 
  },
  options: { type: VariantOptionsSchema, required: true }
}, { _id: false });

const ProductImageSchema = new Schema({
  url: { type: String, required: true },
  alt: { type: String, required: true },
  position: { type: Number, required: true, min: 1 },
  width: { type: Number, min: 1 },
  height: { type: Number, min: 1 }
}, { _id: false });

const InventoryHistorySchema = new Schema({
  date: { type: Date, required: true, default: Date.now },
  change: { type: Number, required: true },
  newQuantity: { type: Number, required: true, min: 0 },
  reason: {
    type: String,
    required: true,
    enum: ['sale', 'restock', 'adjustment', 'return', 'shopify_sync', 'manual_update']
  },
  note: { type: String, maxlength: 500 }
}, { _id: false });

const InventoryTrackingSchema = new Schema({
  totalQuantity: { type: Number, required: true, min: 0, default: 0 },
  tracked: { type: Boolean, default: true },
  lowStockThreshold: { type: Number, min: 0, default: 5 },
  history: { type: [InventoryHistorySchema], default: [] }
}, { _id: false });

const MobileDisplaySchema = new Schema({
  thumbnailUrl: { type: String, required: true },
  priority: { type: Number, min: 1, max: 10, default: 1 },
  isFeatured: { type: Boolean, default: false },
  shortDescription: { type: String, maxlength: 200, required: true }
}, { _id: false });

const ConversionEventSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['view_to_cart', 'cart_to_purchase', 'view_to_purchase']
  },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String },
  timestamp: { type: Date, required: true, default: Date.now },
  value: { type: Number, min: 0 }
}, { _id: false });

const ProductAnalyticsSchema = new Schema({
  viewCount: { type: Number, min: 0, default: 0 },
  favoriteCount: { type: Number, min: 0, default: 0 },
  conversionRate: { type: Number, min: 0, max: 1, default: 0 },
  averageTimeOnPage: { type: Number, min: 0, default: 0 },
  conversionEvents: { type: [ConversionEventSchema], default: [] },
  lastViewedAt: { type: Date, required: true, default: Date.now },
  engagementScore: { type: Number, min: 0, default: 0 },
  lastCalculated: { type: Date }
}, { _id: false });

const ProductReviewsSchema = new Schema({
  count: { type: Number, min: 0, default: 0 },
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  totalRating: { type: Number, min: 0, default: 0 }
}, { _id: false });

const ProductSEOSchema = new Schema({
  title: { type: String, required: true, maxlength: 60 },
  description: { type: String, maxlength: 160 },
  keywords: { type: [String], default: [] },
  slug: { type: String, required: true, unique: true, lowercase: true }
}, { _id: false });

// =============================================================================
// MAIN PRODUCT SCHEMA
// =============================================================================

const ProductSchema = new Schema<IProduct>({
  // Shopify Integration
  shopifyProductId: { 
    type: String, 
    sparse: true, 
    unique: true,
    index: true
  },
  
  // Core Product Information
  title: { 
    type: String, 
    required: [true, 'Product title is required'], 
    maxlength: [255, 'Product title cannot exceed 255 characters'],
    trim: true
  },
  description: { 
    type: String, 
    required: [true, 'Product description is required'],
    trim: true
  },
  handle: { 
    type: String, 
    required: [true, 'Product handle is required'], 
    unique: true, 
    lowercase: true,
    trim: true,
    index: true
  },
  vendor: { type: String, default: '', trim: true },
  productType: { type: String, default: '', trim: true },
  tags: { 
    type: [String], 
    default: [],
    index: true
  },
  status: { 
    type: String, 
    enum: {
      values: ['active', 'draft', 'archived'],
      message: 'Status must be active, draft, or archived'
    },
    default: 'draft',
    index: true
  },
  
  // Pricing
  price: { 
    type: Number, 
    required: [true, 'Product price is required'], 
    min: [0, 'Price must be a positive number'] 
  },
  compareAtPrice: { 
    type: Number, 
    min: [0, 'Compare at price must be a positive number'] 
  },
  
  // Media
  images: { 
    type: [ProductImageSchema], 
    required: [true, 'At least one product image is required'],
    validate: {
      validator: function(images: IProductImage[]): boolean {
        return images.length > 0;
      },
      message: 'At least one product image is required'
    }
  },
  
  // Variants
  variants: { 
    type: [ProductVariantSchema], 
    required: [true, 'At least one product variant is required'],
    validate: {
      validator: function(variants: IProductVariant[]): boolean {
        return variants.length > 0;
      },
      message: 'At least one product variant is required'
    }
  },
  
  // Enhanced Features
  inventoryTracking: { 
    type: InventoryTrackingSchema, 
    required: true,
    default: () => ({})
  },
  mobileDisplay: { 
    type: MobileDisplaySchema, 
    required: true,
    default: () => ({})
  },
  analytics: { 
    type: ProductAnalyticsSchema, 
    required: true,
    default: () => ({})
  },
  reviews: { 
    type: ProductReviewsSchema, 
    required: true,
    default: () => ({})
  },
  seo: { 
    type: ProductSEOSchema, 
    required: true,
    default: () => ({})
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(_doc, ret): any {
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// =============================================================================
// INDEXES
// =============================================================================

ProductSchema.index({ handle: 1 });
ProductSchema.index({ 'seo.slug': 1 });
ProductSchema.index({ shopifyProductId: 1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ 'mobileDisplay.isFeatured': 1, 'mobileDisplay.priority': -1 });
ProductSchema.index({ tags: 1 });
ProductSchema.index({ 'analytics.engagementScore': -1 });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ updatedAt: -1 });

// Compound indexes for complex queries
ProductSchema.index({ status: 1, 'inventoryTracking.totalQuantity': 1 });
ProductSchema.index({ 'mobileDisplay.isFeatured': 1, 'analytics.engagementScore': -1 });

// Text search index
ProductSchema.index({
  title: 'text',
  description: 'text',
  'seo.keywords': 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    'seo.keywords': 8,
    tags: 5,
    description: 1
  },
  name: 'product_text_index'
});

// =============================================================================
// VIRTUALS
// =============================================================================

ProductSchema.virtual('totalInventory').get(function(this: IProduct): number {
  return this.variants.reduce((total, variant) => total + (variant.inventory?.quantity || 0), 0);
});

ProductSchema.virtual('priceRange').get(function(this: IProduct): { min: number; max: number } {
  if (this.variants.length === 0) {
    return { min: this.price, max: this.price };
  }
  
  const prices = this.variants.map(v => v.price);
  return {
    min: Math.min(...prices),
    max: Math.max(...prices)
  };
});

ProductSchema.virtual('isInStock').get(function(this: IProduct): boolean {
  return this.inventoryTracking.totalQuantity > 0;
});

ProductSchema.virtual('isLowStock').get(function(this: IProduct): boolean {
  return this.inventoryTracking.totalQuantity <= this.inventoryTracking.lowStockThreshold;
});

// =============================================================================
// METHODS
// =============================================================================

/**
 * Update product analytics
 */
ProductSchema.methods.updateAnalytics = async function(this: MongooseDocument<IProduct>): Promise<void> {
  this.analytics.lastViewedAt = new Date();
  this.analytics.viewCount += 1;
  
  // Calculate engagement score based on views, favorites, and ratings
  const daysSinceCreated = (Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyFactor = Math.max(0.1, 1 / Math.log(daysSinceCreated + 2));
  
  this.analytics.engagementScore = Math.round(
    (this.analytics.viewCount * 0.1) + 
    (this.analytics.favoriteCount * 2) + 
    (this.reviews.averageRating * 10) +
    (this.analytics.conversionRate * 100) +
    (recencyFactor * 10)
  );
  
  this.analytics.lastCalculated = new Date();
  await this.save();
};

/**
 * Check if product is available for purchase
 */
ProductSchema.methods.isAvailable = function(this: IProduct): boolean {
  if (this.status !== 'active') {
    return false;
  }
  
  return this.variants.some(variant => 
    variant.inventory.quantity > 0 && 
    variant.inventory.tracked
  );
};

/**
 * Get the lowest price among available variants
 */
ProductSchema.methods.getLowestPrice = function(this: IProduct): number {
  if (this.variants.length === 0) {
    return this.price;
  }
  
  const availablePrices = this.variants
    .filter(v => v.inventory.quantity > 0)
    .map(v => v.price);
  
  return availablePrices.length > 0 ? Math.min(...availablePrices) : this.price;
};

/**
 * Get the highest price among available variants
 */
ProductSchema.methods.getHighestPrice = function(this: IProduct): number {
  if (this.variants.length === 0) {
    return this.price;
  }
  
  const availablePrices = this.variants
    .filter(v => v.inventory.quantity > 0)
    .map(v => v.price);
  
  return availablePrices.length > 0 ? Math.max(...availablePrices) : this.price;
};

// =============================================================================
// MIDDLEWARE (HOOKS)
// =============================================================================

/**
 * Pre-save middleware
 */
ProductSchema.pre('save', function(this: IProduct, next): void {
  // Auto-generate handle from title if not set
  if (this.isNew && !this.handle && this.title) {
    this.handle = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  
  // Auto-generate SEO slug from handle if not set
  if (this.isNew && !this.seo.slug && this.handle) {
    this.seo.slug = this.handle;
  }
  
  // Update total quantity from variants
  this.inventoryTracking.totalQuantity = this.variants.reduce(
    (total, variant) => total + (variant.inventory?.quantity || 0), 
    0
  );
  
  // Set default mobile display values if not set
  if (this.isNew) {
    if (!this.mobileDisplay.thumbnailUrl && this.images.length > 0) {
      this.mobileDisplay.thumbnailUrl = this.images[0].url;
    }
    
    if (!this.mobileDisplay.shortDescription && this.description) {
      this.mobileDisplay.shortDescription = this.description
        .replace(/<[^>]*>/g, '')
        .substring(0, 200) + '...';
    }
    
    if (!this.seo.title) {
      this.seo.title = this.title.length > 60 ? 
        this.title.substring(0, 57) + '...' : 
        this.title;
    }
  }
  
  next();
});

/**
 * Pre-find middleware to populate commonly needed fields
 */
ProductSchema.pre(['find', 'findOne', 'findOneAndUpdate'], function(): void {
  // Add any common population logic here
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find products by text search
 */
ProductSchema.statics.findByText = function(
  query: string, 
  options: { limit?: number; skip?: number } = {}
): mongoose.Query<MongooseDocument<IProduct>[], MongooseDocument<IProduct>> {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
  .sort({ score: { $meta: 'textScore' } })
  .limit(options.limit || 20)
  .skip(options.skip || 0);
};

/**
 * Find featured products
 */
ProductSchema.statics.findFeatured = function(
  limit: number = 10
): mongoose.Query<MongooseDocument<IProduct>[], MongooseDocument<IProduct>> {
  return this.find({ 
    status: 'active',
    'mobileDisplay.isFeatured': true 
  })
  .sort({ 'mobileDisplay.priority': -1, 'analytics.engagementScore': -1 })
  .limit(limit);
};

/**
 * Find low stock products
 */
ProductSchema.statics.findLowStock = function(
  threshold?: number
): mongoose.Query<MongooseDocument<IProduct>[], MongooseDocument<IProduct>> {
  const query: any = {
    status: 'active',
    'inventoryTracking.tracked': true
  };
  
  if (threshold) {
    query['inventoryTracking.totalQuantity'] = { $lte: threshold };
  } else {
    query.$expr = {
      $lte: ['$inventoryTracking.totalQuantity', '$inventoryTracking.lowStockThreshold']
    };
  }
  
  return this.find(query).sort({ 'inventoryTracking.totalQuantity': 1 });
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

// Extend the interface to include methods and statics
export interface IProductDocument extends MongooseDocument<IProduct> {
  updateAnalytics(): Promise<void>;
  isAvailable(): boolean;
  getLowestPrice(): number;
  getHighestPrice(): number;
}

export interface IProductModel extends mongoose.Model<IProductDocument> {
  findByText(
    query: string, 
    options?: { limit?: number; skip?: number }
  ): mongoose.Query<IProductDocument[], IProductDocument>;
  findFeatured(limit?: number): mongoose.Query<IProductDocument[], IProductDocument>;
  findLowStock(threshold?: number): mongoose.Query<IProductDocument[], IProductDocument>;
}

export { IProduct, IProductVariant, IProductImage, IMobileDisplay, IProductAnalytics, IProductReviews, IProductSEO };

const Product = mongoose.model<IProductDocument, IProductModel>('Product', ProductSchema);

export default Product;