import mongoose from 'mongoose';
import { tenantConfig } from '../config/tenant';
import Order from '../models/Order';
import Product from '../models/Product';
import User from '../models/User';

/**
 * Shopify Analytics Service
 *
 * Fetches and calculates analytics from Shopify data (orders, products, customers)
 */

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface SalesOverview {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalItemsSold: number;
  currency: string;
}

interface ProductPerformance {
  productId: string;
  title: string;
  totalSold: number;
  totalRevenue: number;
  averagePrice: number;
  image?: string;
}

interface CustomerMetrics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatPurchaseRate: number;
}

interface OrderTrend {
  date: string;
  orders: number;
  revenue: number;
}

interface DashboardAnalytics {
  overview: SalesOverview;
  topProducts: ProductPerformance[];
  customerMetrics: CustomerMetrics;
  salesTrends: OrderTrend[];
  recentOrders: any[];
  lowStockProducts: any[];
}

class ShopifyAnalyticsService {
  /**
   * Get complete dashboard analytics
   */
  async getDashboardAnalytics(storeId?: string, dateRange?: DateRange): Promise<DashboardAnalytics> {
    const range = dateRange || this.getDefaultDateRange();

    const [
      overview,
      topProducts,
      customerMetrics,
      salesTrends,
      recentOrders,
      lowStockProducts,
    ] = await Promise.all([
      this.getSalesOverview(storeId, range),
      this.getTopProducts(storeId, range, 10),
      this.getCustomerMetrics(storeId, range),
      this.getSalesTrends(storeId, range),
      this.getRecentOrders(storeId, 10),
      this.getLowStockProducts(storeId, 10),
    ]);

    return {
      overview,
      topProducts,
      customerMetrics,
      salesTrends,
      recentOrders,
      lowStockProducts,
    };
  }

  /**
   * Get sales overview metrics
   */
  async getSalesOverview(storeId?: string, dateRange?: DateRange): Promise<SalesOverview> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
      financialStatus: { $in: ['paid', 'partially_paid'] },
    };

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalPrice' },
          totalOrders: { $sum: 1 },
          totalItemsSold: {
            $sum: {
              $reduce: {
                input: '$lineItems',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] },
              },
            },
          },
        },
      },
    ]);

    const data = result[0] || { totalRevenue: 0, totalOrders: 0, totalItemsSold: 0 };

    return {
      totalRevenue: data.totalRevenue || 0,
      totalOrders: data.totalOrders || 0,
      averageOrderValue: data.totalOrders > 0 ? data.totalRevenue / data.totalOrders : 0,
      totalItemsSold: data.totalItemsSold || 0,
      currency: tenantConfig.store.currency || 'USD',
    };
  }

  /**
   * Get top selling products
   */
  async getTopProducts(storeId?: string, dateRange?: DateRange, limit: number = 10): Promise<ProductPerformance[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
      financialStatus: { $in: ['paid', 'partially_paid'] },
    };

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          title: { $first: '$lineItems.title' },
          totalSold: { $sum: '$lineItems.quantity' },
          totalRevenue: { $sum: { $multiply: ['$lineItems.price', '$lineItems.quantity'] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: limit },
    ]);

    // Enrich with product images
    const enrichedProducts = await Promise.all(
      result.map(async (item) => {
        const product = await Product.findOne({ shopifyProductId: item._id }).select('images').lean();
        return {
          productId: item._id,
          title: item.title,
          totalSold: item.totalSold,
          totalRevenue: item.totalRevenue,
          averagePrice: item.totalSold > 0 ? item.totalRevenue / item.totalSold : 0,
          image: product?.images?.[0]?.url,
        };
      })
    );

    return enrichedProducts;
  }

  /**
   * Get customer metrics
   */
  async getCustomerMetrics(storeId?: string, dateRange?: DateRange): Promise<CustomerMetrics> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {};

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    // Total customers
    const totalCustomers = await User.countDocuments({
      ...matchStage,
      role: 'customer',
    });

    // New customers in date range
    const newCustomers = await User.countDocuments({
      ...matchStage,
      role: 'customer',
      createdAt: { $gte: range.startDate, $lte: range.endDate },
    });

    // Customers with more than one order (returning)
    const orderMatchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
    };
    if (storeId) {
      orderMatchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const returningResult = await Order.aggregate([
      { $match: orderMatchStage },
      { $group: { _id: '$user', orderCount: { $sum: 1 } } },
      { $match: { orderCount: { $gt: 1 } } },
      { $count: 'returning' },
    ]);

    const returningCustomers = returningResult[0]?.returning || 0;

    // Customers who ordered in this period
    const customersWhoOrdered = await Order.aggregate([
      { $match: orderMatchStage },
      { $group: { _id: '$user' } },
      { $count: 'total' },
    ]);

    const totalOrderingCustomers = customersWhoOrdered[0]?.total || 0;
    const repeatPurchaseRate = totalOrderingCustomers > 0
      ? (returningCustomers / totalOrderingCustomers) * 100
      : 0;

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      repeatPurchaseRate: Math.round(repeatPurchaseRate * 100) / 100,
    };
  }

  /**
   * Get sales trends over time
   */
  async getSalesTrends(storeId?: string, dateRange?: DateRange): Promise<OrderTrend[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
      financialStatus: { $in: ['paid', 'partially_paid'] },
    };

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$placedAt' },
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalPrice' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return result.map((item) => ({
      date: item._id,
      orders: item.orders,
      revenue: item.revenue,
    }));
  }

  /**
   * Get recent orders
   */
  async getRecentOrders(storeId?: string, limit: number = 10): Promise<any[]> {
    const query: any = {};
    if (storeId) {
      query.storeId = storeId;
    }

    const orders = await Order.find(query)
      .sort({ placedAt: -1 })
      .limit(limit)
      .populate('user', 'name email')
      .select('orderNumber totalPrice financialStatus fulfillmentStatus placedAt lineItems')
      .lean();

    return orders.map((order) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customer: order.user,
      totalPrice: order.totalPrice,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      placedAt: order.placedAt,
      itemCount: order.lineItems?.length || 0,
    }));
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(storeId?: string, limit: number = 10): Promise<any[]> {
    const query: any = {
      'inventoryTracking.tracked': true,
      'inventoryTracking.totalQuantity': { $lte: 10 }, // threshold
      status: 'active',
    };

    if (storeId) {
      query.storeId = storeId;
    }

    const products = await Product.find(query)
      .sort({ 'inventoryTracking.totalQuantity': 1 })
      .limit(limit)
      .select('title images inventoryTracking.totalQuantity inventoryTracking.lowStockThreshold')
      .lean();

    return products.map((product) => ({
      productId: product._id,
      title: product.title,
      image: product.images?.[0]?.url,
      quantity: product.inventoryTracking?.totalQuantity || 0,
      threshold: product.inventoryTracking?.lowStockThreshold || 5,
    }));
  }

  /**
   * Get revenue by category/product type
   */
  async getRevenueByCategory(storeId?: string, dateRange?: DateRange): Promise<any[]> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
      financialStatus: { $in: ['paid', 'partially_paid'] },
    };

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    // First get product IDs from orders
    const orderProducts = await Order.aggregate([
      { $match: matchStage },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          totalRevenue: { $sum: { $multiply: ['$lineItems.price', '$lineItems.quantity'] } },
          totalSold: { $sum: '$lineItems.quantity' },
        },
      },
    ]);

    // Get product categories
    const productIds = orderProducts.map((p) => p._id);
    const products = await Product.find({ shopifyProductId: { $in: productIds } })
      .select('shopifyProductId productType')
      .lean();

    const productTypeMap = new Map(products.map((p) => [p.shopifyProductId, p.productType]));

    // Group by category
    const categoryMap = new Map<string, { revenue: number; sold: number }>();
    for (const item of orderProducts) {
      const category = productTypeMap.get(item._id) || 'Other';
      const existing = categoryMap.get(category) || { revenue: 0, sold: 0 };
      categoryMap.set(category, {
        revenue: existing.revenue + item.totalRevenue,
        sold: existing.sold + item.totalSold,
      });
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        revenue: data.revenue,
        itemsSold: data.sold,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get order fulfillment stats
   */
  async getFulfillmentStats(storeId?: string, dateRange?: DateRange): Promise<any> {
    const range = dateRange || this.getDefaultDateRange();
    const matchStage: any = {
      placedAt: { $gte: range.startDate, $lte: range.endDate },
    };

    if (storeId) {
      // Aggregation $match does not auto-cast; a raw string matches nothing
      matchStage.storeId = new mongoose.Types.ObjectId(storeId);
    }

    const result = await Order.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$fulfillmentStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const stats: any = {
      unfulfilled: 0,
      partial: 0,
      fulfilled: 0,
      total: 0,
    };

    result.forEach((item) => {
      stats[item._id] = item.count;
      stats.total += item.count;
    });

    return stats;
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

export const shopifyAnalyticsService = new ShopifyAnalyticsService();
export default shopifyAnalyticsService;
