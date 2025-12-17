import mongoose, { Document, Schema } from 'mongoose';

export interface IImage {
  publicId: string;          // Cloudinary public_id
  url: string;               // Full Cloudinary URL
  secureUrl: string;         // HTTPS URL
  size: number;              // bytes
  width?: number;
  height?: number;
  format?: string;
  usedIn: 'template' | 'notification' | 'unused';
  referenceId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface IImageUsage extends Document {
  storeId: mongoose.Types.ObjectId;
  imageCount: number;
  totalSize: number;         // Total bytes used
  images: IImage[];
  tier: 'free' | 'pro' | 'enterprise';
  limit: number;             // Max images allowed
  createdAt: Date;
  updatedAt: Date;
}

const ImageSchema = new Schema<IImage>({
  publicId: { type: String, required: true },
  url: { type: String, required: true },
  secureUrl: { type: String, required: true },
  size: { type: Number, required: true },
  width: { type: Number },
  height: { type: Number },
  format: { type: String },
  usedIn: {
    type: String,
    enum: ['template', 'notification', 'unused'],
    default: 'unused'
  },
  referenceId: { type: Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const ImageUsageSchema = new Schema<IImageUsage>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      unique: true,
      index: true
    },
    imageCount: { type: Number, default: 0 },
    totalSize: { type: Number, default: 0 },
    images: [ImageSchema],
    tier: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free'
    },
    limit: { type: Number, default: 50 }  // Free tier default
  },
  { timestamps: true }
);

// Index for finding unused/old images
ImageUsageSchema.index({ 'images.usedIn': 1, 'images.createdAt': 1 });

export const ImageUsage = mongoose.model<IImageUsage>('ImageUsage', ImageUsageSchema);

// Tier limits
export const IMAGE_LIMITS = {
  free: 50,
  pro: 200,
  enterprise: Infinity
};
