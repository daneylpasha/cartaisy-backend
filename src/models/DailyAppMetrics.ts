import mongoose, { Document, Schema } from 'mongoose';

/**
 * Daily App Metrics Model
 *
 * Pre-aggregated daily metrics for DAU/MAU reporting.
 * Populated by the nightly aggregation job.
 */

export interface IPlatformBreakdown {
  ios: number;
  android: number;
}

export interface IDailyAppMetrics extends Document {
  storeId: mongoose.Types.ObjectId;
  date: Date; // Day only, no time (00:00:00)
  activeUsers: number; // Unique authenticated customerId
  activeDevices: number; // Unique deviceId (includes guests)
  totalSessions: number;
  avgSessionDuration: number; // Seconds
  newUsers: number; // First app_open ever
  returningUsers: number; // Previously seen users
  platform: IPlatformBreakdown;
  createdAt: Date;
  updatedAt: Date;
}

const dailyAppMetricsSchema = new Schema<IDailyAppMetrics>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    activeUsers: {
      type: Number,
      required: true,
      default: 0,
    },
    activeDevices: {
      type: Number,
      required: true,
      default: 0,
    },
    totalSessions: {
      type: Number,
      required: true,
      default: 0,
    },
    avgSessionDuration: {
      type: Number,
      required: true,
      default: 0,
    },
    newUsers: {
      type: Number,
      required: true,
      default: 0,
    },
    returningUsers: {
      type: Number,
      required: true,
      default: 0,
    },
    platform: {
      ios: {
        type: Number,
        default: 0,
      },
      android: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index for store + date (one record per store per day)
dailyAppMetricsSchema.index({ storeId: 1, date: 1 }, { unique: true });

// Index for date range queries
dailyAppMetricsSchema.index({ storeId: 1, date: -1 });

/**
 * Get metrics for a date range
 */
dailyAppMetricsSchema.statics.getMetricsForRange = async function (
  storeId: mongoose.Types.ObjectId | string,
  startDate: Date,
  endDate: Date
): Promise<IDailyAppMetrics[]> {
  return this.find({
    storeId: new mongoose.Types.ObjectId(storeId),
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: -1 })
    .lean();
};

/**
 * Calculate MAU (Monthly Active Users) for the last 30 days
 * This requires re-aggregating from AppSession since daily metrics
 * would double-count users active on multiple days
 */
dailyAppMetricsSchema.statics.calculateMAU = async function (
  storeId: mongoose.Types.ObjectId | string,
  endDate: Date = new Date()
): Promise<{ mau: number; mauDevices: number }> {
  const AppSession = mongoose.model('AppSession');
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 30);

  const result = await AppSession.aggregate([
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
      },
    },
    {
      $project: {
        mau: {
          $size: {
            $filter: {
              input: '$uniqueCustomers',
              cond: { $ne: ['$$this', null] },
            },
          },
        },
        mauDevices: { $size: '$uniqueDevices' },
      },
    },
  ]);

  if (result.length === 0) {
    return { mau: 0, mauDevices: 0 };
  }

  return result[0];
};

/**
 * Get summary statistics for a date range
 */
dailyAppMetricsSchema.statics.getSummary = async function (
  storeId: mongoose.Types.ObjectId | string,
  startDate: Date,
  endDate: Date
): Promise<{
  totalSessions: number;
  avgDailyActiveUsers: number;
  avgSessionDuration: number;
  totalNewUsers: number;
}> {
  const result = await this.aggregate([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: '$totalSessions' },
        avgDailyActiveUsers: { $avg: '$activeUsers' },
        avgSessionDuration: { $avg: '$avgSessionDuration' },
        totalNewUsers: { $sum: '$newUsers' },
      },
    },
  ]);

  if (result.length === 0) {
    return {
      totalSessions: 0,
      avgDailyActiveUsers: 0,
      avgSessionDuration: 0,
      totalNewUsers: 0,
    };
  }

  return {
    totalSessions: result[0].totalSessions,
    avgDailyActiveUsers: Math.round(result[0].avgDailyActiveUsers),
    avgSessionDuration: Math.round(result[0].avgSessionDuration),
    totalNewUsers: result[0].totalNewUsers,
  };
};

// Interface for static methods
export interface IDailyAppMetricsModel extends mongoose.Model<IDailyAppMetrics> {
  getMetricsForRange(
    storeId: mongoose.Types.ObjectId | string,
    startDate: Date,
    endDate: Date
  ): Promise<IDailyAppMetrics[]>;
  calculateMAU(
    storeId: mongoose.Types.ObjectId | string,
    endDate?: Date
  ): Promise<{ mau: number; mauDevices: number }>;
  getSummary(
    storeId: mongoose.Types.ObjectId | string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalSessions: number;
    avgDailyActiveUsers: number;
    avgSessionDuration: number;
    totalNewUsers: number;
  }>;
}

const DailyAppMetrics = mongoose.model<IDailyAppMetrics, IDailyAppMetricsModel>(
  'DailyAppMetrics',
  dailyAppMetricsSchema
);

export default DailyAppMetrics;
