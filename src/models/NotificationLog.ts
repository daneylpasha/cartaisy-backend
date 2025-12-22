import mongoose, { Document, Schema } from 'mongoose';

export interface IFailedToken {
  token: string;
  error: string;
  errorCode?: string;
}

/**
 * Deep link types for notification navigation
 */
export type DeepLinkType = 'product' | 'collection' | 'cart' | 'order' | 'category' | 'url' | 'home';

/**
 * Deep link configuration for notifications
 */
export interface IDeepLink {
  type: DeepLinkType;
  id?: string;
  url?: string;
}

export interface INotificationLog extends Document {
  storeId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  deepLink?: IDeepLink;
  segment: string;
  customSegmentCriteria?: Record<string, any>;

  // Scheduling
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed' | 'cancelled';
  scheduledFor?: Date;
  sentAt?: Date;

  // Delivery Stats
  targetCount: number;
  successCount: number;
  failureCount: number;

  // Engagement Stats
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;

  // Failed token details (for debugging, capped at 50)
  failedTokens?: IFailedToken[];

  // Metadata
  sentBy?: mongoose.Types.ObjectId;
  sentByEmail?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Virtuals
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

const failedTokenSchema = new Schema<IFailedToken>(
  {
    token: { type: String, required: true },
    error: { type: String, required: true },
    errorCode: { type: String },
  },
  { _id: false }
);

const notificationLogSchema = new Schema<INotificationLog>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
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
    data: {
      type: Schema.Types.Mixed,
    },
    imageUrl: {
      type: String,
    },
    deepLink: {
      type: {
        type: String,
        enum: ['product', 'collection', 'cart', 'order', 'category', 'url', 'home'],
      },
      id: String,
      url: String,
    },
    segment: {
      type: String,
      required: true,
      default: 'all',
    },
    customSegmentCriteria: {
      type: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'partial', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    scheduledFor: {
      type: Date,
      index: true,
    },
    sentAt: {
      type: Date,
    },
    targetCount: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    openedCount: {
      type: Number,
      default: 0,
    },
    clickedCount: {
      type: Number,
      default: 0,
    },
    failedTokens: [failedTokenSchema],
    sentBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    sentByEmail: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for delivery rate percentage
notificationLogSchema.virtual('deliveryRate').get(function () {
  if (this.targetCount === 0) return 0;
  return Math.round((this.successCount / this.targetCount) * 100);
});

// Virtual for open rate percentage (opens / successful deliveries)
notificationLogSchema.virtual('openRate').get(function () {
  if (this.successCount === 0) return 0;
  return Math.round((this.openedCount / this.successCount) * 100);
});

// Virtual for click rate percentage (clicks / opens)
notificationLogSchema.virtual('clickRate').get(function () {
  if (this.openedCount === 0) return 0;
  return Math.round((this.clickedCount / this.openedCount) * 100);
});

// Indexes for common queries
notificationLogSchema.index({ storeId: 1, createdAt: -1 });
notificationLogSchema.index({ storeId: 1, status: 1 });
notificationLogSchema.index({ storeId: 1, sentAt: -1 });

const NotificationLog = mongoose.model<INotificationLog>(
  'NotificationLog',
  notificationLogSchema
);

export default NotificationLog;
