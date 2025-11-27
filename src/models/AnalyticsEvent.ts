import mongoose, { Schema, Document } from 'mongoose';

/**
 * Analytics Event Model
 *
 * Tracks app-level user interactions and engagement metrics
 * that are NOT available from Shopify (views, clicks, searches, etc.)
 */

export interface IAnalyticsEvent extends Document {
  storeId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  sessionId: string;
  deviceId?: string;

  // Event details
  eventType: 'product_view' | 'product_click' | 'add_to_cart' | 'remove_from_cart' |
             'wishlist_add' | 'wishlist_remove' | 'search' | 'category_view' |
             'collection_view' | 'checkout_start' | 'checkout_complete' |
             'app_open' | 'app_close' | 'screen_view' | 'banner_click' |
             'carousel_click' | 'share' | 'review_submit';

  // Event data (flexible based on eventType)
  eventData: {
    productId?: string;
    productTitle?: string;
    variantId?: string;
    collectionId?: string;
    collectionTitle?: string;
    categoryId?: string;
    categoryTitle?: string;
    searchQuery?: string;
    searchResultsCount?: number;
    screenName?: string;
    bannerId?: string;
    carouselItemId?: string;
    quantity?: number;
    price?: number;
    currency?: string;
    orderId?: string;
    orderTotal?: number;
    referrer?: string;
    position?: number; // position in list when clicked
  };

  // Device & platform info
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;

  // Location (optional)
  location?: {
    country?: string;
    city?: string;
    region?: string;
  };

  // Timing
  timestamp: Date;
  duration?: number; // time spent in milliseconds (for views)

  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      index: true,
    },

    eventType: {
      type: String,
      required: true,
      enum: [
        'product_view', 'product_click', 'add_to_cart', 'remove_from_cart',
        'wishlist_add', 'wishlist_remove', 'search', 'category_view',
        'collection_view', 'checkout_start', 'checkout_complete',
        'app_open', 'app_close', 'screen_view', 'banner_click',
        'carousel_click', 'share', 'review_submit'
      ],
      index: true,
    },

    eventData: {
      productId: String,
      productTitle: String,
      variantId: String,
      collectionId: String,
      collectionTitle: String,
      categoryId: String,
      categoryTitle: String,
      searchQuery: String,
      searchResultsCount: Number,
      screenName: String,
      bannerId: String,
      carouselItemId: String,
      quantity: Number,
      price: Number,
      currency: String,
      orderId: String,
      orderTotal: Number,
      referrer: String,
      position: Number,
    },

    platform: {
      type: String,
      required: true,
      enum: ['ios', 'android', 'web'],
      index: true,
    },
    appVersion: String,
    osVersion: String,
    deviceModel: String,

    location: {
      country: String,
      city: String,
      region: String,
    },

    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    duration: Number,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
AnalyticsEventSchema.index({ storeId: 1, eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ storeId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ 'eventData.productId': 1, eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ 'eventData.searchQuery': 1, timestamp: -1 });
AnalyticsEventSchema.index({ platform: 1, timestamp: -1 });

// TTL index to auto-delete old events (90 days)
AnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AnalyticsEvent = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);

export default AnalyticsEvent;
