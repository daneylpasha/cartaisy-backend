import mongoose, { Document, Schema } from 'mongoose';

/**
 * Notification Engagement Model
 *
 * Tracks individual notification engagement events (opens and clicks).
 * Used for detailed analytics and customer behavior tracking.
 */

export type EngagementType = 'open' | 'click';

export interface INotificationEngagement extends Document {
  notificationId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  type: EngagementType;
  timestamp: Date;

  // Optional metadata
  deviceInfo?: {
    platform?: 'ios' | 'android';
    deviceId?: string;
  };
  clickTarget?: string; // URL or action that was clicked

  createdAt: Date;
}

const notificationEngagementSchema = new Schema<INotificationEngagement>(
  {
    notificationId: {
      type: Schema.Types.ObjectId,
      ref: 'NotificationLog',
      required: true,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['open', 'click'],
      required: true,
      index: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    deviceInfo: {
      platform: {
        type: String,
        enum: ['ios', 'android'],
      },
      deviceId: String,
    },
    clickTarget: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound indexes for efficient querying
notificationEngagementSchema.index({ notificationId: 1, type: 1 });
notificationEngagementSchema.index({ storeId: 1, type: 1, timestamp: -1 });
notificationEngagementSchema.index({ customerId: 1, type: 1, timestamp: -1 });

// Unique constraint to prevent duplicate events (customer can only open/click once per notification)
notificationEngagementSchema.index(
  { notificationId: 1, customerId: 1, type: 1 },
  { unique: true }
);

// TTL index - auto-delete engagement data older than 90 days for storage optimization
notificationEngagementSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
);

const NotificationEngagement = mongoose.model<INotificationEngagement>(
  'NotificationEngagement',
  notificationEngagementSchema
);

export default NotificationEngagement;
