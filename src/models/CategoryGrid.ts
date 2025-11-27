import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryGrid extends Document {
  storeId: string;
  imageUrl: string;
  title: string;
  collectionId: string;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategoryGridSchema: Schema = new Schema(
  {
    storeId: {
      type: String,
      required: true,
      index: true
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    collectionId: {
      type: String,
      required: true,
      trim: true
    },
    position: {
      type: Number,
      required: true,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

CategoryGridSchema.index({ storeId: 1, position: 1 });
CategoryGridSchema.index({ storeId: 1, isActive: 1 });
CategoryGridSchema.index({ storeId: 1, collectionId: 1 });

export default mongoose.model<ICategoryGrid>('CategoryGrid', CategoryGridSchema);