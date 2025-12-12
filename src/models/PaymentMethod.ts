import mongoose, { Schema, Document } from 'mongoose';

/**
 * Payment Method Mongoose Model
 *
 * Manages customer payment methods (cards, digital wallets) stored in Stripe
 * Used during checkout flow for payment processing
 *
 * Security Notes:
 * - Never stores raw card data (PCI compliance)
 * - Only stores Stripe payment method tokens
 * - Card details are masked (last4, brand, expiry)
 */

// =============================================================================
// INTERFACES
// =============================================================================

export interface IPaymentMethod extends Document {
  userId: mongoose.Types.ObjectId;
  stripePaymentMethodId: string;
  stripeCustomerId?: string;
  type: 'card' | 'google_pay' | 'apple_pay';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    fingerprint?: string;
  };
  billingAddress: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    country: string;
    zip: string;
    firstName?: string;
    lastName?: string;
  };
  isDefault: boolean;
  isExpired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// SCHEMA DEFINITION
// =============================================================================

const PaymentMethodSchema = new Schema<IPaymentMethod>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    stripePaymentMethodId: {
      type: String,
      required: [true, 'Stripe payment method ID is required'],
      unique: true,
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          // Stripe payment method IDs start with 'pm_'
          return /^pm_[a-zA-Z0-9]+$/.test(id);
        },
        message: 'Invalid Stripe payment method ID format',
      },
    },
    stripeCustomerId: {
      type: String,
      trim: true,
      validate: {
        validator: function (id: string): boolean {
          if (!id) return true; // Optional field
          // Stripe customer IDs start with 'cus_'
          return /^cus_[a-zA-Z0-9]+$/.test(id);
        },
        message: 'Invalid Stripe customer ID format',
      },
    },
    type: {
      type: String,
      enum: {
        values: ['card', 'google_pay', 'apple_pay'],
        message: 'Payment type must be card, google_pay, or apple_pay',
      },
      required: [true, 'Payment method type is required'],
      index: true,
    },
    card: {
      brand: {
        type: String,
        enum: {
          values: ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay', 'unknown'],
          message: 'Invalid card brand',
        },
        required: function (this: IPaymentMethod): boolean {
          return this.type === 'card';
        },
      },
      last4: {
        type: String,
        required: function (this: IPaymentMethod): boolean {
          return this.type === 'card';
        },
        validate: {
          validator: function (last4: string): boolean {
            if (!last4) return true;
            return /^\d{4}$/.test(last4);
          },
          message: 'Last 4 digits must be exactly 4 numeric digits',
        },
      },
      expMonth: {
        type: Number,
        required: function (this: IPaymentMethod): boolean {
          return this.type === 'card';
        },
        min: [1, 'Expiry month must be between 1 and 12'],
        max: [12, 'Expiry month must be between 1 and 12'],
      },
      expYear: {
        type: Number,
        required: function (this: IPaymentMethod): boolean {
          return this.type === 'card';
        },
        validate: {
          validator: function (year: number): boolean {
            if (!year) return true;
            const currentYear = new Date().getFullYear();
            // Accept years from current year to 20 years in the future
            return year >= currentYear && year <= currentYear + 20;
          },
          message: 'Invalid expiry year',
        },
      },
      fingerprint: {
        type: String,
        trim: true,
      },
    },
    billingAddress: {
      address1: {
        type: String,
        required: [true, 'Billing address line 1 is required'],
        trim: true,
        maxlength: [200, 'Address line 1 cannot exceed 200 characters'],
      },
      address2: {
        type: String,
        trim: true,
        maxlength: [200, 'Address line 2 cannot exceed 200 characters'],
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true,
        maxlength: [100, 'City cannot exceed 100 characters'],
      },
      province: {
        type: String,
        required: [true, 'Province/State is required'],
        trim: true,
        maxlength: [100, 'Province cannot exceed 100 characters'],
      },
      country: {
        type: String,
        required: [true, 'Country is required'],
        trim: true,
        maxlength: [100, 'Country cannot exceed 100 characters'],
      },
      zip: {
        type: String,
        required: [true, 'ZIP/Postal code is required'],
        trim: true,
        maxlength: [20, 'ZIP code cannot exceed 20 characters'],
      },
      firstName: {
        type: String,
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters'],
      },
      lastName: {
        type: String,
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters'],
      },
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret): any {
        delete (ret as any).__v;
        // Never expose full payment method ID in API responses (security)
        if (ret.stripePaymentMethodId) {
          ret.stripePaymentMethodId = `***${ret.stripePaymentMethodId.slice(-8)}`;
        }
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// =============================================================================
// INDEXES - removing duplicates where index: true already exists on userId field
// =============================================================================

// Compound indexes for querying user's payment methods (userId has index: true but these are compound)
// PaymentMethodSchema.index({ userId: 1, isDefault: 1 }); // isDefault has index: true
PaymentMethodSchema.index({ userId: 1, createdAt: -1 });
// PaymentMethodSchema.index({ userId: 1, isExpired: 1 }); // isExpired has index: true

// =============================================================================
// VIRTUALS
// =============================================================================

/**
 * Display name for the payment method (e.g., "Visa ••••1234")
 */
PaymentMethodSchema.virtual('displayName').get(function (this: IPaymentMethod): string {
  if (this.type === 'card' && this.card) {
    const brandName = this.card.brand.charAt(0).toUpperCase() + this.card.brand.slice(1);
    return `${brandName} ••••${this.card.last4}`;
  } else if (this.type === 'google_pay') {
    return 'Google Pay';
  } else if (this.type === 'apple_pay') {
    return 'Apple Pay';
  }
  return 'Payment Method';
});

/**
 * Check if card is expired
 */
PaymentMethodSchema.virtual('isCardExpired').get(function (this: IPaymentMethod): boolean {
  if (this.type !== 'card' || !this.card) {
    return false;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed

  if (this.card.expYear < currentYear) {
    return true;
  }

  if (this.card.expYear === currentYear && this.card.expMonth < currentMonth) {
    return true;
  }

  return false;
});

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Pre-save middleware to check card expiration
 */
PaymentMethodSchema.pre('save', function (this: IPaymentMethod, next): void {
  if (this.type === 'card' && this.card) {
    // Check if card is expired and update flag
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (
      this.card.expYear < currentYear ||
      (this.card.expYear === currentYear && this.card.expMonth < currentMonth)
    ) {
      this.isExpired = true;
    } else {
      this.isExpired = false;
    }
  }

  next();
});

/**
 * Pre-save middleware to ensure only one default payment method per user
 */
PaymentMethodSchema.pre('save', async function (this: IPaymentMethod, next): Promise<void> {
  if (this.isNew && this.isDefault) {
    // If this is a new default payment method, remove default flag from others
    await PaymentMethod.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }

  next();
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find all payment methods for a user
 */
PaymentMethodSchema.statics.findByUser = function (
  userId: string | mongoose.Types.ObjectId,
  options: { includeExpired?: boolean } = {}
): mongoose.Query<IPaymentMethod[], IPaymentMethod> {
  const query: any = { userId };

  if (!options.includeExpired) {
    query.isExpired = false;
  }

  return this.find(query).sort({ isDefault: -1, createdAt: -1 });
};

/**
 * Get user's default payment method
 */
PaymentMethodSchema.statics.getDefault = function (
  userId: string | mongoose.Types.ObjectId
): mongoose.Query<IPaymentMethod | null, IPaymentMethod> {
  return this.findOne({ userId, isDefault: true, isExpired: false });
};

/**
 * Set a payment method as default
 */
PaymentMethodSchema.statics.setDefault = async function (
  paymentMethodId: string | mongoose.Types.ObjectId,
  userId: string | mongoose.Types.ObjectId
): Promise<IPaymentMethod | null> {
  // First, remove default from all user's payment methods
  await this.updateMany({ userId }, { $set: { isDefault: false } });

  // Then set the specified one as default
  return this.findOneAndUpdate(
    { _id: paymentMethodId, userId },
    { $set: { isDefault: true } },
    { new: true }
  );
};

// =============================================================================
// INSTANCE METHODS
// =============================================================================

/**
 * Check if this payment method belongs to the user
 */
PaymentMethodSchema.methods.belongsToUser = function (
  this: IPaymentMethod,
  userId: string | mongoose.Types.ObjectId
): boolean {
  return this.userId.toString() === userId.toString();
};

/**
 * Get a safe representation of the payment method (for API responses)
 */
PaymentMethodSchema.methods.toSafeObject = function (this: IPaymentMethod): any {
  return {
    id: this._id,
    type: this.type,
    displayName: (this as any).displayName,
    card: this.card
      ? {
          brand: this.card.brand,
          last4: this.card.last4,
          expMonth: this.card.expMonth,
          expYear: this.card.expYear,
        }
      : undefined,
    billingAddress: this.billingAddress,
    isDefault: this.isDefault,
    isExpired: this.isExpired,
    createdAt: this.createdAt,
  };
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

export interface IPaymentMethodDocument extends IPaymentMethod {
  displayName: string;
  isCardExpired: boolean;
  belongsToUser(userId: string | mongoose.Types.ObjectId): boolean;
  toSafeObject(): any;
}

export interface IPaymentMethodModel extends mongoose.Model<IPaymentMethodDocument> {
  findByUser(
    userId: string | mongoose.Types.ObjectId,
    options?: { includeExpired?: boolean }
  ): mongoose.Query<IPaymentMethodDocument[], IPaymentMethodDocument>;
  getDefault(
    userId: string | mongoose.Types.ObjectId
  ): mongoose.Query<IPaymentMethodDocument | null, IPaymentMethodDocument>;
  setDefault(
    paymentMethodId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IPaymentMethodDocument | null>;
}

const PaymentMethod = mongoose.model('PaymentMethod', PaymentMethodSchema) as unknown as IPaymentMethodModel;

export default PaymentMethod;
