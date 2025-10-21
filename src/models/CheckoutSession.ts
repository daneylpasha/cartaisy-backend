import mongoose, { Schema, Document } from 'mongoose';

/**
 * Checkout Session Mongoose Model
 *
 * Manages the multi-step checkout process
 * Tracks user progress through: Shipping → Payment → Confirmation
 * Auto-expires after 30 minutes of inactivity (TTL index)
 *
 * Flow:
 * 1. User initiates checkout → Creates session with cart ID
 * 2. Step 1: User selects shipping address & method → Updates session
 * 3. Step 2: User selects payment method → Updates session
 * 4. Step 3: User applies promo code (optional) → Updates session
 * 5. User confirms → Payment processed → Order created → Session completed
 */

// =============================================================================
// INTERFACES
// =============================================================================

export interface IShippingRate {
  handle: string;
  title: string;
  price: number;
  description?: string;
  estimatedDelivery?: string;
}

export interface IDiscount {
  code: string;
  amount: number;
  type: 'percentage' | 'fixed_amount';
  applicable: boolean;
}

export interface ICheckoutSession extends Document {
  userId: mongoose.Types.ObjectId;
  shopifyCartId: string;

  // Step 1: Shipping Information
  shippingAddressId?: number; // Index in user.addresses array
  deliveryInstructions?: string;
  contactNumber?: string;
  selectedShippingRate?: IShippingRate;

  // Step 2: Payment Method
  paymentMethodId?: mongoose.Types.ObjectId;

  // Step 3: Discount/Promo Code
  promoCode?: string;
  discount?: IDiscount;

  // Pricing Breakdown (updated throughout checkout)
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  tax: number;
  grandTotal: number;
  currency: string;

  // Shopify Integration
  shopifyDraftOrderId?: string;

  // Payment Processing (Stripe)
  stripePaymentIntentId?: string;
  stripeClientSecret?: string; // For 3D Secure on frontend
  paymentStatus: 'pending' | 'processing' | 'requires_action' | 'succeeded' | 'failed';
  paymentError?: string;

  // Order Creation
  orderId?: mongoose.Types.ObjectId;
  shopifyOrderId?: string;

  // Session Management
  status: 'step1' | 'step2' | 'step3' | 'payment_processing' | 'completed' | 'failed' | 'expired';
  currentStep: number; // 1, 2, or 3
  completedSteps: number[]; // Array of completed step numbers

  // Metadata
  ipAddress?: string;
  userAgent?: string;
  metadata?: Map<string, any>;

  // Auto-expiration (30 minutes default)
  expiresAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

const ShippingRateSchema = new Schema(
  {
    handle: {
      type: String,
      required: [true, 'Shipping rate handle is required'],
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Shipping rate title is required'],
      trim: true,
      maxlength: [100, 'Shipping rate title cannot exceed 100 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Shipping rate price is required'],
      min: [0, 'Shipping price must be non-negative'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Shipping rate description cannot exceed 300 characters'],
    },
    estimatedDelivery: {
      type: String,
      trim: true,
      maxlength: [100, 'Estimated delivery cannot exceed 100 characters'],
    },
  },
  { _id: false }
);

const DiscountSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Discount code is required'],
      trim: true,
      uppercase: true,
    },
    amount: {
      type: Number,
      required: [true, 'Discount amount is required'],
      min: [0, 'Discount amount must be non-negative'],
    },
    type: {
      type: String,
      enum: {
        values: ['percentage', 'fixed_amount'],
        message: 'Discount type must be percentage or fixed_amount',
      },
      required: [true, 'Discount type is required'],
    },
    applicable: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const CheckoutSessionSchema = new Schema<ICheckoutSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    shopifyCartId: {
      type: String,
      required: [true, 'Shopify cart ID is required'],
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          // Shopify cart IDs start with 'gid://shopify/Cart/'
          return id.startsWith('gid://shopify/Cart/');
        },
        message: 'Invalid Shopify cart ID format',
      },
    },

    // Step 1: Shipping
    shippingAddressId: {
      type: Number,
      min: [0, 'Address ID must be non-negative'],
    },
    deliveryInstructions: {
      type: String,
      trim: true,
      maxlength: [300, 'Delivery instructions cannot exceed 300 characters'],
    },
    contactNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (phone: string): boolean {
          if (!phone) return true; // Optional field
          return /^\+?[\d\s\-\(\)]{10,}$/.test(phone);
        },
        message: 'Please provide a valid phone number',
      },
    },
    selectedShippingRate: {
      type: ShippingRateSchema,
    },

    // Step 2: Payment
    paymentMethodId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentMethod',
    },

    // Step 3: Discount
    promoCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Promo code cannot exceed 50 characters'],
    },
    discount: {
      type: DiscountSchema,
    },

    // Pricing
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal must be non-negative'],
      default: 0,
    },
    shippingCost: {
      type: Number,
      min: [0, 'Shipping cost must be non-negative'],
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: [0, 'Discount amount must be non-negative'],
      default: 0,
    },
    tax: {
      type: Number,
      min: [0, 'Tax must be non-negative'],
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: [true, 'Grand total is required'],
      min: [0, 'Grand total must be non-negative'],
      default: 0,
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      default: 'USD',
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code'],
    },

    // Shopify Integration
    shopifyDraftOrderId: {
      type: String,
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          if (!id) return true; // Optional field
          return id.startsWith('gid://shopify/DraftOrder/');
        },
        message: 'Invalid Shopify draft order ID format',
      },
    },

    // Payment Processing
    stripePaymentIntentId: {
      type: String,
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          if (!id) return true; // Optional field
          return /^pi_[a-zA-Z0-9]+$/.test(id);
        },
        message: 'Invalid Stripe payment intent ID format',
      },
    },
    stripeClientSecret: {
      type: String,
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ['pending', 'processing', 'requires_action', 'succeeded', 'failed'],
        message: 'Invalid payment status',
      },
      default: 'pending',
      index: true,
    },
    paymentError: {
      type: String,
      trim: true,
      maxlength: [500, 'Payment error message cannot exceed 500 characters'],
    },

    // Order Creation
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    shopifyOrderId: {
      type: String,
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          if (!id) return true; // Optional field
          return id.startsWith('gid://shopify/Order/');
        },
        message: 'Invalid Shopify order ID format',
      },
    },

    // Session Management
    status: {
      type: String,
      enum: {
        values: ['step1', 'step2', 'step3', 'payment_processing', 'completed', 'failed', 'expired'],
        message: 'Invalid session status',
      },
      default: 'step1',
      index: true,
    },
    currentStep: {
      type: Number,
      min: [1, 'Current step must be between 1 and 3'],
      max: [3, 'Current step must be between 1 and 3'],
      default: 1,
    },
    completedSteps: {
      type: [Number],
      default: [],
      validate: {
        validator: function (steps: number[]): boolean {
          return steps.every((step) => step >= 1 && step <= 3);
        },
        message: 'Completed steps must contain only values 1, 2, or 3',
      },
    },

    // Metadata
    ipAddress: {
      type: String,
      trim: true,
      validate: {
        validator: function (ip: string): boolean {
          if (!ip) return true;
          // Basic IPv4/IPv6 validation
          return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/.test(ip);
        },
        message: 'Invalid IP address format',
      },
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'User agent cannot exceed 500 characters'],
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },

    // Auto-expiration (30 minutes from creation)
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret): any {
        delete (ret as any).__v;
        // Mask sensitive data in API responses
        if (ret.stripeClientSecret) {
          ret.stripeClientSecret = `***${ret.stripeClientSecret.slice(-10)}`;
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// =============================================================================
// INDEXES
// =============================================================================

// TTL index - MongoDB will automatically delete documents after expiresAt
CheckoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for querying
CheckoutSessionSchema.index({ userId: 1, status: 1 });
CheckoutSessionSchema.index({ userId: 1, createdAt: -1 });
CheckoutSessionSchema.index({ shopifyCartId: 1 });
CheckoutSessionSchema.index({ stripePaymentIntentId: 1 });

// =============================================================================
// VIRTUALS
// =============================================================================

/**
 * Check if session is expired
 */
CheckoutSessionSchema.virtual('isExpired').get(function (this: ICheckoutSession): boolean {
  return new Date() > this.expiresAt;
});

/**
 * Calculate completion percentage (for progress indicators)
 */
CheckoutSessionSchema.virtual('completionPercentage').get(function (this: ICheckoutSession): number {
  const totalSteps = 3;
  return Math.round((this.completedSteps.length / totalSteps) * 100);
});

/**
 * Check if session is ready for payment
 */
CheckoutSessionSchema.virtual('isReadyForPayment').get(function (this: ICheckoutSession): boolean {
  return (
    !!this.shippingAddressId &&
    !!this.selectedShippingRate &&
    !!this.paymentMethodId &&
    this.status === 'step3'
  );
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Pre-save middleware to auto-expire sessions
 */
CheckoutSessionSchema.pre('save', function (this: ICheckoutSession, next): void {
  // Set expiration to 30 minutes from now if not set
  if (this.isNew && !this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }

  // Auto-mark as expired if past expiration date
  if (this.expiresAt && new Date() > this.expiresAt && this.status !== 'completed') {
    this.status = 'expired';
  }

  next();
});

/**
 * Pre-save middleware to update completed steps
 */
CheckoutSessionSchema.pre('save', function (this: ICheckoutSession, next): void {
  // Update current step based on status
  if (this.status === 'step1' && !this.completedSteps.includes(1)) {
    this.currentStep = 1;
  } else if (this.status === 'step2') {
    this.currentStep = 2;
    if (!this.completedSteps.includes(1)) {
      this.completedSteps.push(1);
    }
  } else if (this.status === 'step3') {
    this.currentStep = 3;
    if (!this.completedSteps.includes(1)) {
      this.completedSteps.push(1);
    }
    if (!this.completedSteps.includes(2)) {
      this.completedSteps.push(2);
    }
  }

  next();
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find active session for user
 */
CheckoutSessionSchema.statics.findActiveByUser = function (
  userId: string | mongoose.Types.ObjectId
): mongoose.Query<ICheckoutSession | null, ICheckoutSession> {
  return this.findOne({
    userId,
    status: { $in: ['step1', 'step2', 'step3', 'payment_processing'] },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

/**
 * Find session by cart ID
 */
CheckoutSessionSchema.statics.findByCartId = function (
  cartId: string
): mongoose.Query<ICheckoutSession | null, ICheckoutSession> {
  return this.findOne({ shopifyCartId: cartId, expiresAt: { $gt: new Date() } });
};

/**
 * Cleanup expired sessions (manual cleanup if TTL index fails)
 */
CheckoutSessionSchema.statics.cleanupExpired = async function (): Promise<number> {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
    status: { $nin: ['completed'] }, // Don't delete completed sessions
  });
  return result.deletedCount;
};

// =============================================================================
// INSTANCE METHODS
// =============================================================================

/**
 * Update pricing breakdown
 */
CheckoutSessionSchema.methods.updatePricing = function (
  this: ICheckoutSession,
  pricing: {
    subtotal?: number;
    shippingCost?: number;
    discountAmount?: number;
    tax?: number;
  }
): void {
  if (pricing.subtotal !== undefined) this.subtotal = pricing.subtotal;
  if (pricing.shippingCost !== undefined) this.shippingCost = pricing.shippingCost;
  if (pricing.discountAmount !== undefined) this.discountAmount = pricing.discountAmount;
  if (pricing.tax !== undefined) this.tax = pricing.tax;

  // Recalculate grand total
  this.grandTotal = this.subtotal + this.shippingCost + this.tax - this.discountAmount;
};

/**
 * Mark step as completed
 */
CheckoutSessionSchema.methods.completeStep = function (this: ICheckoutSession, step: number): void {
  if (step >= 1 && step <= 3 && !this.completedSteps.includes(step)) {
    this.completedSteps.push(step);
    this.completedSteps.sort();
  }
};

/**
 * Extend session expiration
 */
CheckoutSessionSchema.methods.extendExpiration = function (this: ICheckoutSession, minutes: number = 30): void {
  this.expiresAt = new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Check if session belongs to user
 */
CheckoutSessionSchema.methods.belongsToUser = function (
  this: ICheckoutSession,
  userId: string | mongoose.Types.ObjectId
): boolean {
  return this.userId.toString() === userId.toString();
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

export interface ICheckoutSessionDocument extends ICheckoutSession {
  isExpired: boolean;
  completionPercentage: number;
  isReadyForPayment: boolean;
  updatePricing(pricing: {
    subtotal?: number;
    shippingCost?: number;
    discountAmount?: number;
    tax?: number;
  }): void;
  completeStep(step: number): void;
  extendExpiration(minutes?: number): void;
  belongsToUser(userId: string | mongoose.Types.ObjectId): boolean;
}

export interface ICheckoutSessionModel extends mongoose.Model<ICheckoutSessionDocument> {
  findActiveByUser(
    userId: string | mongoose.Types.ObjectId
  ): mongoose.Query<ICheckoutSessionDocument | null, ICheckoutSessionDocument>;
  findByCartId(
    cartId: string
  ): mongoose.Query<ICheckoutSessionDocument | null, ICheckoutSessionDocument>;
  cleanupExpired(): Promise<number>;
}

const CheckoutSession = mongoose.model<ICheckoutSessionDocument, ICheckoutSessionModel>(
  'CheckoutSession',
  CheckoutSessionSchema
);

export default CheckoutSession;
