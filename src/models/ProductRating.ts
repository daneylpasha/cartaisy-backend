import mongoose, { Document, Schema } from 'mongoose';

export interface IProductRating extends Document {
  productId: string;  // Shopify product ID
  averageRating: number;  // Average rating out of 5
  reviewsCount: number;  // Total number of reviews
  ratings: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
  lastUpdated: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductRatingSchema: Schema = new Schema(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    averageRating: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 5
    },
    reviewsCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    ratings: {
      five: { type: Number, default: 0, min: 0 },
      four: { type: Number, default: 0, min: 0 },
      three: { type: Number, default: 0, min: 0 },
      two: { type: Number, default: 0, min: 0 },
      one: { type: Number, default: 0, min: 0 }
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

ProductRatingSchema.index({ productId: 1 });
ProductRatingSchema.index({ averageRating: -1 });

export default mongoose.model<IProductRating>('ProductRating', ProductRatingSchema);
