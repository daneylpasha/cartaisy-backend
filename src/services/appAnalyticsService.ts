import AnalyticsEvent, { IAnalyticsEvent } from '../models/AnalyticsEvent';
import mongoose from 'mongoose';

/**
 * App Analytics Service
 *
 * Handles app-level analytics tracking (views, clicks, searches, engagement)
 * These are events that Shopify doesn't track
 */

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface EventData {
  eventType: IAnalyticsEvent['eventType'];
  eventData?: IAnalyticsEvent['eventData'];
  userId?: string;
  sessionId: string;
  deviceId?: string;
  platform: 'ios' | 'android' | 'web';
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  location?: IAnalyticsEvent['location'];
  duration?: number;
}

interface ProductAnalytics {
  productId: string;
  views: number;
  clicks: number;
  addToCart: number;
  wishlistAdds: number;
  conversionRate: number;
}

interface SearchAnalytics {
  query: string;
  count: number;
  avgResultsCount: number;
}

interface EngagementMetrics {
  totalSessions: number;
  uniqueUsers: number;
  avgSessionDuration: number;
  screenViews: number;
  mostViewedScreens: { screen: string; views: number }[];
}

interface AppDashboard {
  engagement: EngagementMetrics;
  topProducts: ProductAnalytics[];
  topSearches: SearchAnalytics[];
  platformBreakdown: { platform: string; count: number; percentage: number }[];
  eventCounts: { eventType: string; count: number }[];
  hourlyActivity: { hour: number; events: number }[];
}

class AppAnalyticsService {
  /**
   * Track a single event
   */
  async trackEvent(storeId: string | undefined, data: EventData): Promise<IAnalyticsEvent> {
    const event = new AnalyticsEvent({
      storeId: storeId ? new mongoose.Types.ObjectId(storeId) : undefined,
      userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
      eventType: data.eventType,
      eventData: data.eventData || {},
      platform: data.platform,
      appVersion: data.appVersion,
      osVersion: data.osVersion,
      deviceModel: data.deviceModel,
      location: data.location,
      duration: data.duration,
      timestamp: new Date(),
    });

    await event.save();
    return event;
  }

  /**
   * Track multiple events in batch
   */
  async trackEventsBatch(storeId: string | undefined, events: EventData[]): Promise<number> {
    const documents = events.map((data) => ({
      storeId: storeId ? new mongoose.Types.ObjectId(storeId) : undefined,
      userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
      eventType: data.eventType,
      eventData: data.eventData || {},
      platform: data.platform,
      appVersion: data.appVersion,
      osVersion: data.osVersion,
      deviceModel: data.deviceModel,
      location: data.location,
      duration: data.duration,
      timestamp: new Date(),
    }));

    const result = await AnalyticsEvent.insertMany(documents);
    return result.length;
  }

  /**
   * Get complete app analytics dashboard
   */
  async getAppDashboard(storeId?: string, dateRange?: DateRange): Promise<AppDashboard> {
    const range = dateRange || this.getDefaultDateRange();

    const [
      engagement,
      topProducts,
      topSearches,
      platformBreakdown,
      eventCounts,
      hourlyActivity,
    ] = await Promise.all([
      this.getEngagementMetrics(storeId, range),
      this.getTopProductsByEngagement(storeId, range, 10),
      this.getTopSearches(storeId, range, 20),
      this.getPlatformBreakdown(storeId, range),
      this.getEventCounts(storeId, range),
      this.getHourlyActivity(storeId, range),
    ]);

    return {
      engagement,
      topProducts,
      topSearches,
      platformBreakdown,
      eventCounts,
      hourlyActivity,
    };
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(storeId?: string, dateRange?: DateRange): Promise<EngagementMetrics> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    // Total sessions
    const sessionsResult = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$sessionId' } },
      { $count: 'total' },
    ]);
    const totalSessions = sessionsResult[0]?.total || 0;

    // Unique users
    const usersResult = await AnalyticsEvent.aggregate([
      { $match: { ...matchStage, userId: { $exists: true, $ne: null } } },
      { $group: { _id: '$userId' } },
      { $count: 'total' },
    ]);
    const uniqueUsers = usersResult[0]?.total || 0;

    // Average session duration (from app_open to app_close)
    const durationResult = await AnalyticsEvent.aggregate([
      { $match: { ...matchStage, eventType: { $in: ['app_open', 'app_close'] } } },
      { $sort: { sessionId: 1, timestamp: 1 } },
      {
        $group: {
          _id: '$sessionId',
          start: { $first: '$timestamp' },
          end: { $last: '$timestamp' },
        },
      },
      {
        $project: {
          duration: { $subtract: ['$end', '$start'] },
        },
      },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$duration' },
        },
      },
    ]);
    const avgSessionDuration = durationResult[0]?.avgDuration || 0;

    // Screen views
    const screenViewsResult = await AnalyticsEvent.aggregate([
      { $match: { ...matchStage, eventType: 'screen_view' } },
      { $count: 'total' },
    ]);
    const screenViews = screenViewsResult[0]?.total || 0;

    // Most viewed screens
    const topScreensResult = await AnalyticsEvent.aggregate([
      { $match: { ...matchStage, eventType: 'screen_view' } },
      {
        $group: {
          _id: '$eventData.screenName',
          views: { $sum: 1 },
        },
      },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]);

    return {
      totalSessions,
      uniqueUsers,
      avgSessionDuration: Math.round(avgSessionDuration / 1000), // convert to seconds
      screenViews,
      mostViewedScreens: topScreensResult.map((s) => ({
        screen: s._id || 'Unknown',
        views: s.views,
      })),
    };
  }

  /**
   * Get top products by engagement
   */
  async getTopProductsByEngagement(storeId?: string, dateRange?: DateRange, limit: number = 10): Promise<ProductAnalytics[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
      'eventData.productId': { $exists: true, $ne: null },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$eventData.productId',
          views: {
            $sum: { $cond: [{ $eq: ['$eventType', 'product_view'] }, 1, 0] },
          },
          clicks: {
            $sum: { $cond: [{ $eq: ['$eventType', 'product_click'] }, 1, 0] },
          },
          addToCart: {
            $sum: { $cond: [{ $eq: ['$eventType', 'add_to_cart'] }, 1, 0] },
          },
          wishlistAdds: {
            $sum: { $cond: [{ $eq: ['$eventType', 'wishlist_add'] }, 1, 0] },
          },
        },
      },
      { $sort: { views: -1 } },
      { $limit: limit },
    ]);

    return result.map((item) => ({
      productId: item._id,
      views: item.views,
      clicks: item.clicks,
      addToCart: item.addToCart,
      wishlistAdds: item.wishlistAdds,
      conversionRate: item.views > 0 ? Math.round((item.addToCart / item.views) * 100 * 100) / 100 : 0,
    }));
  }

  /**
   * Get top search queries
   */
  async getTopSearches(storeId?: string, dateRange?: DateRange, limit: number = 20): Promise<SearchAnalytics[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
      eventType: 'search',
      'eventData.searchQuery': { $exists: true, $ne: '' },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $toLower: '$eventData.searchQuery' },
          count: { $sum: 1 },
          avgResultsCount: { $avg: '$eventData.searchResultsCount' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return result.map((item) => ({
      query: item._id,
      count: item.count,
      avgResultsCount: Math.round(item.avgResultsCount || 0),
    }));
  }

  /**
   * Get platform breakdown
   */
  async getPlatformBreakdown(storeId?: string, dateRange?: DateRange): Promise<{ platform: string; count: number; percentage: number }[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$sessionId', platform: { $first: '$platform' } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]);

    const total = result.reduce((sum, item) => sum + item.count, 0);

    return result.map((item) => ({
      platform: item._id || 'unknown',
      count: item.count,
      percentage: total > 0 ? Math.round((item.count / total) * 100 * 100) / 100 : 0,
    }));
  }

  /**
   * Get event counts by type
   */
  async getEventCounts(storeId?: string, dateRange?: DateRange): Promise<{ eventType: string; count: number }[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return result.map((item) => ({
      eventType: item._id,
      count: item.count,
    }));
  }

  /**
   * Get hourly activity pattern
   */
  async getHourlyActivity(storeId?: string, dateRange?: DateRange): Promise<{ hour: number; events: number }[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await AnalyticsEvent.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          events: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Fill in missing hours with 0
    const hourlyData: { hour: number; events: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const found = result.find((r) => r._id === i);
      hourlyData.push({ hour: i, events: found?.events || 0 });
    }

    return hourlyData;
  }

  /**
   * Get funnel analysis (view → cart → checkout)
   */
  async getFunnelAnalysis(storeId?: string, dateRange?: DateRange): Promise<any> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      timestamp: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const funnelStages = ['product_view', 'add_to_cart', 'checkout_start', 'checkout_complete'];

    const results = await Promise.all(
      funnelStages.map(async (stage) => {
        const count = await AnalyticsEvent.aggregate([
          { $match: { ...matchStage, eventType: stage } },
          { $group: { _id: '$sessionId' } },
          { $count: 'sessions' },
        ]);
        return { stage, sessions: count[0]?.sessions || 0 };
      })
    );

    const viewSessions = results[0]?.sessions || 1;

    return results.map((item) => ({
      stage: item.stage,
      sessions: item.sessions,
      conversionRate: Math.round((item.sessions / viewSessions) * 100 * 100) / 100,
    }));
  }

  /**
   * Get user journey for a specific session, scoped to the store when a
   * validated store context is supplied (a merchant admin must never read
   * another store's session journey by guessing session IDs)
   */
  async getUserJourney(sessionId: string, storeId?: string): Promise<any[]> {
    const query: any = { sessionId };
    if (storeId) {
      query.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const events = await AnalyticsEvent.find(query)
      .sort({ timestamp: 1 })
      .select('eventType eventData timestamp duration')
      .lean();

    return events.map((event) => ({
      eventType: event.eventType,
      data: event.eventData,
      timestamp: event.timestamp,
      duration: event.duration,
    }));
  }

  /**
   * Default date range (last 30 days)
   */
  private getDefaultDateRange(): DateRange {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    return { startDate, endDate };
  }
}

export const appAnalyticsService = new AppAnalyticsService();
export default appAnalyticsService;
