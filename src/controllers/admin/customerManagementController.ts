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
  page?: string;
  limit?: string;
  offset?: string;
  search?: string;
  q?: string; // Alias for search - dashboard compatibility
  filter?: 'all' | 'has_orders' | 'no_orders' | 'high_value';
  sortBy?: 'name' | 'email' | 'orders' | 'spent' | 'lastOrder' | 'joined' | 'createdAt' | 'lastOrderDate' | 'totalSpent' | 'orderCount';
  sortOrder?: 'asc' | 'desc';
  dateFrom?: string;
  dateTo?: string;
  hasOrders?: string;
  segment?: 'all' | 'new' | 'returning' | 'high_value' | 'at_risk' | 'inactive';
}

interface CustomerListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  currency: string;
  lastOrderDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  acceptsMarketing: boolean;
  tags: string[];
  defaultAddress: any | null;
  deviceCount: number;
  platforms: string[];
}

interface CustomerDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  currency: string;
  lastOrderDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  acceptsMarketing: boolean;
  tags: string[];
  addresses: any[];
  orders: any[];
  recentActivity: any[];
  metrics: {
    averageOrderValue: number;
    daysSinceLastOrder: number | null;
    lifetimeValue: number;
  };
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

    // Parse pagination - support both page/limit and offset/limit
    const limit = Math.min(parseInt(query.limit || '20', 10), 100);
    const page = parseInt(query.page || '1', 10);
    const offset = query.offset ? parseInt(query.offset, 10) : (page - 1) * limit;

    // Parse sorting - map dashboard fields to database fields
    const sortFieldMap: Record<string, string> = {
      'name': 'name',
      'email': 'email',
      'orders': 'orderCount',
      'spent': 'totalSpent',
      'lastOrder': 'lastOrderDate',
      'joined': 'createdAt',
      'createdAt': 'createdAt',
      'lastOrderDate': 'lastOrderDate',
      'totalSpent': 'totalSpent',
      'orderCount': 'orderCount',
    };
    const sortBy = sortFieldMap[query.sortBy || 'joined'] || 'createdAt';
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
    const sortOptions: any = { [sortBy]: sortOrder };

    // Build filter
    const filter: any = { storeId: new mongoose.Types.ObjectId(storeId) };

    // Search filter - support both 'search' and 'q' parameters
    const searchParam = query.search || query.q;
    if (searchParam && searchParam.trim()) {
      const searchTerm = searchParam.trim();
      const searchRegex = new RegExp(searchTerm, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    // Filter by order status (new dashboard format)
    if (query.filter === 'has_orders') {
      filter.orderCount = { $gt: 0 };
    } else if (query.filter === 'no_orders') {
      // Use $and to combine with existing $or (search) if present
      const noOrdersCondition = {
        $or: [
          { orderCount: { $eq: 0 } },
          { orderCount: { $exists: false } },
        ],
      };
      if (filter.$or) {
        // Combine search $or with no_orders condition using $and
        filter.$and = [{ $or: filter.$or }, noOrdersCondition];
        delete filter.$or;
      } else {
        filter.$or = noOrdersCondition.$or;
      }
    } else if (query.filter === 'high_value') {
      filter.totalSpent = { $gte: 500 };
    }

    // Legacy hasOrders filter support
    if (query.hasOrders === 'true') {
      filter.orderCount = { $gt: 0 };
    } else if (query.hasOrders === 'false') {
      filter.orderCount = 0;
    }

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

    // Segment filter
    if (query.segment && query.segment !== 'all') {
      const segmentFilter = getSegmentFilter(query.segment);
      Object.assign(filter, segmentFilter);
    }

    // Execute query
    const [customers, totalCount] = await Promise.all([
      Customer.find(filter)
        .select(
          'email name phone createdAt updatedAt lastOrderDate orderCount totalSpent deviceTokens isActive addresses notificationPreferences preferences'
        )
        .sort(sortOptions)
        .skip(offset)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    // Transform results to match dashboard expected format
    const customerList: CustomerListItem[] = customers.map((customer: any) => {
      // Parse name into firstName and lastName
      const nameParts = (customer.name || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Get platforms from device tokens
      const activeTokens = (customer.deviceTokens || []).filter((dt: any) => dt.active);
      const platforms = [...new Set(activeTokens.map((dt: any) => dt.platform))].filter(Boolean);

      // Get default address
      const defaultAddress = (customer.addresses || []).find((addr: any) => addr.isDefault) ||
                            (customer.addresses || [])[0] || null;

      return {
        id: customer._id.toString(),
        email: customer.email || '',
        firstName,
        lastName,
        phone: customer.phone || null,
        totalOrders: customer.orderCount || 0,
        totalSpent: customer.totalSpent || 0,
        currency: customer.preferences?.currency || 'USD',
        lastOrderDate: customer.lastOrderDate || null,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt || customer.createdAt,
        acceptsMarketing: customer.notificationPreferences?.promotions !== false,
        tags: [],
        defaultAddress,
        deviceCount: activeTokens.length,
        platforms: platforms as string[],
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        customers: customerList,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
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
        'email firstName lastName name phone createdAt updatedAt lastOrderDate orderCount totalSpent deviceTokens isActive acceptsMarketing tags addresses'
      )
      .limit(limit)
      .lean();

    // Transform results
    const customerList: CustomerListItem[] = customers.map((customer: any) => {
      // Extract first and last name
      let firstName = customer.firstName || '';
      let lastName = customer.lastName || '';
      if (!firstName && !lastName && customer.name) {
        const nameParts = customer.name.split(' ');
        firstName = nameParts[0] || '';
        lastName = nameParts.slice(1).join(' ') || '';
      }

      // Get device info
      const deviceTokens = customer.deviceTokens || [];
      const platforms = [...new Set(deviceTokens.map((d: any) => d.platform).filter(Boolean))] as string[];

      return {
        id: customer._id.toString(),
        email: customer.email,
        firstName,
        lastName,
        phone: customer.phone || null,
        totalOrders: customer.orderCount || 0,
        totalSpent: customer.totalSpent || 0,
        currency: 'GBP',
        lastOrderDate: customer.lastOrderDate || null,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt || customer.createdAt,
        acceptsMarketing: customer.acceptsMarketing || false,
        tags: customer.tags || [],
        defaultAddress: customer.addresses?.find((a: any) => a.isDefault) || customer.addresses?.[0] || null,
        deviceCount: deviceTokens.length,
        platforms,
      };
    });

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

    // Get recent orders
    const orders = await Order.find({
      customer: new mongoose.Types.ObjectId(customerId),
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber totalPrice mobileStatus createdAt')
      .lean();

    // Parse name into firstName and lastName
    const nameParts = (customer.name || '').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Calculate metrics
    const totalOrders = customer.orderCount || 0;
    const totalSpent = customer.totalSpent || 0;
    const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0;
    const daysSinceLastOrder = customer.lastOrderDate
      ? Math.floor((Date.now() - new Date(customer.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Build customer detail response
    const customerDetail: CustomerDetail = {
      id: (customer as any)._id.toString(),
      email: customer.email || '',
      firstName,
      lastName,
      phone: customer.phone || null,
      totalOrders,
      totalSpent,
      currency: customer.preferences?.currency || 'USD',
      lastOrderDate: customer.lastOrderDate || null,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      acceptsMarketing: customer.notificationPreferences?.promotions !== false,
      tags: [],
      addresses: customer.addresses || [],
      orders: orders.map((o: any) => ({
        id: o._id.toString(),
        orderNumber: o.orderNumber,
        total: o.totalPrice,
        status: o.mobileStatus?.current || 'unknown',
        createdAt: o.createdAt,
      })),
      recentActivity: [], // TODO: Implement activity tracking
      metrics: {
        averageOrderValue: Math.round(avgOrderValue * 100) / 100,
        daysSinceLastOrder,
        lifetimeValue: totalSpent,
      },
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

    // Transform results - match dashboard expected format
    const orderList = orders.map((order: any) => ({
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      total: order.totalPrice || 0,
      status: order.mobileStatus?.current || 'unknown',
      createdAt: order.createdAt,
    }));

    res.json({
      success: true,
      data: {
        orders: orderList,
        total: totalCount,
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

    const limit = Math.min(parseInt(limitStr as string || '20', 10), 200);

    // Get orders as activity (primary activity for now)
    const orders = await Order.find({
      customer: new mongoose.Types.ObjectId(customerId),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('orderNumber totalPrice createdAt')
      .lean();

    // Transform orders to activity format
    const activities = orders.map((o: any) => ({
      id: o._id.toString(),
      type: 'order_placed',
      description: `Placed order #${o.orderNumber} for $${o.totalPrice}`,
      createdAt: o.createdAt,
    }));

    res.json({
      success: true,
      data: {
        activities,
        total: activities.length,
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

    // Get first day of current month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run aggregations in parallel
    const [
      totalCustomers,
      customersWithOrders,
      highValueCustomers,
      newCustomersThisMonth,
    ] = await Promise.all([
      // Total customers
      Customer.countDocuments({ storeId: storeObjectId }),

      // Customers who have placed at least one order
      Customer.countDocuments({
        storeId: storeObjectId,
        orderCount: { $gt: 0 },
      }),

      // High value customers (totalSpent >= 500)
      Customer.countDocuments({
        storeId: storeObjectId,
        totalSpent: { $gte: 500 },
      }),

      // New customers this month
      Customer.countDocuments({
        storeId: storeObjectId,
        createdAt: { $gte: firstDayOfMonth },
      }),
    ]);

    // Return in dashboard expected format
    res.json({
      success: true,
      data: {
        totalCustomers,
        customersWithOrders,
        customersWithoutOrders: totalCustomers - customersWithOrders,
        highValueCustomers,
        newCustomersThisMonth,
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
