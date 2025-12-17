import mongoose, { Document, Schema } from 'mongoose';

/**
 * Deep link types for notification navigation
 */
export type DeepLinkType = 'product' | 'collection' | 'cart' | 'order' | 'category' | 'url' | 'home';

/**
 * Deep link configuration for templates
 */
export interface IDeepLink {
  type: DeepLinkType;
  id?: string; // For product, collection, order, category
  url?: string; // For custom URL type
}

export interface INotificationTemplate extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string;
  title: string;
  body: string;
  image?: string;
  segment: string;
  data?: Record<string, string>;
  deepLink?: IDeepLink;

  // Usage tracking
  usageCount: number;
  lastUsedAt?: Date;

  // Metadata
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationTemplateSchema = new Schema<INotificationTemplate>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    image: {
      type: String,
    },
    segment: {
      type: String,
      default: 'all',
    },
    data: {
      type: Schema.Types.Mixed,
    },
    deepLink: {
      type: {
        type: String,
        enum: ['product', 'collection', 'cart', 'order', 'category', 'url', 'home'],
      },
      id: String,
      url: String,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    lastUsedAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdByEmail: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for store + name uniqueness
NotificationTemplateSchema.index({ storeId: 1, name: 1 }, { unique: true });

// Index for listing active templates
NotificationTemplateSchema.index({ storeId: 1, isActive: 1, updatedAt: -1 });

const NotificationTemplate = mongoose.model<INotificationTemplate>(
  'NotificationTemplate',
  NotificationTemplateSchema
);

export default NotificationTemplate;
