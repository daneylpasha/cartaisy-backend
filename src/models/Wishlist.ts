import mongoose, { Document, Schema } from 'mongoose';

export interface IWishlistItem {
  product: mongoose.Types.ObjectId;
  variant?: string; // Variant ID if specific variant is saved
  addedAt: Date;
  notes?: string;
  priority: number; // 1-5, 5 being highest priority
}

export interface IWishlistShare {
  token: string;
  isPublic: boolean;
  sharedWith: string[]; // Email addresses
  sharedAt: Date;
  expiresAt?: Date;
  viewCount: number;
}

export interface IWishlist extends Document {
  // Owner (either user or customer must be present)
  user?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;

  // Wishlist info
  name: string;
  description?: string;
  isDefault: boolean; // Each user has one default wishlist
  
  // Items
  items: IWishlistItem[];
  itemCount: number; // Denormalized for performance
  
  // Privacy and sharing
  isPrivate: boolean;
  sharing?: IWishlistShare;
  
  // Display settings
  coverImage?: string;
  color?: string; // Theme color for the wishlist
  
  // Metadata
  lastViewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  addItem(productId: string, variantId?: string, notes?: string, priority?: number): Promise<void>;
  removeItem(productId: string, variantId?: string): Promise<void>;
  hasItem(productId: string, variantId?: string): boolean;
  generateShareToken(): string;
  updateItemCount(): Promise<void>;
}

const WishlistItemSchema = new Schema({
  product: { 
    type: Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true,
    index: true
  },
  variant: { 
    type: String, 
    sparse: true 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  },
  notes: { 
    type: String, 
    maxlength: 200 
  },
  priority: { 
    type: Number, 
    min: 1, 
    max: 5, 
    default: 3 
  }
}, { _id: false });

const WishlistShareSchema = new Schema({
  token: { 
    type: String, 
    required: true, 
    unique: true 
  },
  isPublic: { 
    type: Boolean, 
    default: false 
  },
  sharedWith: [{ 
    type: String, 
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }],
  sharedAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: Date,
  viewCount: { 
    type: Number, 
    default: 0 
  }
}, { _id: false });

const WishlistSchema = new Schema({
  // Owner (either user or customer must be present)
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,  // Made optional - either user or customer must be present
    index: true
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: false,  // Either user or customer must be present
    index: true
  },

  // Wishlist info
  name: { 
    type: String, 
    required: true, 
    maxlength: 100,
    trim: true
  },
  description: { 
    type: String, 
    maxlength: 500,
    trim: true
  },
  isDefault: { 
    type: Boolean, 
    default: false,
    index: true
  },
  
  // Items
  items: [WishlistItemSchema],
  itemCount: { 
    type: Number, 
    default: 0,
    index: true
  },
  
  // Privacy and sharing
  isPrivate: { 
    type: Boolean, 
    default: true,
    index: true
  },
  sharing: WishlistShareSchema,
  
  // Display
  coverImage: String,
  color: { 
    type: String, 
    match: /^#[0-9A-F]{6}$/i,
    default: '#E91E63'
  },
  
  // Metadata
  lastViewedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes - removing duplicates where index: true already exists on field
WishlistSchema.index({ user: 1, name: 1 });
// WishlistSchema.index({ user: 1, isDefault: 1 }); // Duplicate - covered by partial unique index below
WishlistSchema.index({ customer: 1, name: 1 });  // Index for customer queries
// WishlistSchema.index({ customer: 1, isDefault: 1 }); // Duplicate - covered by partial unique index below
// WishlistSchema.index({ 'sharing.token': 1 }); // Already has index: true
WishlistSchema.index({ 'sharing.isPublic': 1 });
WishlistSchema.index({ updatedAt: -1 });

// Compound index for items
WishlistSchema.index({ 'items.product': 1, 'items.variant': 1 });

// Ensure only one default wishlist per user
WishlistSchema.index(
  { user: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true, user: { $exists: true } }
  }
);

// Ensure only one default wishlist per customer
WishlistSchema.index(
  { customer: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true, customer: { $exists: true } }
  }
);

// Pre-validate hook - Ensure user or customer is present
WishlistSchema.pre('validate', function(next) {
  const doc = this as any;
  if (!doc.user && !doc.customer) {
    next(new Error('Wishlist must have either user or customer'));
  } else {
    next();
  }
});

// Virtual for total value (requires population)
WishlistSchema.virtual('totalValue').get(function() {
  if (!this.populated('items.product')) {
    return 0;
  }
  
  return this.items.reduce((total, item) => {
    const product = item.product as any;
    return total + (product.price || 0);
  }, 0);
});

// Methods
WishlistSchema.methods.addItem = async function(
  productId: string, 
  variantId?: string, 
  notes?: string, 
  priority: number = 3
): Promise<void> {
  // Check if item already exists
  const existingIndex = this.items.findIndex((item: IWishlistItem) => 
    item.product.toString() === productId && 
    item.variant === variantId
  );
  
  if (existingIndex !== -1) {
    // Update existing item
    this.items[existingIndex].notes = notes || this.items[existingIndex].notes;
    this.items[existingIndex].priority = priority;
  } else {
    // Add new item
    this.items.push({
      product: new mongoose.Types.ObjectId(productId),
      variant: variantId,
      addedAt: new Date(),
      notes,
      priority
    } as IWishlistItem);
  }
  
  await this.updateItemCount();
};

WishlistSchema.methods.removeItem = async function(
  productId: string, 
  variantId?: string
): Promise<void> {
  this.items = this.items.filter((item: IWishlistItem) =>
    !(item.product.toString() === productId && item.variant === variantId)
  );
  
  await this.updateItemCount();
};

WishlistSchema.methods.hasItem = function(
  productId: string, 
  variantId?: string
): boolean {
  return this.items.some((item: IWishlistItem) =>
    item.product.toString() === productId && item.variant === variantId
  );
};

WishlistSchema.methods.generateShareToken = function(): string {
  const token = Math.random().toString(36).substring(2, 15) + 
                Math.random().toString(36).substring(2, 15);
  
  this.sharing = {
    token,
    isPublic: false,
    sharedWith: [],
    sharedAt: new Date(),
    viewCount: 0
  };
  
  return token;
};

WishlistSchema.methods.updateItemCount = async function(): Promise<void> {
  this.itemCount = this.items.length;
  await this.save();
  
  // Update user's total wishlist items count
  try {
    const User = mongoose.model('User');
    const totalItems = await this.constructor.aggregate([
      { $match: { user: this.user } },
      { $group: { _id: null, total: { $sum: '$itemCount' } } }
    ]);
    
    const count = totalItems.length > 0 ? totalItems[0].total : 0;
    await User.findByIdAndUpdate(this.user, { 
      'preferences.wishlistItemsCount': count 
    });
  } catch (error) {
    console.error('Error updating user wishlist count:', error);
  }
};

// Pre-save hooks
WishlistSchema.pre('save', async function(next) {
  // Ensure user has only one default wishlist
  if (this.isDefault && this.isModified('isDefault')) {
    await (this.constructor as any).updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }

  // Update item count if items changed
  if (this.isModified('items')) {
    this.itemCount = this.items.length;
  }

  next();
});

// Post-save hook to update product analytics
WishlistSchema.post('save', async function() {
  if (this.isModified('items')) {
    try {
      // Update favorite count for affected products
      const Product = mongoose.model('Product');

      for (const item of this.items) {
        const count = await (this.constructor as any).countDocuments({
          'items.product': item.product
        });

        await Product.findByIdAndUpdate(item.product, {
          'analytics.favoriteCount': count
        });
      }
    } catch (error) {
      console.error('Error updating product favorite counts:', error);
    }
  }
});

export default mongoose.model<IWishlist>('Wishlist', WishlistSchema);