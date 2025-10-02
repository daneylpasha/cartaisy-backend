import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryGrid extends Document {
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

CategoryGridSchema.index({ position: 1 });
CategoryGridSchema.index({ isActive: 1 });
CategoryGridSchema.index({ collectionId: 1 });

export default mongoose.model<ICategoryGrid>('CategoryGrid', CategoryGridSchema);