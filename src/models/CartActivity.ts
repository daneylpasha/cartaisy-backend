import mongoose, { Document, Schema } from 'mongoose';

/**
 * Cart Activity Model
 *
 * Tracks customer cart activity for abandoned cart notifications.
 * Records when customers update their cart and when they initiate checkout.
 * Used to determine if a cart has been "abandoned" (no activity for X minutes).
 */

export interface ICartActivity extends Document {
  storeId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  shopifyCartId?: string;

  // Activity timestamps
  lastCartUpdate: Date;
  lastCheckoutInitiated?: Date;

  // Cart summary (for notification content)
  itemCount: number;
  cartTotal: number;
  currency: string;

  // Notification tracking
  lastAbandonedCartNotificationSent?: Date;
  abandonedCartNotificationCount: number;

  // Status
  hasCompletedCheckout: boolean;
  checkoutCompletedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const CartActivitySchema = new Schema<ICartActivity>(
  {
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
    shopifyCartId: {
      type: String,
      sparse: true,
      index: true,
    },

    // Activity timestamps
    lastCartUpdate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    lastCheckoutInitiated: {
      type: Date,
      index: true,
    },

    // Cart summary
    itemCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cartTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },

    // Notification tracking
    lastAbandonedCartNotificationSent: {
      type: Date,
    },
    abandonedCartNotificationCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Status
    hasCompletedCheckout: {
      type: Boolean,
      default: false,
      index: true,
    },
    checkoutCompletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
CartActivitySchema.index({ storeId: 1, customerId: 1 }, { unique: true });
CartActivitySchema.index({ storeId: 1, lastCartUpdate: -1 });
CartActivitySchema.index({ storeId: 1, hasCompletedCheckout: 1, lastCartUpdate: -1 });
CartActivitySchema.index({
  storeId: 1,
  hasCompletedCheckout: 1,
  lastCheckoutInitiated: 1,
  lastAbandonedCartNotificationSent: 1,
});

// TTL index - auto-delete cart activity older than 30 days with no items
CartActivitySchema.index(
  { updatedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { itemCount: 0 },
  }
);

/**
 * Update cart activity when customer adds/removes items
 */
CartActivitySchema.statics.updateCartActivity = async function (
  storeId: mongoose.Types.ObjectId | string,
  customerId: mongoose.Types.ObjectId | string,
  cartData: {
    shopifyCartId?: string;
    itemCount: number;
    cartTotal: number;
    currency?: string;
  }
): Promise<ICartActivity> {
  const update: any = {
    lastCartUpdate: new Date(),
    itemCount: cartData.itemCount,
    cartTotal: cartData.cartTotal,
    hasCompletedCheckout: false, // Reset when cart is updated
  };

  if (cartData.shopifyCartId) {
    update.shopifyCartId = cartData.shopifyCartId;
  }
  if (cartData.currency) {
    update.currency = cartData.currency;
  }

  return this.findOneAndUpdate(
    { storeId, customerId },
    { $set: update },
    { upsert: true, new: true }
  );
};

/**
 * Mark checkout as initiated
 */
CartActivitySchema.statics.markCheckoutInitiated = async function (
  storeId: mongoose.Types.ObjectId | string,
  customerId: mongoose.Types.ObjectId | string
): Promise<ICartActivity | null> {
  return this.findOneAndUpdate(
    { storeId, customerId },
    { $set: { lastCheckoutInitiated: new Date() } },
    { new: true }
  );
};

/**
 * Mark checkout as completed
 */
CartActivitySchema.statics.markCheckoutCompleted = async function (
  storeId: mongoose.Types.ObjectId | string,
  customerId: mongoose.Types.ObjectId | string
): Promise<ICartActivity | null> {
  return this.findOneAndUpdate(
    { storeId, customerId },
    {
      $set: {
        hasCompletedCheckout: true,
        checkoutCompletedAt: new Date(),
        itemCount: 0,
        cartTotal: 0,
      },
    },
    { new: true }
  );
};

/**
 * Mark abandoned cart notification as sent
 */
CartActivitySchema.statics.markNotificationSent = async function (
  customerId: mongoose.Types.ObjectId | string
): Promise<ICartActivity | null> {
  return this.findOneAndUpdate(
    { customerId },
    {
      $set: { lastAbandonedCartNotificationSent: new Date() },
      $inc: { abandonedCartNotificationCount: 1 },
    },
    { new: true }
  );
};

/**
 * Find abandoned carts for a store
 *
 * Criteria:
 * - Cart has items (itemCount > 0)
 * - No checkout initiated in X minutes OR checkout was initiated but not completed
 * - No abandoned cart notification sent in last 24 hours
 * - Checkout not completed
 */
CartActivitySchema.statics.findAbandonedCarts = async function (
  storeId: mongoose.Types.ObjectId | string,
  abandonedAfterMinutes: number = 60
): Promise<ICartActivity[]> {
  const abandonedThreshold = new Date(Date.now() - abandonedAfterMinutes * 60 * 1000);
  const notificationCooldown = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

  return this.find({
    storeId,
    itemCount: { $gt: 0 },
    hasCompletedCheckout: false,
    lastCartUpdate: { $lt: abandonedThreshold },
    $and: [
      {
        $or: [
          { lastCheckoutInitiated: { $exists: false } },
          { lastCheckoutInitiated: { $lt: abandonedThreshold } },
        ],
      },
      {
        $or: [
          { lastAbandonedCartNotificationSent: { $exists: false } },
          { lastAbandonedCartNotificationSent: { $lt: notificationCooldown } },
        ],
      },
    ],
  }).populate('customerId', 'email name deviceTokens notificationPreferences');
};

// Type definitions for static methods
export interface ICartActivityModel extends mongoose.Model<ICartActivity> {
  updateCartActivity(
    storeId: mongoose.Types.ObjectId | string,
    customerId: mongoose.Types.ObjectId | string,
    cartData: {
      shopifyCartId?: string;
      itemCount: number;
      cartTotal: number;
      currency?: string;
    }
  ): Promise<ICartActivity>;

  markCheckoutInitiated(
    storeId: mongoose.Types.ObjectId | string,
    customerId: mongoose.Types.ObjectId | string
  ): Promise<ICartActivity | null>;

  markCheckoutCompleted(
    storeId: mongoose.Types.ObjectId | string,
    customerId: mongoose.Types.ObjectId | string
  ): Promise<ICartActivity | null>;

  markNotificationSent(
    customerId: mongoose.Types.ObjectId | string
  ): Promise<ICartActivity | null>;

  findAbandonedCarts(
    storeId: mongoose.Types.ObjectId | string,
    abandonedAfterMinutes?: number
  ): Promise<ICartActivity[]>;
}

const CartActivity = mongoose.model<ICartActivity, ICartActivityModel>(
  'CartActivity',
  CartActivitySchema
);

export default CartActivity;
