import mongoose, { Document, Schema } from 'mongoose';

export interface IFavorite extends Document {
  userId?: mongoose.Types.ObjectId;  // For dashboard users
  customerId?: mongoose.Types.ObjectId;  // For mobile app customers
  productId: string;  // Shopify product ID
  createdAt: Date;
  updatedAt: Date;
}

const FavoriteSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,  // Made optional - either userId or customerId must be present
      index: true
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: false,  // Either userId or customerId must be present
      index: true
    },
    productId: {
      type: String,
      required: true,
      trim: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index to ensure a user can't favorite the same product twice
FavoriteSchema.index({ userId: 1, productId: 1 }, { unique: true, sparse: true });

// Compound index to ensure a customer can't favorite the same product twice
FavoriteSchema.index({ customerId: 1, productId: 1 }, { unique: true, sparse: true });

// Index for efficient queries
FavoriteSchema.index({ userId: 1, createdAt: -1 });
FavoriteSchema.index({ customerId: 1, createdAt: -1 });  // Index for customer favorites

// Pre-validate hook - Ensure userId or customerId is present
FavoriteSchema.pre('validate', function(next) {
  const doc = this as any;
  if (!doc.userId && !doc.customerId) {
    next(new Error('Favorite must have either userId or customerId'));
  } else {
    next();
  }
});

export default mongoose.model<IFavorite>('Favorite', FavoriteSchema);
