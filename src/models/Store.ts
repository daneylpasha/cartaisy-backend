import mongoose, { Schema, Document } from 'mongoose';
import { ObjectId } from '../types';

/**
 * Store Mongoose Model
 *
 * Represents a multi-tenant store in the Cartaisy system. Each store can have
 * multiple users with different roles, and contains its own data including
 * products, orders, and homescreen content.
 */

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

export interface IShopifyConnection {
  shop: string;
  accessToken: string;
  scope: string;
  isConnected: boolean;
  connectedAt?: Date;
  lastSyncAt?: Date;
}

export interface IStorePlan {
  type: 'free' | 'starter' | 'pro' | 'enterprise';
  maxMembers: number;
  expiresAt?: Date;
}

export interface IStoreSettings {
  timezone: string;
  currency: string;
  language?: string;
}

export interface IStore extends Document {
  _id: ObjectId;
  name: string;
  slug: string;
  shopify: IShopifyConnection;
  plan: IStorePlan;
  settings: IStoreSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ShopifyConnectionSchema = new Schema<IShopifyConnection>(
  {
    shop: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    accessToken: {
      type: String,
      sparse: true,
      select: false, // Don't include accessToken in queries by default
    },
    scope: {
      type: String,
      sparse: true,
    },
    isConnected: {
      type: Boolean,
      default: false,
      index: true,
    },
    connectedAt: Date,
    lastSyncAt: Date,
  },
  { _id: false }
);

const StorePlanSchema = new Schema<IStorePlan>(
  {
    type: {
      type: String,
      enum: ['free', 'starter', 'pro', 'enterprise'],
      default: 'free',
    },
    maxMembers: {
      type: Number,
      default: 5,
      min: 1,
    },
    expiresAt: Date,
  },
  { _id: false }
);

const StoreSettingsSchema = new Schema<IStoreSettings>(
  {
    timezone: {
      type: String,
      default: 'UTC',
      trim: true,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code'],
    },
    language: {
      type: String,
      default: 'en',
      lowercase: true,
      trim: true,
    },
  },
  { _id: false }
);

// =============================================================================
// MAIN STORE SCHEMA
// =============================================================================

const StoreSchema = new Schema<IStore>(
  {
    // Store Identity
    name: {
      type: String,
      required: [true, 'Store name is required'],
      trim: true,
      maxlength: [100, 'Store name cannot exceed 100 characters'],
      minlength: [2, 'Store name must be at least 2 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Store slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must be lowercase alphanumeric with hyphens only',
      ],
      maxlength: [50, 'Slug cannot exceed 50 characters'],
    },

    // Shopify Integration
    shopify: {
      type: ShopifyConnectionSchema,
      required: true,
      default: () => ({}),
    },

    // Plan & Limits
    plan: {
      type: StorePlanSchema,
      required: true,
      default: () => ({ type: 'free', maxMembers: 5 }),
    },

    // Settings
    settings: {
      type: StoreSettingsSchema,
      required: true,
      default: () => ({ timezone: 'UTC', currency: 'USD', language: 'en' }),
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (_doc, ret) {
        delete (ret as any).__v;
        // Don't include accessToken in JSON responses
        if (ret.shopify) {
          delete (ret.shopify as any).accessToken;
        }
        return ret;
      },
    },
  }
);

// =============================================================================
// INDEXES
// =============================================================================

StoreSchema.index({ slug: 1 });
StoreSchema.index({ isActive: 1 });
StoreSchema.index({ 'shopify.isConnected': 1 });
StoreSchema.index({ 'plan.type': 1 });
StoreSchema.index({ createdAt: -1 });

// Compound indexes
StoreSchema.index({ isActive: 1, 'plan.type': 1 });
StoreSchema.index({ slug: 1, isActive: 1 });

// =============================================================================
// METHODS
// =============================================================================

/**
 * Check if store can add more members based on plan
 */
StoreSchema.methods.canAddMembers = async function (
  this: Document & IStore
): Promise<boolean> {
  const User = mongoose.model('User');
  const memberCount = await User.countDocuments({ storeId: this._id });
  return memberCount < this.plan.maxMembers;
};

/**
 * Get Shopify access token (with select fallback)
 */
StoreSchema.methods.getShopifyAccessToken = async function (
  this: Document & IStore
): Promise<string | null> {
  if (this.shopify.accessToken) {
    return this.shopify.accessToken;
  }
  // If not loaded, fetch with +shopify.accessToken
  const store = await mongoose
    .model('Store')
    .findById(this._id)
    .select('+shopify.accessToken');
  return store?.shopify?.accessToken || null;
};

// =============================================================================
// MIDDLEWARE (HOOKS)
// =============================================================================

/**
 * Pre-save middleware to validate slug format
 */
StoreSchema.pre('save', function (next) {
  if (this.isModified('slug')) {
    this.slug = this.slug.toLowerCase().trim();
  }
  next();
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find store by slug
 */
StoreSchema.statics.findBySlug = function (
  slug: string
): mongoose.Query<(Document & IStore) | null, Document & IStore> {
  return this.findOne({ slug: slug.toLowerCase(), isActive: true });
};

/**
 * Find store by Shopify shop URL
 */
StoreSchema.statics.findByShopifyShop = function (
  shop: string
): mongoose.Query<(Document & IStore) | null, Document & IStore> {
  return this.findOne({ 'shopify.shop': shop, 'shopify.isConnected': true });
};

// =============================================================================
// TYPES
// =============================================================================

export interface IStoreDocument extends Document, IStore {
  canAddMembers(): Promise<boolean>;
  getShopifyAccessToken(): Promise<string | null>;
}

export interface IStoreModel extends mongoose.Model<IStoreDocument> {
  findBySlug(slug: string): mongoose.Query<IStoreDocument | null, IStoreDocument>;
  findByShopifyShop(shop: string): mongoose.Query<IStoreDocument | null, IStoreDocument>;
}

// =============================================================================
// MODEL EXPORT
// =============================================================================

export default mongoose.model<IStore, IStoreModel>('Store', StoreSchema);
