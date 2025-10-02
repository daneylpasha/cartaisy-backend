import mongoose, { Document, Schema } from 'mongoose';

export interface ICollectionDisplay extends Document {
  type: 'large_row' | 'small_grid' | 'medium_row';
  collectionId: string;
  order: number;
  title?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionDisplaySchema: Schema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['large_row', 'small_grid', 'medium_row'],
    index: true
  },
  collectionId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  order: {
    type: Number,
    required: true,
    index: true
  },
  title: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  versionKey: false
});

CollectionDisplaySchema.index({ order: 1, isActive: 1 });
CollectionDisplaySchema.index({ type: 1, isActive: 1 });

const CollectionDisplay = mongoose.model<ICollectionDisplay>('CollectionDisplay', CollectionDisplaySchema);

export default CollectionDisplay;