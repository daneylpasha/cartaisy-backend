import Customer from '../models/Customer';

/**
 * Customer segment definition
 */
export interface CustomerSegment {
  id: string;
  name: string;
  description: string;
  estimatedCount?: number;
}

/**
 * Available segments for customer targeting
 */
export const AVAILABLE_SEGMENTS: CustomerSegment[] = [
  {
    id: 'all',
    name: 'All Customers',
    description: 'All customers with active devices',
  },
  {
    id: 'inactive_30_days',
    name: 'Inactive (30+ days)',
    description: 'Customers who haven\'t ordered in 30+ days',
  },
  {
    id: 'active_7_days',
    name: 'Active (last 7 days)',
    description: 'Customers who ordered in the last 7 days',
  },
  {
    id: 'first_time_buyers',
    name: 'First-time Buyers',
    description: 'Customers with only 1 order',
  },
  {
    id: 'repeat_customers',
    name: 'Repeat Customers',
    description: 'Customers with 2+ orders',
  },
  {
    id: 'high_value',
    name: 'High Value',
    description: 'Customers who have spent $100+',
  },
  {
    id: 'ios_only',
    name: 'iOS Users',
    description: 'Customers using iOS devices',
  },
  {
    id: 'android_only',
    name: 'Android Users',
    description: 'Customers using Android devices',
  },
];

/**
 * Segmentation Service
 * Provides methods to query customers based on segments
 */
export class SegmentationService {
  /**
   * Get MongoDB query for a specific segment
   */
  static getSegmentQuery(
    storeId: string,
    segmentId: string
  ): Record<string, any> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Base query - all customers must have active devices
    const baseQuery = {
      storeId,
      'deviceTokens.active': true,
    };

    switch (segmentId) {
      case 'all':
        return baseQuery;

      case 'inactive_30_days':
        return {
          ...baseQuery,
          $or: [
            { lastOrderDate: { $lt: thirtyDaysAgo } },
            { lastOrderDate: { $exists: false } },
          ],
        };

      case 'active_7_days':
        return {
          ...baseQuery,
          lastOrderDate: { $gte: sevenDaysAgo },
        };

      case 'first_time_buyers':
        return {
          ...baseQuery,
          orderCount: 1,
        };

      case 'repeat_customers':
        return {
          ...baseQuery,
          orderCount: { $gte: 2 },
        };

      case 'high_value':
        return {
          ...baseQuery,
          totalSpent: { $gte: 100 },
        };

      case 'ios_only':
        return {
          ...baseQuery,
          'deviceTokens.platform': 'ios',
          'deviceTokens.active': true,
        };

      case 'android_only':
        return {
          ...baseQuery,
          'deviceTokens.platform': 'android',
          'deviceTokens.active': true,
        };

      default:
        return baseQuery;
    }
  }

  /**
   * Get device tokens for customers in a segment
   */
  static async getSegmentDeviceTokens(
    storeId: string,
    segmentId: string
  ): Promise<string[]> {
    const query = this.getSegmentQuery(storeId, segmentId);

    const customers = await Customer.find(query).select('deviceTokens').lean();

    const deviceTokens: string[] = [];

    customers.forEach((customer: any) => {
      customer.deviceTokens
        .filter((dt: any) => {
          // For platform-specific segments, filter tokens
          if (segmentId === 'ios_only') {
            return dt.active && dt.platform === 'ios';
          }
          if (segmentId === 'android_only') {
            return dt.active && dt.platform === 'android';
          }
          return dt.active;
        })
        .forEach((dt: any) => {
          deviceTokens.push(dt.token);
        });
    });

    return deviceTokens;
  }

  /**
   * Get customer count for a segment
   */
  static async getSegmentCount(
    storeId: string,
    segmentId: string
  ): Promise<number> {
    const query = this.getSegmentQuery(storeId, segmentId);
    return Customer.countDocuments(query);
  }

  /**
   * Get all available segments with counts for a store
   */
  static async getAvailableSegmentsWithCounts(
    storeId: string
  ): Promise<CustomerSegment[]> {
    const segmentsWithCounts = await Promise.all(
      AVAILABLE_SEGMENTS.map(async (segment) => {
        const count = await this.getSegmentCount(storeId, segment.id);
        return {
          ...segment,
          estimatedCount: count,
        };
      })
    );

    return segmentsWithCounts;
  }

  /**
   * Validate if a segment ID is valid
   */
  static isValidSegment(segmentId: string): boolean {
    return AVAILABLE_SEGMENTS.some((segment) => segment.id === segmentId);
  }
}
