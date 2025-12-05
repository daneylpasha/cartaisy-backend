import mongoose, { Document, Schema } from 'mongoose';

/**
 * Section type enum for home layout
 */
export type SectionType =
  | 'carousel'
  | 'promo_banners'
  | 'callout_banners'
  | 'category_grid'
  | 'collection_displays'
  | 'collection_showcases'
  | 'category_collection_grid';

/**
 * Home layout section interface
 */
export interface IHomeLayoutSection {
  type: SectionType;
  position: number;
  isVisible: boolean;
}

/**
 * Home layout document interface
 */
export interface IHomeLayout extends Document {
  storeId: string;
  sections: IHomeLayoutSection[];
  createdAt: Date;
  updatedAt: Date;
}

const HomeLayoutSectionSchema: Schema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'carousel',
        'promo_banners',
        'callout_banners',
        'category_grid',
        'collection_displays',
        'collection_showcases',
        'category_collection_grid',
      ],
      required: true,
    },
    position: {
      type: Number,
      required: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const HomeLayoutSchema: Schema = new Schema(
  {
    storeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sections: [HomeLayoutSectionSchema],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index for efficient lookups
HomeLayoutSchema.index({ storeId: 1 });

export default mongoose.model<IHomeLayout>('HomeLayout', HomeLayoutSchema);

/**
 * Default sections order (fallback when no layout exists)
 */
export const DEFAULT_HOME_SECTIONS: IHomeLayoutSection[] = [
  { type: 'carousel', position: 0, isVisible: true },
  { type: 'promo_banners', position: 1, isVisible: true },
  { type: 'callout_banners', position: 2, isVisible: true },
  { type: 'category_grid', position: 3, isVisible: true },
  { type: 'collection_displays', position: 4, isVisible: true },
  { type: 'collection_showcases', position: 5, isVisible: true },
  { type: 'category_collection_grid', position: 6, isVisible: true },
];
