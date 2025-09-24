import mongoose, { Document, Schema } from 'mongoose';

export interface ICarouselItem extends Document {
  imageUrl: string;
  label: string;
  title: string;
  subTitle: string;
  buttonText: string;
  collectionId: number;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CarouselItemSchema: Schema = new Schema(
  {
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    subTitle: {
      type: String,
      required: true,
      trim: true
    },
    buttonText: {
      type: String,
      required: true,
      trim: true,
      default: 'Shop Now'
    },
    collectionId: {
      type: Number,
      required: true
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

CarouselItemSchema.index({ position: 1 });
CarouselItemSchema.index({ isActive: 1 });
CarouselItemSchema.index({ collectionId: 1 });

export default mongoose.model<ICarouselItem>('CarouselItem', CarouselItemSchema);