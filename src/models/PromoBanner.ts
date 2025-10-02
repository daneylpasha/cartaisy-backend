import mongoose, { Document, Schema } from 'mongoose';

export interface IPromoBanner extends Document {
  image: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  position: number;
  isActive: boolean;
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PromoBannerSchema: Schema = new Schema(
  {
    image: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    subtitle: {
      type: String,
      required: true,
      trim: true
    },
    ctaText: {
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
    },
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    textColor: {
      type: String,
      default: '#000000'
    },
    buttonColor: {
      type: String,
      default: '#007bff'
    }
  },
  {
    timestamps: true
  }
);

PromoBannerSchema.index({ position: 1 });
PromoBannerSchema.index({ isActive: 1 });
PromoBannerSchema.index({ collectionId: 1 });

export default mongoose.model<IPromoBanner>('PromoBanner', PromoBannerSchema);