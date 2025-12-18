import mongoose, { Document, Schema } from 'mongoose';

/**
 * App Session Model
 *
 * Tracks individual app sessions for DAU/MAU analytics.
 * Sessions are created on app_open and updated on app_close/backgrounded.
 */

export type AppPlatform = 'ios' | 'android';
export type SessionEvent = 'app_open' | 'app_close' | 'app_backgrounded';

export interface IAppSession extends Document {
  storeId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId; // Nullable for guest users
  deviceId: string;
  sessionId: string;
  startedAt: Date;
  endedAt?: Date;
  duration?: number; // Seconds
  platform: AppPlatform;
  appVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const appSessionSchema = new Schema<IAppSession>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number, // Seconds
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
      required: true,
    },
    appVersion: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for analytics queries
appSessionSchema.index({ storeId: 1, startedAt: -1 });
appSessionSchema.index({ storeId: 1, customerId: 1, startedAt: -1 });
appSessionSchema.index({ storeId: 1, deviceId: 1, startedAt: -1 });
appSessionSchema.index({ deviceId: 1, startedAt: -1 }); // For rate limiting

// TTL index - auto-delete sessions after 90 days
appSessionSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 } // 90 days
);

/**
 * Check if a device can create a new session (rate limiting)
 * Only allows 1 app_open per device per 5 minutes
 */
appSessionSchema.statics.canCreateSession = async function (
  deviceId: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const recentSession = await this.findOne({
    deviceId,
    startedAt: { $gte: fiveMinutesAgo },
  }).sort({ startedAt: -1 });

  if (recentSession) {
    const retryAfter = Math.ceil(
      (recentSession.startedAt.getTime() + 5 * 60 * 1000 - Date.now()) / 1000
    );
    return {
      allowed: false,
      retryAfter: Math.max(0, retryAfter),
    };
  }

  return { allowed: true };
};

/**
 * Get active sessions count for a store in a time range
 */
appSessionSchema.statics.getActiveUsersCount = async function (
  storeId: mongoose.Types.ObjectId | string,
  startDate: Date,
  endDate: Date
): Promise<{ uniqueCustomers: number; uniqueDevices: number; totalSessions: number }> {
  const result = await this.aggregate([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        startedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        uniqueCustomers: { $addToSet: '$customerId' },
        uniqueDevices: { $addToSet: '$deviceId' },
        totalSessions: { $sum: 1 },
      },
    },
    {
      $project: {
        uniqueCustomers: {
          $size: {
            $filter: {
              input: '$uniqueCustomers',
              cond: { $ne: ['$$this', null] },
            },
          },
        },
        uniqueDevices: { $size: '$uniqueDevices' },
        totalSessions: 1,
      },
    },
  ]);

  if (result.length === 0) {
    return { uniqueCustomers: 0, uniqueDevices: 0, totalSessions: 0 };
  }

  return result[0];
};

// Interface for static methods
export interface IAppSessionModel extends mongoose.Model<IAppSession> {
  canCreateSession(deviceId: string): Promise<{ allowed: boolean; retryAfter?: number }>;
  getActiveUsersCount(
    storeId: mongoose.Types.ObjectId | string,
    startDate: Date,
    endDate: Date
  ): Promise<{ uniqueCustomers: number; uniqueDevices: number; totalSessions: number }>;
}

const AppSession = mongoose.model<IAppSession, IAppSessionModel>(
  'AppSession',
  appSessionSchema
);

export default AppSession;
