import mongoose, { Schema } from 'mongoose';
import {
  IOrder,
  IOrderLineItem,
  IOrderAddress,
  IOrderShipping,
  IOrderNotification,
  IOrderRating,
  ISupportTicket,
  IReturnExchange,
  IMobileStatusHistory,
  MongooseDocument,
} from '../types/index';

/**
 * Order Mongoose Model
 * 
 * Comprehensive order model with mobile-specific features, enhanced tracking,
 * customer feedback, support ticketing, and return/exchange management.
 */

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const OrderLineItemSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
    index: true
  },
  shopifyProductId: {
    type: String,
    trim: true
  },
  shopifyVariantId: {
    type: String,
    trim: true
  },
  variantId: { 
    type: String,
    trim: true
  },
  quantity: { 
    type: Number, 
    required: [true, 'Quantity is required'], 
    min: [1, 'Quantity must be at least 1']
  },
  price: { 
    type: Number, 
    required: [true, 'Price is required'], 
    min: [0, 'Price must be positive']
  },
  title: { 
    type: String, 
    required: [true, 'Product title is required'],
    trim: true,
    maxlength: [255, 'Product title cannot exceed 255 characters']
  },
  sku: { 
    type: String,
    trim: true,
    maxlength: [100, 'SKU cannot exceed 100 characters']
  },
  image: {
    type: String,
    validate: {
      validator: function(url: string): boolean {
        if (!url) return true; // Allow empty image
        // Allow URLs with query parameters (e.g., ?v=123)
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
               /^https?:\/\/cdn\.shopify\.com\/.+/i.test(url); // Allow all Shopify CDN URLs
      },
      message: 'Image must be a valid image URL'
    }
  },
  properties: { 
    type: Map, 
    of: String,
    default: new Map()
  }
}, { _id: false });

const OrderAddressSchema = new Schema({
  firstName: { 
    type: String, 
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: { 
    type: String, 
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  company: { 
    type: String,
    trim: true,
    maxlength: [100, 'Company name cannot exceed 100 characters']
  },
  address1: { 
    type: String, 
    required: [true, 'Address line 1 is required'],
    trim: true,
    maxlength: [200, 'Address line 1 cannot exceed 200 characters']
  },
  address2: { 
    type: String,
    trim: true,
    maxlength: [200, 'Address line 2 cannot exceed 200 characters']
  },
  city: { 
    type: String, 
    required: [true, 'City is required'],
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters']
  },
  province: { 
    type: String, 
    required: [true, 'Province/State is required'],
    trim: true,
    maxlength: [100, 'Province cannot exceed 100 characters']
  },
  country: { 
    type: String, 
    required: [true, 'Country is required'],
    trim: true,
    maxlength: [100, 'Country cannot exceed 100 characters']
  },
  zip: { 
    type: String, 
    required: [true, 'ZIP/Postal code is required'],
    trim: true,
    maxlength: [20, 'ZIP code cannot exceed 20 characters']
  },
  phone: { 
    type: String,
    trim: true,
    validate: {
      validator: function(phone: string): boolean {
        if (!phone) return true; // Allow empty phone
        return /^\+?[\d\s\-\(\)]{10,}$/.test(phone);
      },
      message: 'Please provide a valid phone number'
    }
  }
}, { _id: false });

const OrderShippingSchema = new Schema({
  method: { 
    type: String, 
    required: [true, 'Shipping method is required'],
    trim: true,
    maxlength: [100, 'Shipping method cannot exceed 100 characters']
  },
  cost: { 
    type: Number, 
    required: [true, 'Shipping cost is required'], 
    min: [0, 'Shipping cost must be positive']
  },
  carrier: { 
    type: String,
    trim: true,
    maxlength: [100, 'Carrier name cannot exceed 100 characters']
  },
  trackingNumber: { 
    type: String,
    trim: true,
    index: true,
    maxlength: [100, 'Tracking number cannot exceed 100 characters']
  },
  trackingUrl: { 
    type: String,
    validate: {
      validator: function(url: string): boolean {
        if (!url) return true; // Allow empty URL
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Tracking URL must be a valid URL'
    }
  },
  estimatedDelivery: { type: Date },
  actualDelivery: { type: Date }
}, { _id: false });

const MobileStatusHistorySchema = new Schema({
  status: { 
    type: String, 
    required: [true, 'Status is required'],
    trim: true
  },
  timestamp: { 
    type: Date, 
    required: [true, 'Timestamp is required'],
    default: Date.now
  },
  note: { 
    type: String,
    trim: true,
    maxlength: [500, 'Note cannot exceed 500 characters']
  },
  location: { 
    type: String,
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  }
}, { _id: false });

const OrderNotificationSchema = new Schema({
  type: { 
    type: String, 
    enum: {
      values: ['push', 'email', 'sms'],
      message: 'Notification type must be push, email, or sms'
    },
    required: [true, 'Notification type is required']
  },
  title: { 
    type: String, 
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  message: { 
    type: String, 
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },
  sentAt: { 
    type: Date, 
    required: [true, 'Sent timestamp is required'],
    default: Date.now 
  },
  status: { 
    type: String, 
    enum: {
      values: ['sent', 'delivered', 'failed'],
      message: 'Notification status must be sent, delivered, or failed'
    },
    default: 'sent'
  },
  deliveredAt: { type: Date }
}, { _id: false });

const OrderRatingSchema = new Schema({
  overallRating: { 
    type: Number, 
    required: [true, 'Overall rating is required'], 
    min: [1, 'Rating must be between 1 and 5'], 
    max: [5, 'Rating must be between 1 and 5'] 
  },
  deliveryRating: { 
    type: Number, 
    min: [1, 'Rating must be between 1 and 5'], 
    max: [5, 'Rating must be between 1 and 5'] 
  },
  packagingRating: { 
    type: Number, 
    min: [1, 'Rating must be between 1 and 5'], 
    max: [5, 'Rating must be between 1 and 5'] 
  },
  productQualityRating: { 
    type: Number, 
    min: [1, 'Rating must be between 1 and 5'], 
    max: [5, 'Rating must be between 1 and 5'] 
  },
  customerServiceRating: { 
    type: Number, 
    min: [1, 'Rating must be between 1 and 5'], 
    max: [5, 'Rating must be between 1 and 5'] 
  },
  comment: { 
    type: String,
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  ratedAt: { 
    type: Date, 
    required: [true, 'Rating timestamp is required'],
    default: Date.now 
  }
}, { _id: false });

const SupportTicketSchema = new Schema({
  id: {
    type: String,
    required: [true, 'Support ticket ID is required'],
    trim: true
  },
  subject: { 
    type: String, 
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  status: { 
    type: String, 
    enum: {
      values: ['open', 'pending', 'resolved', 'closed'],
      message: 'Status must be open, pending, resolved, or closed'
    },
    default: 'open'
  },
  priority: { 
    type: String, 
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be low, medium, high, or urgent'
    },
    default: 'medium'
  },
  createdAt: { 
    type: Date, 
    required: [true, 'Creation timestamp is required'],
    default: Date.now 
  },
  lastUpdated: { 
    type: Date, 
    required: [true, 'Last updated timestamp is required'],
    default: Date.now 
  }
}, { _id: false });

const ReturnItemSchema = new Schema({
  lineItemId: { 
    type: String, 
    required: [true, 'Line item ID is required'],
    trim: true
  },
  quantity: { 
    type: Number, 
    required: [true, 'Quantity is required'], 
    min: [1, 'Quantity must be at least 1'] 
  },
  reason: { 
    type: String, 
    required: [true, 'Return reason is required'],
    trim: true,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  }
}, { _id: false });

const ReturnExchangeSchema = new Schema({
  id: {
    type: String,
    required: [true, 'Return/exchange ID is required'],
    // Note: unique removed - uniqueness should be per-order, not global
    trim: true
  },
  type: { 
    type: String, 
    enum: {
      values: ['return', 'exchange'],
      message: 'Type must be return or exchange'
    },
    required: [true, 'Return/exchange type is required']
  },
  status: { 
    type: String, 
    enum: {
      values: ['requested', 'approved', 'rejected', 'processing', 'completed'],
      message: 'Status must be requested, approved, rejected, processing, or completed'
    },
    default: 'requested'
  },
  reason: { 
    type: String, 
    required: [true, 'Reason is required'],
    trim: true,
    maxlength: [1000, 'Reason cannot exceed 1000 characters']
  },
  items: {
    type: [ReturnItemSchema],
    required: [true, 'At least one item is required'],
    validate: {
      validator: function(items: any[]): boolean {
        return items && items.length > 0;
      },
      message: 'At least one return item is required'
    }
  },
  requestedAt: { 
    type: Date, 
    required: [true, 'Request timestamp is required'],
    default: Date.now 
  },
  processedAt: { type: Date },
  refundAmount: { 
    type: Number, 
    min: [0, 'Refund amount must be positive']
  }
}, { _id: false });

// =============================================================================
// MAIN ORDER SCHEMA
// =============================================================================

const OrderSchema = new Schema<IOrder>({
  // Shopify Integration
  shopifyOrderId: { 
    type: String, 
    sparse: true, 
    unique: true,
    index: true,
    trim: true
  },
  shopifyOrderNumber: { 
    type: String, 
    sparse: true,
    trim: true
  },
  
  // Basic Order Information
  orderNumber: {
    type: String,
    required: [true, 'Order number is required'],
    unique: true,
    trim: true,
    index: true,
    maxlength: [50, 'Order number cannot exceed 50 characters']
  },
  confirmationNumber: {
    type: String,
    trim: true,
    sparse: true,
    maxlength: [100, 'Confirmation number cannot exceed 100 characters']
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      },
      message: 'Please provide a valid email address'
    }
  },
  
  // Order Items
  lineItems: {
    type: [OrderLineItemSchema],
    required: [true, 'At least one line item is required'],
    validate: {
      validator: function(items: IOrderLineItem[]): boolean {
        return items && items.length > 0;
      },
      message: 'At least one line item is required'
    }
  },
  
  // Pricing
  subtotalPrice: {
    type: Number,
    required: [true, 'Subtotal price is required'],
    min: [0, 'Subtotal must be positive']
  },
  shippingCost: {
    type: Number,
    min: [0, 'Shipping cost must be positive'],
    default: 0
  },
  discount: {
    type: Number,
    min: [0, 'Discount must be positive'],
    default: 0
  },
  totalTax: {
    type: Number,
    required: [true, 'Total tax is required'],
    min: [0, 'Tax must be positive']
  },
  tax: {
    type: Number,
    min: [0, 'Tax must be positive']
  },
  totalPrice: {
    type: Number,
    required: [true, 'Total price is required'],
    min: [0, 'Total price must be positive']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'USD',
    uppercase: true,
    match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code']
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'shopify', 'paypal', 'cash', 'other'],
    default: 'stripe'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },
  
  // Addresses
  billingAddress: {
    type: OrderAddressSchema,
    required: false
  },
  shippingAddress: {
    type: OrderAddressSchema,
    required: [true, 'Shipping address is required']
  },
  
  // Shipping
  shipping: {
    type: OrderShippingSchema,
    required: false
  },
  
  // Status Tracking
  financialStatus: { 
    type: String, 
    enum: {
      values: ['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'],
      message: 'Invalid financial status'
    },
    default: 'pending',
    index: true
  },
  fulfillmentStatus: { 
    type: String, 
    enum: {
      values: ['unfulfilled', 'partial', 'fulfilled', 'restocked', 'cancelled'],
      message: 'Invalid fulfillment status'
    },
    default: 'unfulfilled',
    index: true
  },
  
  // Enhanced Mobile Status
  mobileStatus: {
    current: { 
      type: String,
      enum: {
        values: ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
        message: 'Invalid mobile status'
      },
      default: 'placed',
      index: true
    },
    history: {
      type: [MobileStatusHistorySchema],
      default: []
    },
    estimatedDelivery: { type: Date },
    deliveryInstructions: { 
      type: String,
      trim: true,
      maxlength: [500, 'Delivery instructions cannot exceed 500 characters']
    }
  },
  
  // Mobile Notifications
  notifications: {
    type: [OrderNotificationSchema],
    default: []
  },
  notificationPreferences: {
    pushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    smsEnabled: { type: Boolean, default: false }
  },
  
  // Customer Feedback
  customerRating: { 
    type: OrderRatingSchema 
  },
  
  // Support and Returns
  supportTickets: {
    type: [SupportTicketSchema],
    default: []
  },
  returns: {
    type: [ReturnExchangeSchema],
    default: []
  },
  
  // Special Instructions and Notes
  specialInstructions: { 
    type: String,
    trim: true,
    maxlength: [500, 'Special instructions cannot exceed 500 characters']
  },
  customerNotes: { 
    type: String,
    trim: true,
    maxlength: [500, 'Customer notes cannot exceed 500 characters']
  },
  merchantNotes: { 
    type: String,
    trim: true,
    maxlength: [1000, 'Merchant notes cannot exceed 1000 characters']
  },
  
  // Delivery Preferences
  deliveryPreferences: {
    timeSlot: { 
      type: String,
      trim: true,
      maxlength: [100, 'Time slot cannot exceed 100 characters']
    },
    deliveryDate: { type: Date },
    leaveAtDoor: { type: Boolean, default: false },
    requireSignature: { type: Boolean, default: false },
    deliveryInstructions: { 
      type: String,
      trim: true,
      maxlength: [200, 'Delivery instructions cannot exceed 200 characters']
    }
  },
  
  // Analytics and Tracking
  source: { 
    type: String, 
    enum: {
      values: ['mobile', 'web', 'api', 'pos'],
      message: 'Source must be mobile, web, api, or pos'
    },
    default: 'mobile',
    index: true
  },
  channel: { 
    type: String, 
    enum: {
      values: ['app', 'website', 'marketplace', 'social'],
      message: 'Channel must be app, website, marketplace, or social'
    },
    default: 'app',
    index: true
  },
  campaignId: { 
    type: String,
    trim: true,
    maxlength: [100, 'Campaign ID cannot exceed 100 characters']
  },
  
  // Timestamps
  placedAt: { 
    type: Date, 
    required: [true, 'Placed timestamp is required'],
    default: Date.now, 
    index: true 
  },
  processedAt: { type: Date },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  cancelledAt: { type: Date }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(_doc, ret): any {
      delete (ret as any).__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// =============================================================================
// INDEXES
// =============================================================================

OrderSchema.index({ user: 1, placedAt: -1 });
OrderSchema.index({ email: 1, placedAt: -1 });
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ 'shipping.trackingNumber': 1 });
OrderSchema.index({ 'mobileStatus.current': 1, placedAt: -1 });
OrderSchema.index({ source: 1, channel: 1, placedAt: -1 });
OrderSchema.index({ financialStatus: 1, fulfillmentStatus: 1 });
OrderSchema.index({ shopifyOrderId: 1 });

// Compound indexes for complex queries
OrderSchema.index({ user: 1, 'mobileStatus.current': 1, placedAt: -1 });
OrderSchema.index({ financialStatus: 1, placedAt: -1 });

// =============================================================================
// VIRTUALS
// =============================================================================

OrderSchema.virtual('totalItems').get(function(this: IOrder): number {
  return this.lineItems.reduce((total, item) => total + item.quantity, 0);
});

OrderSchema.virtual('totalWeight').get(function(this: IOrder): number {
  // This would require product data to calculate actual weight
  return this.lineItems.reduce((total, item) => total + (item.quantity * 1), 0); // Placeholder
});

OrderSchema.virtual('isActive').get(function(this: IOrder): boolean {
  const activeStatuses = ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];
  return activeStatuses.includes(this.mobileStatus.current);
});

// Virtual property removed to avoid conflict with method

// Virtual property removed to avoid conflict with method

// =============================================================================
// METHODS
// =============================================================================

/**
 * Update mobile status with history tracking
 */
OrderSchema.methods.updateMobileStatus = async function(
  this: MongooseDocument<IOrder>,
  status: string, 
  note?: string, 
  location?: string
): Promise<void> {
  // Add current status to history
  const historyEntry: IMobileStatusHistory = {
    status: this.mobileStatus.current,
    timestamp: new Date()
  };
  if (note !== undefined) historyEntry.note = note;
  if (location !== undefined) historyEntry.location = location;
  
  this.mobileStatus.history.push(historyEntry);
  
  // Update current status
  this.mobileStatus.current = status as any;
  
  // Update corresponding timestamp
  const now = new Date();
  switch (status) {
    case 'processing':
      (this as any).processedAt = now;
      break;
    case 'shipped':
      (this as any).shippedAt = now;
      break;
    case 'delivered':
      (this as any).deliveredAt = now;
      break;
    case 'cancelled':
      (this as any).cancelledAt = now;
      break;
  }
  
  await this.save();
  
  // Send notification
  const statusMessages: Record<string, string> = {
    confirmed: 'Your order has been confirmed!',
    processing: 'Your order is being processed',
    shipped: 'Your order has been shipped',
    out_for_delivery: 'Your order is out for delivery',
    delivered: 'Your order has been delivered',
    cancelled: 'Your order has been cancelled'
  };
  
  if (statusMessages[status]) {
    await (this as any).sendNotification('push', 'Order Update', statusMessages[status]);
  }
};

/**
 * Send notification to customer
 */
OrderSchema.methods.sendNotification = async function(
  this: MongooseDocument<IOrder>,
  type: 'push' | 'email' | 'sms', 
  title: string, 
  message: string
): Promise<void> {
  // Check if user has enabled this notification type
  const preferences = (this as any).notificationPreferences;
  const isEnabled = 
    (type === 'push' && preferences.pushEnabled) ||
    (type === 'email' && preferences.emailEnabled) ||
    (type === 'sms' && preferences.smsEnabled);
  
  if (!isEnabled) {
    return;
  }
  
  const notification: IOrderNotification = {
    type,
    title,
    message,
    sentAt: new Date(),
    status: 'sent'
  };
  
  (this as any).notifications.push(notification);
  await this.save();
  
  // Here you would integrate with your notification service
  // (FCM for push, email service, SMS service, etc.)
  console.log(`Notification sent to user ${(this as any).user}: ${title} - ${message}`);
};

/**
 * Check if order can be cancelled
 */
OrderSchema.methods.canBeCancelled = function(this: IOrder): boolean {
  const cancelableStatuses = ['placed', 'confirmed', 'processing'];
  return cancelableStatuses.includes(this.mobileStatus.current) &&
         this.financialStatus !== 'refunded';
};

/**
 * Check if order can be returned
 */
OrderSchema.methods.canBeReturned = function(this: IOrder): boolean {
  if (this.mobileStatus.current !== 'delivered' || !(this as any).deliveredAt) {
    return false;
  }
  
  // Allow returns within 30 days of delivery
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return (this as any).deliveredAt > thirtyDaysAgo;
};

/**
 * Calculate total weight of the order
 */
OrderSchema.methods.getTotalWeight = function(this: IOrder): number {
  // This would need product data to calculate actual weight
  return this.lineItems.reduce((total, item) => total + (item.quantity * 1), 0);
};

// =============================================================================
// MIDDLEWARE (HOOKS)
// =============================================================================

/**
 * Pre-save middleware to generate order number and initialize status
 */
OrderSchema.pre('save', async function(this: IOrder, next): Promise<void> {
  // Generate unique order number for new orders
  if (this.isNew && !this.orderNumber) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.orderNumber = `ORD-${date}-${random}`;
  }
  
  // Initialize mobile status history for new orders
  if (this.isNew && this.mobileStatus.history.length === 0) {
    this.mobileStatus.history = [{
      status: 'placed',
      timestamp: (this as any).placedAt || new Date()
    }];
  }
  
  next();
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find orders by user with pagination
 */
OrderSchema.statics.findByUser = function(
  userId: string,
  options: { limit?: number; skip?: number; status?: string } = {}
) {
  const query: any = { user: userId };

  if (options.status) {
    query['mobileStatus.current'] = options.status;
  }

  return this.find(query)
    .sort({ placedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.skip || 0)
    .populate('user', 'name email');
};

/**
 * Find orders by tracking number
 */
OrderSchema.statics.findByTrackingNumber = function(
  trackingNumber: string
) {
  return this.findOne({ 'shipping.trackingNumber': trackingNumber });
};

/**
 * Find orders requiring attention (support tickets, returns, etc.)
 */
OrderSchema.statics.findRequiringAttention = function() {
  return this.find({
    $or: [
      { 'supportTickets.status': { $in: ['open', 'pending'] } },
      { 'returns.status': { $in: ['requested', 'approved'] } },
      {
        'mobileStatus.current': 'delivered',
        customerRating: { $exists: false },
        deliveredAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Within 7 days
      }
    ]
  }).sort({ updatedAt: -1 });
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

export interface IOrderDocument extends MongooseDocument<IOrder> {
  updateMobileStatus(status: string, note?: string, location?: string): Promise<void>;
  sendNotification(type: 'push' | 'email' | 'sms', title: string, message: string): Promise<void>;
  canBeCancelled(): boolean;
  canBeReturned(): boolean;
  getTotalWeight(): number;
}

export interface IOrderModel extends mongoose.Model<IOrderDocument> {
  findByUser(
    userId: string, 
    options?: { limit?: number; skip?: number; status?: string }
  ): mongoose.Query<IOrderDocument[], IOrderDocument>;
  findByTrackingNumber(trackingNumber: string): mongoose.Query<IOrderDocument | null, IOrderDocument>;
  findRequiringAttention(): mongoose.Query<IOrderDocument[], IOrderDocument>;
}

export type { 
  IOrder, 
  IOrderLineItem, 
  IOrderAddress, 
  IOrderShipping, 
  IOrderNotification, 
  IOrderRating, 
  ISupportTicket, 
  IReturnExchange 
};

const Order = mongoose.model<IOrder>('Order', OrderSchema) as IOrderModel;

export default Order;