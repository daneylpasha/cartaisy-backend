import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  IUser,
  IAddress,
  IUserPreferences,
  IUserProfile,
  IMarketing,
  MongooseDocument,
} from '../types/index';

/**
 * User Mongoose Model
 *
 * Comprehensive user model that handles authentication, profile management,
 * addresses, preferences, and Shopify customer integration.
 */

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const AddressSchema = new Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: [100, 'Address label cannot exceed 100 characters'],
    },
    type: {
      type: String,
      enum: ['billing', 'shipping', 'both'],
      default: 'both',
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
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
    },
    address1: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters'],
    },
    address2: {
      type: String,
      trim: true,
      maxlength: [200, 'Apartment/Suite cannot exceed 200 characters'],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    province: {
      type: String,
      required: [true, 'State/Province is required'],
      trim: true,
      maxlength: [100, 'Province cannot exceed 100 characters'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: [100, 'Country cannot exceed 100 characters'],
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [3, 'Country code cannot exceed 3 characters'],
    },
    zip: {
      type: String,
      required: [true, 'Postcode is required'],
      trim: true,
      maxlength: [20, 'Postcode cannot exceed 20 characters'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone number cannot exceed 20 characters'],
    },
    deliveryInstructions: {
      type: String,
      trim: true,
      maxlength: [300, 'Delivery instructions cannot exceed 300 characters'],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const NotificationPreferencesSchema = new Schema(
  {
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
  },
  { _id: false }
);

const PreferencesSchema = new Schema(
  {
    notifications: {
      type: NotificationPreferencesSchema,
      required: true,
      default: () => ({}),
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter code'],
    },
    language: {
      type: String,
      default: 'en',
      lowercase: true,
      match: [/^[a-z]{2}$/, 'Language must be a valid 2-letter code'],
    },
    wishlistItemsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const ProfileSchema = new Schema(
  {
    avatar: {
      type: String,
      validate: {
        validator: function (url: string): boolean {
          if (!url) return true; // Allow empty avatar
          return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(url);
        },
        message: 'Avatar must be a valid image URL',
      },
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (date: Date): boolean {
          if (!date) return true; // Allow null date
          return date < new Date() && date > new Date('1900-01-01');
        },
        message: 'Date of birth must be in the past and after 1900',
      },
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
    },
    interests: {
      type: [String],
      default: [],
      validate: {
        validator: function (interests: string[]): boolean {
          return interests.length <= 20; // Limit to 20 interests
        },
        message: 'Cannot have more than 20 interests',
      },
    },
  },
  { _id: false }
);

const MarketingConsentSchema = new Schema(
  {
    state: {
      type: String,
      enum: ['subscribed', 'not_subscribed', 'pending', 'unsubscribed'],
      default: 'not_subscribed',
    },
    optInLevel: {
      type: String,
      enum: ['single_opt_in', 'confirmed_opt_in', 'unknown'],
      default: 'unknown',
    },
    consentUpdatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

const MarketingSchema = new Schema(
  {
    acceptsMarketing: {
      type: Boolean,
      default: false,
    },
    marketingOptInLevel: {
      type: String,
      default: 'unknown',
    },
    emailMarketingConsent: {
      type: MarketingConsentSchema,
      required: true,
      default: () => ({}),
    },
  },
  { _id: false }
);

// =============================================================================
// MAIN USER SCHEMA
// =============================================================================

const UserSchema = new Schema<IUser>(
  {
    // Shopify Integration
    shopifyCustomerId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },

    // Stripe Integration
    stripeCustomerId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },

    // Core User Information
    name: {
      type: String,
      required: false, // Made optional for step-by-step registration
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
      minlength: [2, 'Name must be at least 2 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: function (email: string): boolean {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return emailRegex.test(email);
        },
        message: 'Please provide a valid email address',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false, // Don't include password in queries by default
    },
    phone: {
      type: String,
      trim: true,
      validate: {
        validator: function (phone: string): boolean {
          if (!phone) return true; // Allow empty phone
          return /^\+?[\d\s\-\(\)]{10,}$/.test(phone);
        },
        message: 'Please provide a valid phone number',
      },
    },

    // Account Status
    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // User Role
    role: {
      type: String,
      enum: {
        values: ['customer', 'admin', 'moderator', 'premium_customer'],
        message: 'Role must be customer, admin, moderator, or premium_customer',
      },
      default: 'customer',
      index: true,
    },

    // User Data
    addresses: {
      type: [AddressSchema],
      default: [],
      validate: {
        validator: function (addresses: IAddress[]): boolean {
          return addresses.length <= 10; // Limit to 10 addresses
        },
        message: 'Cannot have more than 10 addresses',
      },
    },
    preferences: {
      type: PreferencesSchema,
      required: true,
      default: () => ({}),
    },
    profile: {
      type: ProfileSchema,
      required: true,
      default: () => ({}),
    },
    marketing: {
      type: MarketingSchema,
      required: true,
      default: () => ({}),
    },

    // Account Management
    lastLoginAt: {
      type: Date,
      index: true,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    strict: false, // Allow dynamic fields not defined in schema
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret): any {
        delete (ret as any).password;
        delete (ret as any).passwordResetToken;
        delete (ret as any).passwordResetExpires;
        delete (ret as any).emailVerificationToken;
        delete (ret as any).emailVerificationExpires;
        delete (ret as any).__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// =============================================================================
// INDEXES
// =============================================================================

UserSchema.index({ email: 1 });
UserSchema.index({ shopifyCustomerId: 1 });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ isVerified: 1 });
UserSchema.index({ lastLoginAt: -1 });
UserSchema.index({ createdAt: -1 });

// Compound indexes
UserSchema.index({ isActive: 1, role: 1 });
UserSchema.index({ email: 1, isVerified: 1 });

// =============================================================================
// VIRTUALS
// =============================================================================

UserSchema.virtual('fullName').get(function (this: IUser): string {
  return this.name;
});

UserSchema.virtual('defaultAddress').get(function (this: IUser): IAddress | null {
  return this.addresses.find(addr => addr.isDefault) || null;
});

UserSchema.virtual('hasShippingAddress').get(function (this: IUser): boolean {
  return this.addresses.some(addr => addr.type === 'shipping');
});

UserSchema.virtual('hasBillingAddress').get(function (this: IUser): boolean {
  return this.addresses.some(addr => addr.type === 'billing');
});

// =============================================================================
// METHODS
// =============================================================================

/**
 * Check if provided password matches the user's password
 */
UserSchema.methods.comparePassword = async function (
  this: MongooseDocument<IUser>,
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate password reset token
 */
UserSchema.methods.createPasswordResetToken = function (this: MongooseDocument<IUser>): string {
  const resetToken = crypto.randomBytes(32).toString('hex');

  (this as any).passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  (this as any).passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  return resetToken;
};

/**
 * Generate email verification token
 */
UserSchema.methods.createEmailVerificationToken = function (this: MongooseDocument<IUser>): string {
  const verificationToken = crypto.randomBytes(32).toString('hex');

  (this as any).emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

  (this as any).emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return verificationToken;
};

/**
 * Update last login time
 */
UserSchema.methods.updateLastLogin = async function (this: MongooseDocument<IUser>): Promise<void> {
  this.lastLoginAt = new Date();
  await this.save({ validateBeforeSave: false });
};

/**
 * Add new address
 */
UserSchema.methods.addAddress = function (
  this: MongooseDocument<IUser>,
  address: Omit<IAddress, 'isDefault'>
): void {
  // If this is the first address, make it default
  const isFirstAddress = this.addresses.length === 0;

  this.addresses.push({
    ...address,
    isDefault: isFirstAddress,
  });
};

/**
 * Update address by index
 */
UserSchema.methods.updateAddress = function (
  this: MongooseDocument<IUser>,
  index: number,
  updates: Partial<IAddress>
): boolean {
  if (index < 0 || index >= this.addresses.length) {
    return false;
  }

  const address = this.addresses[index];
  if (address) {
    Object.assign(address, updates);
    return true;
  }
  return false;
};

/**
 * Remove address by index
 */
UserSchema.methods.removeAddress = function (
  this: MongooseDocument<IUser>,
  index: number
): boolean {
  if (index < 0 || index >= this.addresses.length) {
    return false;
  }

  const addressToRemove = this.addresses[index];
  if (!addressToRemove) {
    return false;
  }

  const wasDefault = addressToRemove.isDefault;
  this.addresses.splice(index, 1);

  // If the removed address was default and there are other addresses,
  // make the first one default
  if (wasDefault && this.addresses.length > 0 && this.addresses[0]) {
    this.addresses[0].isDefault = true;
  }

  return true;
};

/**
 * Set default address
 */
UserSchema.methods.setDefaultAddress = function (
  this: MongooseDocument<IUser>,
  index: number
): boolean {
  if (index < 0 || index >= this.addresses.length) {
    return false;
  }

  const targetAddress = this.addresses[index];
  if (!targetAddress) {
    return false;
  }

  // Remove default from all addresses
  this.addresses.forEach(addr => {
    if (addr) {
      addr.isDefault = false;
    }
  });

  // Set new default
  targetAddress.isDefault = true;
  return true;
};

// =============================================================================
// MIDDLEWARE (HOOKS)
// =============================================================================

/**
 * Pre-save middleware to hash password
 */
UserSchema.pre('save', async function (this: MongooseDocument<IUser>, next): Promise<void> {
  // Only hash password if it's modified (or new)
  if (!this.isModified('password')) {
    return next();
  }

  if (!this.password) {
    return next();
  }

  try {
    // Hash password with bcrypt
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Pre-save middleware to ensure only one default address per type
 */
UserSchema.pre('save', function (this: MongooseDocument<IUser>, next): void {
  if (!this.isModified('addresses')) {
    return next();
  }

  // Ensure only one default address per type
  const addressTypes = ['billing', 'shipping'] as const;

  addressTypes.forEach(type => {
    const addressesOfType = this.addresses.filter(addr => addr.type === type);
    const defaultAddresses = addressesOfType.filter(addr => addr.isDefault);

    if (defaultAddresses.length > 1) {
      // Keep only the first default, remove default from others
      addressesOfType.forEach((addr, index) => {
        if (addr.isDefault && index > 0) {
          addr.isDefault = false;
        }
      });
    }
  });

  next();
});

// =============================================================================
// STATIC METHODS
// =============================================================================

/**
 * Find user by email with password included
 */
UserSchema.statics.findByEmail = function (
  email: string
): mongoose.Query<MongooseDocument<IUser> | null, MongooseDocument<IUser>> {
  return this.findOne({ email: email.toLowerCase() });
};

/**
 * Find user by email with password included (for authentication)
 */
UserSchema.statics.findByEmailWithPassword = function (
  email: string
): mongoose.Query<MongooseDocument<IUser> | null, MongooseDocument<IUser>> {
  return this.findOne({ email: email.toLowerCase() }).select('+password');
};

/**
 * Find user by reset token
 */
UserSchema.statics.findByPasswordResetToken = function (
  token: string
): mongoose.Query<MongooseDocument<IUser> | null, MongooseDocument<IUser>> {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return this.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });
};

/**
 * Find user by email verification token
 */
UserSchema.statics.findByEmailVerificationToken = function (
  token: string
): mongoose.Query<MongooseDocument<IUser> | null, MongooseDocument<IUser>> {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  return this.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });
};

// =============================================================================
// MODEL EXPORT
// =============================================================================

export interface IUserDocument extends MongooseDocument<IUser> {
  comparePassword(candidatePassword: string): Promise<boolean>;
  createPasswordResetToken(): string;
  createEmailVerificationToken(): string;
  updateLastLogin(): Promise<void>;
  addAddress(address: Omit<IAddress, 'isDefault'>): void;
  updateAddress(index: number, updates: Partial<IAddress>): boolean;
  removeAddress(index: number): boolean;
  setDefaultAddress(index: number): boolean;
}

export interface IUserModel extends mongoose.Model<IUserDocument> {
  findByEmail(email: string): mongoose.Query<IUserDocument | null, IUserDocument>;
  findByEmailWithPassword(email: string): mongoose.Query<IUserDocument | null, IUserDocument>;
  findByPasswordResetToken(token: string): mongoose.Query<IUserDocument | null, IUserDocument>;
  findByEmailVerificationToken(token: string): mongoose.Query<IUserDocument | null, IUserDocument>;
}

export type { IUser, IAddress, IUserPreferences, IUserProfile, IMarketing };

const User = mongoose.model<IUser>('User', UserSchema) as IUserModel;

export default User;
