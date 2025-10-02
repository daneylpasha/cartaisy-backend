import mongoose, { Document, Schema } from 'mongoose';

export interface IFavorite extends Document {
  userId: mongoose.Types.ObjectId;
  productId: string;  // Shopify product ID
  createdAt: Date;
  updatedAt: Date;
}

const FavoriteSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
FavoriteSchema.index({ userId: 1, productId: 1 }, { unique: true });

// Index for efficient queries
FavoriteSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IFavorite>('Favorite', FavoriteSchema);
