import mongoose, { Document, Schema } from 'mongoose';

// Individual collection item within the showcase
interface IShowcaseCollectionItem {
  image: string;
  title: string;
  collectionId: string;
}

export interface ICollectionShowcase extends Document {
  type: 'grid' | 'circular';  // Different UI layouts
  title: string;
  icon?: string;  // Optional icon for the showcase section
  collections: IShowcaseCollectionItem[];
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ShowcaseCollectionItemSchema: Schema = new Schema({
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
  collectionId: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const CollectionShowcaseSchema: Schema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['grid', 'circular'],
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    icon: {
      type: String,
      trim: true,
      required: false
    },
    collections: {
      type: [ShowcaseCollectionItemSchema],
      required: true,
      validate: {
        validator: function(v: IShowcaseCollectionItem[]) {
          return v && v.length > 0;
        },
        message: 'At least one collection is required'
      }
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

CollectionShowcaseSchema.index({ position: 1 });
CollectionShowcaseSchema.index({ isActive: 1 });
CollectionShowcaseSchema.index({ type: 1, isActive: 1 });

export default mongoose.model<ICollectionShowcase>('CollectionShowcase', CollectionShowcaseSchema);