import mongoose, { Schema, Document } from 'mongoose';

/**
 * Tracked "Build my app" request (issue #155, EAS trigger in #182).
 *
 * Android and iOS move independently: Android may be `ready` while iOS is
 * `waiting_on_merchant`. When Cartaisy Expo credentials are configured, a
 * create also starts one EAS workflow run per requested platform. `eas` is
 * server-only and must not be returned to clients.
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

export interface IBuildPlatformEas {
  /** EAS Workflow run id. Server-only. */
  workflowRunId?: string;
  /** EAS Build id once the workflow reports one. Server-only. */
  buildId?: string;
  startedAt?: Date;
}

export interface IBuildPlatformState {
  status: BuildPlatformStatus;
  updatedAt: Date;
  /** Expo/EAS install handoff. Absent until automation or platform ops set it. `ready` does not require it. */
  installUrl?: string | null;
  /** Merchant-safe automation note. Omitted from API responses when empty. */
  message?: string | null;
  eas?: IBuildPlatformEas;
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
    installUrl: {
      type: String,
      trim: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    eas: {
      type: new Schema<IBuildPlatformEas>(
        {
          workflowRunId: { type: String, trim: true },
          buildId: { type: String, trim: true },
          startedAt: { type: Date },
        },
        { _id: false }
      ),
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
// In-flight EAS polls. workflowRunId is absent until a run is accepted.
BuildRequestSchema.index({
  'platforms.android.status': 1,
  'platforms.android.eas.workflowRunId': 1,
});
BuildRequestSchema.index({
  'platforms.ios.status': 1,
  'platforms.ios.eas.workflowRunId': 1,
});

export default mongoose.model<IBuildRequest>('BuildRequest', BuildRequestSchema);
