import mongoose from 'mongoose';
import AppSession, { IAppSession, SessionEvent, AppPlatform } from '../models/AppSession';
import DailyAppMetrics, { IDailyAppMetrics } from '../models/DailyAppMetrics';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session Tracking Service
 *
 * Handles app session tracking and DAU/MAU metrics aggregation.
 * Separate from appAnalyticsService which handles event-based analytics.
 */

export interface SessionEventData {
  event: SessionEvent;
  deviceId: string;
  timestamp: string; // ISO string
  sessionId?: string;
  platform: AppPlatform;
  appVersion: string;
}

export interface SessionResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  retryAfter?: number;
}

export interface AppEngagementSummary {
  dau: number;
  dauChange: number; // Percentage change vs yesterday
  mau: number;
  mauChange: number; // Percentage change vs previous 30 days
  avgSessionDuration: number;
  totalSessions: number;
}

export interface DailyMetric {
  date: string;
  activeUsers: number;
  activeDevices: number;
  sessions: number;
  avgSessionDuration: number;
  newUsers: number;
  platform: {
    ios: number;
    android: number;
  };
}

export interface AppEngagementResponse {
  summary: AppEngagementSummary;
  daily: DailyMetric[];
}

/**
 * Record a session event (app_open, app_close, app_backgrounded)
 */
export async function recordSessionEvent(
  storeId: string,
  customerId: string | undefined,
  data: SessionEventData
): Promise<SessionResult> {
  try {
    const { event, deviceId, timestamp, sessionId, platform, appVersion } = data;
    const eventTime = new Date(timestamp);

    if (event === 'app_open') {
      // Check rate limit
      const canCreate = await AppSession.canCreateSession(deviceId);
      if (!canCreate.allowed) {
        return {
          success: false,
          error: 'Rate limit exceeded. Too many app_open events.',
          retryAfter: canCreate.retryAfter,
        };
      }

      // Create new session
      const newSessionId = sessionId || uuidv4();
      const session = new AppSession({
        storeId: new mongoose.Types.ObjectId(storeId),
        customerId: customerId ? new mongoose.Types.ObjectId(customerId) : undefined,
        deviceId,
        sessionId: newSessionId,
        startedAt: eventTime,
        platform,
        appVersion,
      });

      await session.save();

      return {
        success: true,
        sessionId: newSessionId,
      };
    } else if (event === 'app_close' || event === 'app_backgrounded') {
      // Update existing session with end time
      if (!sessionId) {
        return {
          success: false,
          error: 'sessionId is required for app_close/app_backgrounded events',
        };
      }

      const session = await AppSession.findOne({ sessionId });
      if (!session) {
        return {
          success: false,
          error: 'Session not found',
        };
      }

      session.endedAt = eventTime;
      session.duration = Math.round((eventTime.getTime() - session.startedAt.getTime()) / 1000);

      // Update customerId if it was a guest session that later authenticated
      if (customerId && !session.customerId) {
        session.customerId = new mongoose.Types.ObjectId(customerId);
      }

      await session.save();

      return {
        success: true,
        sessionId: session.sessionId,
      };
    }

    return {
      success: false,
      error: 'Invalid event type',
    };
  } catch (error: any) {
    console.error('Error recording session event:', error);
    return {
      success: false,
      error: error.message || 'Failed to record session event',
    };
  }
}

/**
 * Aggregate daily active users for a specific store and date
 * Called by the nightly job
 */
export async function aggregateDailyActiveUsers(
  storeId: string,
  date: Date
): Promise<IDailyAppMetrics | null> {
  try {
    // Normalize date to start of day (00:00:00)
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all sessions for this day
    const sessionsAgg = await AppSession.aggregate([
      {
        $match: {
          storeId: new mongoose.Types.ObjectId(storeId),
          startedAt: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      {
        $group: {
          _id: null,
          uniqueCustomers: { $addToSet: '$customerId' },
          uniqueDevices: { $addToSet: '$deviceId' },
          totalSessions: { $sum: 1 },
          totalDuration: {
            $sum: { $ifNull: ['$duration', 0] },
          },
          sessionsWithDuration: {
            $sum: { $cond: [{ $gt: ['$duration', 0] }, 1, 0] },
          },
          iosSessions: {
            $sum: { $cond: [{ $eq: ['$platform', 'ios'] }, 1, 0] },
          },
          androidSessions: {
            $sum: { $cond: [{ $eq: ['$platform', 'android'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          uniqueCustomers: {
            $filter: {
              input: '$uniqueCustomers',
              cond: { $ne: ['$$this', null] },
            },
          },
          uniqueDevices: 1,
          totalSessions: 1,
          totalDuration: 1,
          sessionsWithDuration: 1,
          iosSessions: 1,
          androidSessions: 1,
        },
      },
    ]);

    if (sessionsAgg.length === 0) {
      // No sessions for this day - create empty record
      const emptyMetrics = await DailyAppMetrics.findOneAndUpdate(
        {
          storeId: new mongoose.Types.ObjectId(storeId),
          date: startOfDay,
        },
        {
          $set: {
            activeUsers: 0,
            activeDevices: 0,
            totalSessions: 0,
            avgSessionDuration: 0,
            newUsers: 0,
            returningUsers: 0,
            platform: { ios: 0, android: 0 },
          },
        },
        { upsert: true, new: true }
      );
      return emptyMetrics;
    }

    const agg = sessionsAgg[0];
    const uniqueCustomerIds = agg.uniqueCustomers || [];
    const uniqueDeviceIds = agg.uniqueDevices || [];

    // Count new users (first time ever seeing these customers)
    let newUsers = 0;
    if (uniqueCustomerIds.length > 0) {
      const existingBefore = await AppSession.distinct('customerId', {
        storeId: new mongoose.Types.ObjectId(storeId),
        customerId: { $in: uniqueCustomerIds },
        startedAt: { $lt: startOfDay },
      });

      newUsers = uniqueCustomerIds.filter(
        (id: mongoose.Types.ObjectId) =>
          id && !existingBefore.some((existing: mongoose.Types.ObjectId) =>
            existing && existing.equals(id)
          )
      ).length;
    }

    const activeUsers = uniqueCustomerIds.length;
    const returningUsers = activeUsers - newUsers;
    const avgSessionDuration =
      agg.sessionsWithDuration > 0
        ? Math.round(agg.totalDuration / agg.sessionsWithDuration)
        : 0;

    // Upsert the daily metrics
    const metrics = await DailyAppMetrics.findOneAndUpdate(
      {
        storeId: new mongoose.Types.ObjectId(storeId),
        date: startOfDay,
      },
      {
        $set: {
          activeUsers,
          activeDevices: uniqueDeviceIds.length,
          totalSessions: agg.totalSessions,
          avgSessionDuration,
          newUsers,
          returningUsers,
          platform: {
            ios: agg.iosSessions,
            android: agg.androidSessions,
          },
        },
      },
      { upsert: true, new: true }
    );

    console.log(
      `📊 [SESSION_TRACKING] Store ${storeId} - Date ${startOfDay.toISOString().split('T')[0]}: ` +
        `DAU=${activeUsers}, Devices=${uniqueDeviceIds.length}, Sessions=${agg.totalSessions}, New=${newUsers}`
    );

    return metrics;
  } catch (error: any) {
    console.error(`Error aggregating daily metrics for store ${storeId}:`, error);
    return null;
  }
}

/**
 * Get app engagement data for the admin dashboard
 */
export async function getAppEngagement(
  storeId: string,
  startDate: Date,
  endDate: Date,
  granularity: 'day' | 'week' | 'month' = 'day'
): Promise<AppEngagementResponse> {
  const storeObjectId = new mongoose.Types.ObjectId(storeId);

  // Get today's date normalized
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Calculate DAU (today's active users)
  const todayMetrics = await DailyAppMetrics.findOne({
    storeId: storeObjectId,
    date: today,
  }).lean();

  const yesterdayMetrics = await DailyAppMetrics.findOne({
    storeId: storeObjectId,
    date: yesterday,
  }).lean();

  const dau = todayMetrics?.activeUsers || 0;
  const yesterdayDau = yesterdayMetrics?.activeUsers || 0;
  const dauChange = yesterdayDau > 0 ? Math.round(((dau - yesterdayDau) / yesterdayDau) * 100) : 0;

  // Calculate MAU (last 30 days unique users)
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const currentMAU = await DailyAppMetrics.calculateMAU(storeId, today);
  const previousMAU = await DailyAppMetrics.calculateMAU(storeId, thirtyDaysAgo);

  const mau = currentMAU.mau;
  const previousMauValue = previousMAU.mau;
  const mauChange = previousMauValue > 0 ? Math.round(((mau - previousMauValue) / previousMauValue) * 100) : 0;

  // Get summary for the date range
  const summary = await DailyAppMetrics.getSummary(storeId, startDate, endDate);

  // Get daily metrics
  const dailyMetrics = await DailyAppMetrics.getMetricsForRange(storeId, startDate, endDate);

  // Transform daily metrics based on granularity
  let daily: DailyMetric[];

  if (granularity === 'day') {
    daily = dailyMetrics.map((m) => ({
      date: m.date.toISOString().split('T')[0],
      activeUsers: m.activeUsers,
      activeDevices: m.activeDevices,
      sessions: m.totalSessions,
      avgSessionDuration: m.avgSessionDuration,
      newUsers: m.newUsers,
      platform: m.platform,
    }));
  } else if (granularity === 'week') {
    daily = aggregateByPeriod(dailyMetrics, 'week');
  } else {
    daily = aggregateByPeriod(dailyMetrics, 'month');
  }

  return {
    summary: {
      dau,
      dauChange,
      mau,
      mauChange,
      avgSessionDuration: summary.avgSessionDuration,
      totalSessions: summary.totalSessions,
    },
    daily,
  };
}

/**
 * Aggregate daily metrics by week or month
 */
function aggregateByPeriod(
  metrics: IDailyAppMetrics[],
  period: 'week' | 'month'
): DailyMetric[] {
  const grouped: Map<string, IDailyAppMetrics[]> = new Map();

  for (const metric of metrics) {
    const date = new Date(metric.date);
    let key: string;

    if (period === 'week') {
      // Get the Monday of the week
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(date);
      monday.setDate(diff);
      key = monday.toISOString().split('T')[0];
    } else {
      // Get the first of the month
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(metric);
  }

  const result: DailyMetric[] = [];

  for (const [dateKey, periodMetrics] of grouped) {
    const totalSessions = periodMetrics.reduce((sum, m) => sum + m.totalSessions, 0);
    const avgActiveUsers = Math.round(
      periodMetrics.reduce((sum, m) => sum + m.activeUsers, 0) / periodMetrics.length
    );
    const avgActiveDevices = Math.round(
      periodMetrics.reduce((sum, m) => sum + m.activeDevices, 0) / periodMetrics.length
    );
    const avgSessionDuration = Math.round(
      periodMetrics.reduce((sum, m) => sum + m.avgSessionDuration, 0) / periodMetrics.length
    );
    const totalNewUsers = periodMetrics.reduce((sum, m) => sum + m.newUsers, 0);
    const iosSessions = periodMetrics.reduce((sum, m) => sum + m.platform.ios, 0);
    const androidSessions = periodMetrics.reduce((sum, m) => sum + m.platform.android, 0);

    result.push({
      date: dateKey,
      activeUsers: avgActiveUsers,
      activeDevices: avgActiveDevices,
      sessions: totalSessions,
      avgSessionDuration,
      newUsers: totalNewUsers,
      platform: {
        ios: iosSessions,
        android: androidSessions,
      },
    });
  }

  // Sort by date descending
  return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Aggregate all stores' daily metrics for a given date
 * Called by the nightly job
 */
export async function aggregateAllStoresDaily(date: Date): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Get all unique store IDs that have sessions
    const storeIds = await AppSession.distinct('storeId');

    console.log(`📊 [SESSION_TRACKING] Starting daily aggregation for ${storeIds.length} stores`);

    for (const storeId of storeIds) {
      try {
        await aggregateDailyActiveUsers(storeId.toString(), date);
        result.processed++;
      } catch (error: any) {
        result.failed++;
        result.errors.push(`Store ${storeId}: ${error.message}`);
      }
    }

    console.log(
      `📊 [SESSION_TRACKING] Daily aggregation complete: ${result.processed} processed, ${result.failed} failed`
    );

    return result;
  } catch (error: any) {
    console.error('Error in daily aggregation job:', error);
    result.errors.push(error.message);
    return result;
  }
}

/**
 * Get quick DAU/MAU stats for dashboard widget
 */
export async function getQuickStats(
  storeId: string
): Promise<{
  dau: number;
  mau: number;
  avgSessionDuration: number;
  sessionsToday: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayMetrics = await DailyAppMetrics.findOne({
    storeId: new mongoose.Types.ObjectId(storeId),
    date: today,
  }).lean();

  const mauData = await DailyAppMetrics.calculateMAU(storeId);

  return {
    dau: todayMetrics?.activeUsers || 0,
    mau: mauData.mau,
    avgSessionDuration: todayMetrics?.avgSessionDuration || 0,
    sessionsToday: todayMetrics?.totalSessions || 0,
  };
}
