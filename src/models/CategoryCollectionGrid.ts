import mongoose, { Document, Schema } from 'mongoose';

// Individual collection item within the category collection grid
interface ICollectionItem {
  image: string;
  title: string;
  collectionId: number;
}

export interface ICategoryCollectionGrid extends Document {
  title: string;
  subtitle: string;
  collections: ICollectionItem[];
  position: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionItemSchema: Schema = new Schema({
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
    type: Number,
    required: true
  }
}, { _id: false });

const CategoryCollectionGridSchema: Schema = new Schema(
  {
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
    collections: {
      type: [CollectionItemSchema],
      required: true,
      validate: {
        validator: function(v: ICollectionItem[]) {
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

CategoryCollectionGridSchema.index({ position: 1 });
CategoryCollectionGridSchema.index({ isActive: 1 });

export default mongoose.model<ICategoryCollectionGrid>('CategoryCollectionGrid', CategoryCollectionGridSchema);