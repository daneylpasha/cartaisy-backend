import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAddress {
  label?: string;
  type?: 'billing' | 'shipping' | 'both';
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city?: string;
  province: string;
  country: string;
  countryCode?: string;
  zip?: string;
  isDefault: boolean;
}

export interface ICartItem {
  productId: mongoose.Types.ObjectId | string;  // Can be MongoDB ObjectId or Shopify product ID
  variantId?: string;
  quantity: number;
  addedAt: Date;
}

export interface ICart {
  items: ICartItem[];
  updatedAt: Date;
}

export interface INotificationPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  promotions: boolean;
  orderUpdates: boolean;
}

export interface IPreferences {
  currency?: string;
  language?: string;
  notifications: INotificationPreferences;
}

export interface IDeviceToken {
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  lastUsed: Date;
  active: boolean;
  createdAt: Date;
}

export interface ICustomer extends Document {
  storeId: mongoose.Types.ObjectId;
  email: string;
  password: string;
  name?: string;
  phone?: string;
  avatar?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: Date;
  country?: string;
  addresses: IAddress[];
  wishlist: mongoose.Types.ObjectId[];
  cart: ICart;
  preferences: IPreferences;
  deviceTokens: IDeviceToken[];
  notificationPreferences: {
    pushEnabled: boolean;
    orderUpdates: boolean;
    promotions: boolean;
    newProducts: boolean;
  };
  subscribedToTopics: string[];
  // Segmentation fields
  lastOrderDate?: Date;
  orderCount: number;
  totalSpent: number;
  stripeCustomerId?: string;
  shopifyCartId?: string;  // Shopify cart ID for cart persistence across sessions
  isActive: boolean;
  isVerified: boolean;
  verificationToken?: string;
  verificationExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  addDeviceToken(token: string, platform: 'ios' | 'android', deviceId?: string): Promise<ICustomer>;
  removeDeviceToken(token: string): Promise<ICustomer>;
  deactivateDeviceToken(token: string): Promise<ICustomer>;
  getActiveDeviceTokens(): string[];
  getDeviceTokensByPlatform(platform: 'ios' | 'android'): string[];
}

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String },
    type: { type: String, enum: ['billing', 'shipping', 'both'], default: 'both' },
    firstName: { type: String },
    lastName: { type: String },
    phone: { type: String },
    address1: { type: String, required: true },
    address2: { type: String },
    city: { type: String },
    province: { type: String, required: true },
    country: { type: String, required: true },
    countryCode: { type: String },
    zip: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

const cartItemSchema = new Schema<ICartItem>(
  {
    productId: { type: Schema.Types.Mixed, required: true },  // Accept both ObjectId and String (Shopify IDs)
    variantId: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deviceTokenSchema = new Schema<IDeviceToken>(
  {
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceId: { type: String },
    lastUsed: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const customerSchema = new Schema<ICustomer>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: false,
    },
    phone: {
      type: String,
    },
    avatar: {
      type: String,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    dateOfBirth: {
      type: Date,
    },
    country: {
      type: String,
    },
    addresses: [addressSchema],
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    cart: {
      items: [cartItemSchema],
      updatedAt: { type: Date, default: Date.now },
    },
    preferences: {
      currency: { type: String },
      language: { type: String },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        promotions: { type: Boolean, default: true },
        orderUpdates: { type: Boolean, default: true },
      },
    },
    deviceTokens: [deviceTokenSchema],
    notificationPreferences: {
      pushEnabled: { type: Boolean, default: true },
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      newProducts: { type: Boolean, default: false },
    },
    subscribedToTopics: [{ type: String }],
    // Segmentation fields for targeted notifications
    lastOrderDate: { type: Date },
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    stripeCustomerId: {
      type: String,
      sparse: true,
    },
    shopifyCartId: {
      type: String,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
    },
    verificationExpires: {
      type: Date,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index on storeId and email
customerSchema.index({ storeId: 1, email: 1 }, { unique: true });

// Index for querying active customers by store
customerSchema.index({ storeId: 1, isActive: 1 });

// Index for querying customers by store and creation date
customerSchema.index({ storeId: 1, createdAt: -1 });

// Pre-save hook to hash password
customerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
customerSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Add or update a device token
 */
customerSchema.methods.addDeviceToken = async function (
  token: string,
  platform: 'ios' | 'android',
  deviceId?: string
) {
  // Check if token already exists
  const existingTokenIndex = this.deviceTokens.findIndex(
    (dt: IDeviceToken) => dt.token === token
  );

  if (existingTokenIndex !== -1) {
    // Update existing token
    this.deviceTokens[existingTokenIndex].lastUsed = new Date();
    this.deviceTokens[existingTokenIndex].active = true;
    this.deviceTokens[existingTokenIndex].platform = platform;
    if (deviceId) {
      this.deviceTokens[existingTokenIndex].deviceId = deviceId;
    }
  } else {
    // Add new token
    this.deviceTokens.push({
      token,
      platform,
      deviceId,
      lastUsed: new Date(),
      active: true,
      createdAt: new Date(),
    });
  }

  return this.save();
};

/**
 * Remove a device token
 */
customerSchema.methods.removeDeviceToken = async function (token: string) {
  this.deviceTokens = this.deviceTokens.filter(
    (dt: IDeviceToken) => dt.token !== token
  );
  return this.save();
};

/**
 * Deactivate a device token (mark as inactive instead of removing)
 */
customerSchema.methods.deactivateDeviceToken = async function (token: string) {
  const tokenIndex = this.deviceTokens.findIndex(
    (dt: IDeviceToken) => dt.token === token
  );
  if (tokenIndex !== -1) {
    this.deviceTokens[tokenIndex].active = false;
    return this.save();
  }
  return this;
};

/**
 * Get all active device tokens
 */
customerSchema.methods.getActiveDeviceTokens = function (): string[] {
  return this.deviceTokens
    .filter((dt: IDeviceToken) => dt.active)
    .map((dt: IDeviceToken) => dt.token);
};

/**
 * Get device tokens by platform
 */
customerSchema.methods.getDeviceTokensByPlatform = function (
  platform: 'ios' | 'android'
): string[] {
  return this.deviceTokens
    .filter((dt: IDeviceToken) => dt.active && dt.platform === platform)
    .map((dt: IDeviceToken) => dt.token);
};

const Customer = mongoose.model<ICustomer>('Customer', customerSchema);

export default Customer;
