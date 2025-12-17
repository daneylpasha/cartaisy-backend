import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Customer, { ICustomer } from '../../models/Customer';
import Order from '../../models/Order';
import AnalyticsEvent from '../../models/AnalyticsEvent';

/**
 * Customer Management Controller
 *
 * Provides admin endpoints for managing store customers:
 * - List customers with pagination, sorting, and filtering
 * - View detailed customer profiles
 * - View customer order history
 * - View customer activity/analytics events
 * - Search customers by name, email, or phone
 *
 * All endpoints enforce store isolation - admins can only see
 * customers belonging to their store.
 */

// =============================================================================
// TYPES
// =============================================================================

interface CustomerListQuery {
  limit?: string;
  offset?: string;
  sortBy?: 'createdAt' | 'lastOrderDate' | 'totalSpent' | 'orderCount';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  hasOrders?: string;
  segment?: 'all' | 'new' | 'returning' | 'high_value' | 'at_risk' | 'inactive';
}

interface CustomerListItem {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: Date;
  lastOrderDate: Date | null;
  orderCount: number;
  totalSpent: number;
  platform: 'ios' | 'android' | 'unknown';
  isActive: boolean;
}

interface CustomerDetail {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  gender: string | null;
  dateOfBirth: Date | null;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  isVerified: boolean;
  addresses: any[];
  paymentMethodCount: number;
  orderSummary: {
    count: number;
    totalSpent: number;
    averageOrderValue: number;
    lastOrderDate: Date | null;
  };
  engagement: {
    lastActive: Date | null;
    notificationPreferences: any;
    deviceInfo: {
      platforms: string[];
      activeDevices: number;
    };
  };
  preferences: any;
}

interface OrderListItem {
  id: string;
  orderNumber: string;
  date: Date;
  status: string;
  total: number;
  itemCount: number;
  currency: string;
}

interface ActivityItem {
  id: string;
  eventType: string;
  timestamp: Date;
  platform: string;
  details: any;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get the primary platform used by a customer based on their device tokens
 */
function getPrimaryPlatform(deviceTokens: any[]): 'ios' | 'android' | 'unknown' {
  if (!deviceTokens || deviceTokens.length === 0) {
    return 'unknown';
  }

  // Find the most recently used active token
  const activeTokens = deviceTokens
    .filter((dt) => dt.active)
    .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());

  if (activeTokens.length > 0) {
    return activeTokens[0].platform;
  }

  return 'unknown';
}

/**
 * Build segment filter based on customer behavior
 */
function getSegmentFilter(segment: string): any {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  switch (segment) {
    case 'new':
      // Customers created in the last 7 days
      return { createdAt: { $gte: sevenDaysAgo } };

    case 'returning':
      // Customers with more than 1 order
      return { orderCount: { $gt: 1 } };

    case 'high_value':
      // Top spenders (total spent > $500 or > 5 orders)
      return {
        $or: [{ totalSpent: { $gte: 500 } }, { orderCount: { $gte: 5 } }],
      };

    case 'at_risk':
      // Had orders before but none in the last 30 days
      return {
        orderCount: { $gt: 0 },
        lastOrderDate: { $lt: thirtyDaysAgo, $ne: null },
      };

    case 'inactive':
      // No orders in the last 90 days or never ordered
      return {
        $or: [
          { orderCount: 0 },
          { lastOrderDate: { $lt: ninetyDaysAgo } },
          { lastOrderDate: null },
        ],
      };

    case 'all':
    default:
      return {};
  }
}

// =============================================================================
// CONTROLLER FUNCTIONS
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/customers
 *
 * List customers with pagination, sorting, and filtering
 */
export const listCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const query = req.query as CustomerListQuery;

    // Validate storeId
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Parse pagination
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const offset = parseInt(query.offset || '0', 10);

    // Parse sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions: any = { [sortBy]: sortOrder };

    // Build filter
    const filter: any = { storeId: new mongoose.Types.ObjectId(storeId) };

    // Date range filter
    if (query.dateFrom || query.dateTo) {
      filter.createdAt = {};
      if (query.dateFrom) {
        filter.createdAt.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        filter.createdAt.$lte = new Date(query.dateTo);
      }
    }

    // Has orders filter
    if (query.hasOrders === 'true') {
      filter.orderCount = { $gt: 0 };
    } else if (query.hasOrders === 'false') {
      filter.orderCount = 0;
    }

    // Segment filter
    if (query.segment && query.segment !== 'all') {
      const segmentFilter = getSegmentFilter(query.segment);
      Object.assign(filter, segmentFilter);
    }

    // Execute query
    const [customers, totalCount] = await Promise.all([
      Customer.find(filter)
        .select(
          'email name phone createdAt lastOrderDate orderCount totalSpent deviceTokens isActive'
        )
        .sort(sortOptions)
        .skip(offset)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    // Transform results
    const customerList: CustomerListItem[] = customers.map((customer: any) => ({
      id: customer._id.toString(),
      email: customer.email,
      name: customer.name || null,
      phone: customer.phone || null,
      createdAt: customer.createdAt,
      lastOrderDate: customer.lastOrderDate || null,
      orderCount: customer.orderCount || 0,
      totalSpent: customer.totalSpent || 0,
      platform: getPrimaryPlatform(customer.deviceTokens),
      isActive: customer.isActive,
    }));

    res.json({
      success: true,
      data: {
        customers: customerList,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
    });
  } catch (error) {
    console.error('Error listing customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list customers',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/customers/search
 *
 * Search customers by name, email, or phone
 */
export const searchCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { q, limit: limitStr } = req.query;

    // Validate storeId
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters',
      });
      return;
    }

    const searchTerm = q.trim();
    const limit = Math.min(parseInt(limitStr as string || '20', 10), 50);

    // Build search query with regex (case-insensitive)
    const searchRegex = new RegExp(searchTerm, 'i');
    const filter = {
      storeId: new mongoose.Types.ObjectId(storeId),
      $or: [{ email: searchRegex }, { name: searchRegex }, { phone: searchRegex }],
    };

    const customers = await Customer.find(filter)
      .select(
        'email name phone createdAt lastOrderDate orderCount totalSpent deviceTokens isActive'
      )
      .limit(limit)
      .lean();

    // Transform results
    const customerList: CustomerListItem[] = customers.map((customer: any) => ({
      id: customer._id.toString(),
      email: customer.email,
      name: customer.name || null,
      phone: customer.phone || null,
      createdAt: customer.createdAt,
      lastOrderDate: customer.lastOrderDate || null,
      orderCount: customer.orderCount || 0,
      totalSpent: customer.totalSpent || 0,
      platform: getPrimaryPlatform(customer.deviceTokens),
      isActive: customer.isActive,
    }));

    res.json({
      success: true,
      data: {
        customers: customerList,
        searchTerm,
        count: customerList.length,
      },
    });
  } catch (error) {
    console.error('Error searching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search customers',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/customers/:customerId
 *
 * Get detailed customer profile
 */
export const getCustomerDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, customerId } = req.params;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid customer ID',
      });
      return;
    }

    // Find customer with store isolation
    const customer = await Customer.findOne({
      _id: customerId,
      storeId: new mongoose.Types.ObjectId(storeId),
    }).lean();

    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Get order summary
    const orderStats = await Order.aggregate([
      {
        $match: {
          customer: new mongoose.Types.ObjectId(customerId),
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSpent: { $sum: '$totalPrice' },
          avgOrderValue: { $avg: '$totalPrice' },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
    ]);

    const orderSummary = orderStats[0] || {
      count: 0,
      totalSpent: 0,
      avgOrderValue: 0,
      lastOrderDate: null,
    };

    // Get device info
    const activeDevices = (customer.deviceTokens || []).filter(
      (dt: any) => dt.active
    );
    const platforms = [...new Set(activeDevices.map((dt: any) => dt.platform))];

    // Build customer detail response
    const customerDetail: CustomerDetail = {
      id: (customer as any)._id.toString(),
      email: customer.email,
      name: customer.name || null,
      phone: customer.phone || null,
      avatar: customer.avatar || null,
      gender: customer.gender || null,
      dateOfBirth: customer.dateOfBirth || null,
      country: customer.country || null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      isActive: customer.isActive,
      isVerified: customer.isVerified,
      addresses: customer.addresses || [],
      paymentMethodCount: customer.stripeCustomerId ? 1 : 0, // We don't store card details
      orderSummary: {
        count: orderSummary.count,
        totalSpent: orderSummary.totalSpent,
        averageOrderValue: Math.round(orderSummary.avgOrderValue * 100) / 100,
        lastOrderDate: orderSummary.lastOrderDate,
      },
      engagement: {
        lastActive: customer.lastLoginAt || null,
        notificationPreferences: customer.notificationPreferences,
        deviceInfo: {
          platforms: platforms as string[],
          activeDevices: activeDevices.length,
        },
      },
      preferences: customer.preferences,
    };

    res.json({
      success: true,
      data: customerDetail,
    });
  } catch (error) {
    console.error('Error getting customer detail:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer detail',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/customers/:customerId/orders
 *
 * Get paginated order history for a specific customer
 */
export const getCustomerOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, customerId } = req.params;
    const { limit: limitStr, offset: offsetStr } = req.query;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid customer ID',
      });
      return;
    }

    // Verify customer belongs to this store
    const customerExists = await Customer.exists({
      _id: customerId,
      storeId: new mongoose.Types.ObjectId(storeId),
    });

    if (!customerExists) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Parse pagination
    const limit = Math.min(parseInt(limitStr as string || '20', 10), 100);
    const offset = parseInt(offsetStr as string || '0', 10);

    // Get orders
    const [orders, totalCount] = await Promise.all([
      Order.find({ customer: customerId })
        .select('orderNumber createdAt mobileStatus totalPrice lineItems currency')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customer: customerId }),
    ]);

    // Transform results
    const orderList: OrderListItem[] = orders.map((order: any) => ({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      date: order.createdAt,
      status: order.mobileStatus?.current || 'unknown',
      total: order.totalPrice || 0,
      itemCount: order.lineItems?.reduce(
        (sum: number, item: any) => sum + (item.quantity || 0),
        0
      ) || 0,
      currency: order.currency || 'USD',
    }));

    res.json({
      success: true,
      data: {
        orders: orderList,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
      },
    });
  } catch (error) {
    console.error('Error getting customer orders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer orders',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/customers/:customerId/activity
 *
 * Get recent activity/events for a customer
 */
export const getCustomerActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId, customerId } = req.params;
    const { limit: limitStr } = req.query;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid customer ID',
      });
      return;
    }

    // Verify customer belongs to this store
    const customerExists = await Customer.exists({
      _id: customerId,
      storeId: new mongoose.Types.ObjectId(storeId),
    });

    if (!customerExists) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    const limit = Math.min(parseInt(limitStr as string || '50', 10), 200);

    // Get analytics events for this customer
    // Note: AnalyticsEvent uses userId which could be Customer or User
    const events = await AnalyticsEvent.find({
      userId: customerId,
      storeId: new mongoose.Types.ObjectId(storeId),
    })
      .select('eventType timestamp platform eventData')
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    // Transform results
    const activityList: ActivityItem[] = events.map((event: any) => ({
      id: event._id.toString(),
      eventType: event.eventType,
      timestamp: event.timestamp,
      platform: event.platform,
      details: {
        productId: event.eventData?.productId,
        productTitle: event.eventData?.productTitle,
        searchQuery: event.eventData?.searchQuery,
        categoryTitle: event.eventData?.categoryTitle,
        collectionTitle: event.eventData?.collectionTitle,
        quantity: event.eventData?.quantity,
        price: event.eventData?.price,
        screenName: event.eventData?.screenName,
      },
    }));

    // Group events by type for summary
    const eventSummary: Record<string, number> = {};
    events.forEach((event: any) => {
      eventSummary[event.eventType] = (eventSummary[event.eventType] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        activity: activityList,
        summary: eventSummary,
        count: activityList.length,
      },
    });
  } catch (error) {
    console.error('Error getting customer activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer activity',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/customers/stats
 *
 * Get customer statistics for the store
 */
export const getCustomerStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Validate storeId
    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const storeObjectId = new mongoose.Types.ObjectId(storeId);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run aggregations in parallel
    const [
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth,
      newCustomersThisWeek,
      customersWithOrders,
      platformStats,
      revenueStats,
    ] = await Promise.all([
      // Total customers
      Customer.countDocuments({ storeId: storeObjectId }),

      // Active customers (logged in within last 30 days)
      Customer.countDocuments({
        storeId: storeObjectId,
        lastLoginAt: { $gte: thirtyDaysAgo },
      }),

      // New customers this month
      Customer.countDocuments({
        storeId: storeObjectId,
        createdAt: { $gte: thirtyDaysAgo },
      }),

      // New customers this week
      Customer.countDocuments({
        storeId: storeObjectId,
        createdAt: { $gte: sevenDaysAgo },
      }),

      // Customers who have placed at least one order
      Customer.countDocuments({
        storeId: storeObjectId,
        orderCount: { $gt: 0 },
      }),

      // Platform breakdown
      Customer.aggregate([
        { $match: { storeId: storeObjectId } },
        { $unwind: { path: '$deviceTokens', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$deviceTokens.platform',
            count: { $sum: 1 },
          },
        },
      ]),

      // Revenue stats
      Customer.aggregate([
        { $match: { storeId: storeObjectId, orderCount: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalSpent' },
            avgCustomerValue: { $avg: '$totalSpent' },
            avgOrderCount: { $avg: '$orderCount' },
          },
        },
      ]),
    ]);

    // Transform platform stats
    const platforms: Record<string, number> = { ios: 0, android: 0, unknown: 0 };
    platformStats.forEach((stat: any) => {
      if (stat._id === 'ios' || stat._id === 'android') {
        platforms[stat._id] = stat.count;
      } else {
        platforms.unknown += stat.count;
      }
    });

    const revenue = revenueStats[0] || {
      totalRevenue: 0,
      avgCustomerValue: 0,
      avgOrderCount: 0,
    };

    res.json({
      success: true,
      data: {
        overview: {
          totalCustomers,
          activeCustomers,
          newThisMonth: newCustomersThisMonth,
          newThisWeek: newCustomersThisWeek,
          withOrders: customersWithOrders,
          conversionRate:
            totalCustomers > 0
              ? Math.round((customersWithOrders / totalCustomers) * 100)
              : 0,
        },
        platforms,
        revenue: {
          total: Math.round(revenue.totalRevenue * 100) / 100,
          averageCustomerValue: Math.round(revenue.avgCustomerValue * 100) / 100,
          averageOrdersPerCustomer: Math.round(revenue.avgOrderCount * 10) / 10,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting customer stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer stats',
    });
  }
};
