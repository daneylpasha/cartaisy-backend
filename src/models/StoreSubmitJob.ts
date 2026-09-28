import mongoose, { Schema, Document } from 'mongoose';

/**
 * One EAS Submit attempt for a store's finished build (issue #187).
 *
 * The store id always comes from auth. This document stores status only.
 * Apple keys, Google service-account JSON, and the Expo robot token are
 * never written here.
 */

export const STORE_SUBMIT_STATUSES = ['queued', 'submitting', 'submitted', 'failed'] as const;
export type StoreSubmitStatus = (typeof STORE_SUBMIT_STATUSES)[number];

export const STORE_SUBMIT_PLATFORMS = ['android', 'ios'] as const;
export type StoreSubmitPlatform = (typeof STORE_SUBMIT_PLATFORMS)[number];

export interface IStoreSubmitJob extends Document {
  storeId: mongoose.Types.ObjectId;
  buildRequestId: mongoose.Types.ObjectId;
  platform: StoreSubmitPlatform;
  status: StoreSubmitStatus;
  /** Merchant-safe fixed copy. Never an Expo error body or a credential. */
  message?: string;
  /** EAS submission id. Server-only. Not an API field. */
  easSubmissionId?: string;
  /** EAS build id this attempt targeted. Server-only. */
  easBuildId: string;
  requestedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StoreSubmitJobSchema = new Schema<IStoreSubmitJob>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },
    buildRequestId: {
      type: Schema.Types.ObjectId,
      ref: 'BuildRequest',
      required: true,
    },
    platform: {
      type: String,
      enum: STORE_SUBMIT_PLATFORMS,
      required: true,
    },
    status: {
      type: String,
      enum: STORE_SUBMIT_STATUSES,
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    easSubmissionId: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    easBuildId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

StoreSubmitJobSchema.index({ storeId: 1, buildRequestId: 1, platform: 1, createdAt: -1 });
StoreSubmitJobSchema.index({ status: 1, updatedAt: 1 });
// One in-flight attempt per store, build request, and platform.
StoreSubmitJobSchema.index(
  { storeId: 1, buildRequestId: 1, platform: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['queued', 'submitting'] } },
    name: 'uniq_inflight_store_submit',
  }
);

export default mongoose.model<IStoreSubmitJob>('StoreSubmitJob', StoreSubmitJobSchema);
