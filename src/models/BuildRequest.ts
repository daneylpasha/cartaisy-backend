import mongoose, { Schema, Document } from 'mongoose';

/**
 * Tracked "Build my app" request (issue #155).
 *
 * v1 records the merchant request and per-platform status. It does not start
 * an EAS build. Android and iOS move independently: Android may be `ready`
 * while iOS is `waiting_on_merchant`.
 */

export const BUILD_PLATFORM_STATUSES = [
  'not_requested',
  'waiting_on_merchant',
  'queued',
  'building',
  'ready',
  'failed',
] as const;

export type BuildPlatformStatus = (typeof BUILD_PLATFORM_STATUSES)[number];

export interface IBuildPlatformState {
  status: BuildPlatformStatus;
  updatedAt: Date;
}

export interface IBuildRequestChecklist {
  accessNotes?: string;
}

export interface IBuildRequest extends Document {
  storeId: mongoose.Types.ObjectId;
  requestedBy: mongoose.Types.ObjectId;
  platforms: {
    android: IBuildPlatformState;
    ios: IBuildPlatformState;
  };
  checklist: IBuildRequestChecklist;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformStateSchema = new Schema<IBuildPlatformState>(
  {
    status: {
      type: String,
      enum: BUILD_PLATFORM_STATUSES,
      required: true,
    },
    updatedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const ChecklistSchema = new Schema<IBuildRequestChecklist>(
  {
    accessNotes: {
      type: String,
      trim: true,
      maxlength: 280,
    },
  },
  { _id: false }
);

const BuildRequestSchema = new Schema<IBuildRequest>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platforms: {
      android: {
        type: PlatformStateSchema,
        required: true,
      },
      ios: {
        type: PlatformStateSchema,
        required: true,
      },
    },
    checklist: {
      type: ChecklistSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

BuildRequestSchema.index({ storeId: 1, createdAt: -1 });
// Platform ops list every store, newest first (issue #164).
BuildRequestSchema.index({ createdAt: -1, _id: -1 });

export default mongoose.model<IBuildRequest>('BuildRequest', BuildRequestSchema);
