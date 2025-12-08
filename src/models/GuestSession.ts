import mongoose, { Schema, Document } from 'mongoose';

/**
 * Guest Session Model
 *
 * Enables guest checkout by storing session-based cart and user data
 * for users who haven't registered or logged in.
 *
 * Features:
 * - Device-based session tracking
 * - Cart persistence (30-day expiry)
 * - Automatic cart merge on login/registration
 * - Guest checkout info collection
 */

export interface IGuestCartItem {
  product: mongoose.Types.ObjectId;
  variantId?: string;
  quantity: number;
  addedAt: Date;
}

export interface IGuestCart {
  items: IGuestCartItem[];
  updatedAt: Date;
}

export interface IGuestCheckoutInfo {
  email: string;
  phone?: string;
  fullName: string;
}

export interface IGuestSession extends Document {
  sessionId: string;
  deviceId?: string;
  storeId: mongoose.Types.ObjectId;

  // Cart data
  cart: IGuestCart;

  // Wishlist (for potential sync)
  wishlist: mongoose.Types.ObjectId[];

  // Recently viewed products
  recentlyViewed: mongoose.Types.ObjectId[];

  // Guest checkout info (collected at checkout)
  guestCheckout?: IGuestCheckoutInfo;

  // Conversion tracking
  convertedToCustomerId?: mongoose.Types.ObjectId;
  convertedAt?: Date;

  // Expiration
  expiresAt: Date;
  lastActivityAt: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const GuestCartItemSchema = new Schema<IGuestCartItem>(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantId: {
      type: String,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const GuestCheckoutInfoSchema = new Schema<IGuestCheckoutInfo>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const GuestSessionSchema = new Schema<IGuestSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceId: {
      type: String,
      index: true,
    },
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    cart: {
      items: {
        type: [GuestCartItemSchema],
        default: [],
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
    },
    wishlist: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    recentlyViewed: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    guestCheckout: {
      type: GuestCheckoutInfoSchema,
    },
    convertedToCustomerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    convertedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      index: true,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index - auto-delete expired sessions
GuestSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for efficient queries
GuestSessionSchema.index({ storeId: 1, sessionId: 1 });
GuestSessionSchema.index({ deviceId: 1, storeId: 1 });
GuestSessionSchema.index({ 'guestCheckout.email': 1, storeId: 1 });

// Pre-save hook to update lastActivityAt
GuestSessionSchema.pre('save', function (next) {
  this.lastActivityAt = new Date();
  if (this.isModified('cart.items')) {
    this.cart.updatedAt = new Date();
  }
  next();
});

// Static method to find active session by sessionId and storeId
GuestSessionSchema.statics.findBySessionId = function (
  sessionId: string,
  storeId: string
) {
  return this.findOne({
    sessionId,
    storeId,
    expiresAt: { $gt: new Date() },
  });
};

// Static method to find or create session
GuestSessionSchema.statics.findOrCreateSession = async function (
  sessionId: string | undefined,
  storeId: string,
  deviceId?: string
): Promise<{ session: IGuestSession; isNew: boolean }> {
  if (sessionId) {
    const existingSession = await this.findOne({
      sessionId,
      storeId,
      expiresAt: { $gt: new Date() },
    });

    if (existingSession) {
      existingSession.lastActivityAt = new Date();
      if (deviceId && !existingSession.deviceId) {
        existingSession.deviceId = deviceId;
      }
      await existingSession.save();
      return { session: existingSession, isNew: false };
    }
  }

  // Create new session
  const { v4: uuidv4 } = await import('uuid');
  const newSessionId = sessionId || uuidv4();

  const newSession = await this.create({
    sessionId: newSessionId,
    deviceId,
    storeId,
    cart: { items: [], updatedAt: new Date() },
    wishlist: [],
    recentlyViewed: [],
  });

  return { session: newSession, isNew: true };
};

// Method to extend session expiration
GuestSessionSchema.methods.extendExpiration = function (days: number = 30) {
  this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return this;
};

// Method to check if session is expired
GuestSessionSchema.methods.isExpired = function (): boolean {
  return this.expiresAt < new Date();
};

// Method to get cart item count
GuestSessionSchema.methods.getCartItemCount = function (): number {
  return this.cart.items.reduce(
    (total: number, item: IGuestCartItem) => total + item.quantity,
    0
  );
};

// Interface for static methods
export interface IGuestSessionModel extends mongoose.Model<IGuestSession> {
  findBySessionId(
    sessionId: string,
    storeId: string
  ): Promise<IGuestSession | null>;
  findOrCreateSession(
    sessionId: string | undefined,
    storeId: string,
    deviceId?: string
  ): Promise<{ session: IGuestSession; isNew: boolean }>;
}

const GuestSession = mongoose.model<IGuestSession, IGuestSessionModel>(
  'GuestSession',
  GuestSessionSchema
);

export default GuestSession;
