import mongoose, { Document, Schema } from 'mongoose';

export interface IProductMetrics extends Document {
  productId: string;
  soldThisMonth: number;
  soldLastMonth: number;
  isBestSeller: boolean;
  lastUpdated: Date;
}

const productMetricsSchema = new Schema<IProductMetrics>(
  {
    productId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    soldThisMonth: {
      type: Number,
      default: 0,
    },
    soldLastMonth: {
      type: Number,
      default: 0,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IProductMetrics>('ProductMetrics', productMetricsSchema);
