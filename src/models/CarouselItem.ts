import mongoose, { Document, Schema } from 'mongoose';

// PromoTag for carousel items
interface IPromoTag {
  text?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface ICarouselItem extends Document {
  storeId: string;
  imageUrl: string;
  label: string;
  title: string;
  subtitle: string;
  ctaText: string;
  collectionId: string;
  endsAt?: Date;
  promoTag?: IPromoTag;
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PromoTagSchema: Schema = new Schema({
  text: {
    type: String,
    trim: true
  },
  imageUrl: {
    type: String,
    trim: true
  },
  backgroundColor: {
    type: String,
    trim: true
  },
  textColor: {
    type: String,
    trim: true
  }
}, { _id: false });

const CarouselItemSchema: Schema = new Schema(
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
    subtitle: {
      type: String,
      required: true,
      trim: true
    },
    ctaText: {
      type: String,
      required: true,
      trim: true,
      default: 'Shop Now'
    },
    collectionId: {
      type: String,
      required: true,
      trim: true
    },
    endsAt: {
      type: Date,
      required: false
    },
    promoTag: {
      type: PromoTagSchema,
      required: false
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

CarouselItemSchema.index({ storeId: 1, position: 1 });
CarouselItemSchema.index({ storeId: 1, isActive: 1 });
CarouselItemSchema.index({ storeId: 1, collectionId: 1 });

export default mongoose.model<ICarouselItem>('CarouselItem', CarouselItemSchema);