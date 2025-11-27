import mongoose, { Document, Schema } from 'mongoose';

// Action types for callout banners
interface ICalloutAction {
  type: 'collection' | 'navigation';
  collectionId?: string;
  navigateTo?: string;
}

export interface ICalloutBanner extends Document {
  storeId: string;
  imageUrl: string;
  title: string;
  subTitle: string;
  buttonText: string;
  action: ICalloutAction;
  collectionId?: number; // Collection ID for linking banners to collections
  position: number;
  isActive: boolean;
  backgroundColor?: string;
  textColor?: string;
  buttonColor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CalloutActionSchema: Schema = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['collection', 'navigation']
  },
  collectionId: {
    type: String,
    trim: true,
    required: function(this: ICalloutAction) { return this.type === 'collection'; }
  },
  navigateTo: {
    type: String,
    trim: true,
    required: function(this: ICalloutAction) { return this.type === 'navigation'; }
  }
}, { _id: false });

const CalloutBannerSchema: Schema = new Schema(
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
    subTitle: {
      type: String,
      required: true,
      trim: true
    },
    buttonText: {
      type: String,
      required: true,
      trim: true
    },
    action: {
      type: CalloutActionSchema,
      required: true
    },
    collectionId: {
      type: Number,
      default: null
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

CalloutBannerSchema.index({ storeId: 1, position: 1 });
CalloutBannerSchema.index({ storeId: 1, isActive: 1 });
CalloutBannerSchema.index({ storeId: 1, 'action.type': 1 });

export default mongoose.model<ICalloutBanner>('CalloutBanner', CalloutBannerSchema);