import { Parser } from 'json2csv';
import Order from '../models/Order';
import Store from '../models/Store';

/**
 * Order Export Service
 *
 * Handles exporting orders to various formats (CSV, JSON) for
 * accounting, analysis, and reporting purposes.
 */
export class OrderExportService {
  /**
   * Export orders to CSV format
   */
  static async exportToCSV(
    storeId: string,
    filters: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
    } = {}
  ): Promise<string> {
    try {
      // Build query
      const query: any = {};

      // Add storeId filter if provided (for multi-tenant)
      if (storeId) {
        query.storeId = storeId;
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.createdAt.$lte = filters.endDate;
        }
      }

      if (filters.status) {
        query['mobileStatus.current'] = filters.status;
      }

      if (filters.paymentStatus) {
        query.paymentStatus = filters.paymentStatus;
      }

      if (filters.fulfillmentStatus) {
        query.fulfillmentStatus = filters.fulfillmentStatus;
      }

      // Fetch orders
      const orders = await Order.find(query)
        .populate('user', 'name email')
        .populate('customer', 'name email')
        .populate('lineItems.productId', 'title sku')
        .sort({ createdAt: -1 })
        .lean();

      // Transform data for CSV
      const csvData = orders.map((order: any) => {
        // Get customer info from user or customer field
        const customerName = order.user?.name ||
          order.customer?.name ||
          (order.guestContact?.fullName) ||
          'Guest';

        const customerEmail = order.user?.email ||
          order.customer?.email ||
          order.guestContact?.email ||
          order.email ||
          '';

        // Format shipping address
        const shippingAddressStr = order.shippingAddress
          ? `${order.shippingAddress.address1 || ''}, ${order.shippingAddress.city || ''}, ${order.shippingAddress.province || ''} ${order.shippingAddress.zip || ''}`
          : '';

        // Calculate line items summary
        const itemsSummary = (order.lineItems || [])
          .map((item: any) => `${item.title} x${item.quantity}`)
          .join('; ');

        return {
          'Order Number': order.orderNumber || '',
          'Date': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[0] : '',
          'Time': order.createdAt ? new Date(order.createdAt).toISOString().split('T')[1].split('.')[0] : '',
          'Customer Name': customerName,
          'Customer Email': customerEmail,
          'Order Status': order.mobileStatus?.current || 'unknown',
          'Payment Status': order.paymentStatus || 'pending',
          'Fulfillment Status': order.fulfillmentStatus || 'unfulfilled',
          'Items Count': (order.lineItems || []).length,
          'Items': itemsSummary,
          'Subtotal': (order.subtotalPrice || 0).toFixed(2),
          'Tax': (order.totalTax || 0).toFixed(2),
          'Shipping': (order.shippingCost || order.shipping?.cost || 0).toFixed(2),
          'Discount': (order.discount || 0).toFixed(2),
          'Total': (order.totalPrice || 0).toFixed(2),
          'Currency': order.currency || 'USD',
          'Shipping Address': shippingAddressStr,
          'Shipping Method': order.shipping?.method || '',
          'Tracking Number': order.shipping?.trackingNumber || '',
          'Carrier': order.shipping?.carrier || '',
          'Source': order.source || '',
          'Channel': order.channel || '',
          'Shopify Draft Order ID': order.shopifyDraftOrderId || '',
          'Shopify Order ID': order.shopifyOrderId || '',
          'Is Guest Order': order.isGuestOrder ? 'Yes' : 'No',
          'Customer Notes': order.customerNotes || '',
          'Special Instructions': order.specialInstructions || '',
        };
      });

      // Handle empty results
      if (csvData.length === 0) {
        return 'No orders found for the specified criteria';
      }

      // Convert to CSV
      const parser = new Parser();
      const csv = parser.parse(csvData);

      return csv;
    } catch (error) {
      console.error('CSV export error:', error);
      throw new Error('Failed to export orders to CSV');
    }
  }

  /**
   * Export single order details (for printing/PDF)
   */
  static async exportOrderDetails(orderId: string): Promise<any> {
    try {
      const order = await Order.findById(orderId)
        .populate('user', 'name email phone')
        .populate('customer', 'name email phone')
        .populate('lineItems.productId', 'title images sku price')
        .lean();

      if (!order) {
        throw new Error('Order not found');
      }

      // Get store info if available
      let storeInfo = null;
      if ((order as any).storeId) {
        const store = await Store.findById((order as any).storeId).lean();
        if (store) {
          storeInfo = {
            name: store.name,
            slug: store.slug,
          };
        }
      }

      // Get customer info
      const customerInfo = {
        name: (order as any).user?.name ||
          (order as any).customer?.name ||
          (order as any).guestContact?.fullName ||
          'Guest',
        email: (order as any).user?.email ||
          (order as any).customer?.email ||
          (order as any).guestContact?.email ||
          order.email,
        phone: (order as any).user?.phone ||
          (order as any).customer?.phone ||
          (order as any).guestContact?.phone ||
          order.shippingAddress?.phone,
      };

      return {
        orderNumber: order.orderNumber,
        confirmationNumber: order.confirmationNumber,
        date: order.createdAt,
        placedAt: order.placedAt,
        status: order.mobileStatus?.current,
        statusHistory: order.mobileStatus?.history,
        financialStatus: order.financialStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        customer: customerInfo,
        isGuestOrder: (order as any).isGuestOrder,
        items: (order.lineItems || []).map((item: any) => ({
          title: item.title || item.productId?.title,
          sku: item.sku || item.productId?.sku,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
          image: item.image || item.productId?.images?.[0]?.url,
          variantId: item.variantId,
        })),
        shippingAddress: order.shippingAddress,
        billingAddress: order.billingAddress,
        shipping: order.shipping,
        pricing: {
          subtotal: order.subtotalPrice,
          tax: order.totalTax,
          shippingCost: (order as any).shippingCost || order.shipping?.cost || 0,
          discount: order.discount || 0,
          total: order.totalPrice,
          currency: order.currency,
        },
        tracking: {
          trackingNumber: order.shipping?.trackingNumber,
          trackingUrl: order.shipping?.trackingUrl,
          carrier: order.shipping?.carrier,
          estimatedDelivery: order.shipping?.estimatedDelivery || order.mobileStatus?.estimatedDelivery,
        },
        notes: {
          customerNotes: order.customerNotes,
          merchantNotes: order.merchantNotes,
          specialInstructions: order.specialInstructions,
        },
        deliveryPreferences: order.deliveryPreferences,
        shopify: {
          draftOrderId: order.shopifyDraftOrderId,
          orderId: order.shopifyOrderId,
          orderNumber: order.shopifyOrderNumber,
        },
        source: order.source,
        channel: order.channel,
        store: storeInfo,
        timestamps: {
          created: order.createdAt,
          updated: order.updatedAt,
          placed: order.placedAt,
          processed: order.processedAt,
          shipped: order.shippedAt,
          delivered: order.deliveredAt,
          cancelled: order.cancelledAt,
        },
      };
    } catch (error) {
      console.error('Order details export error:', error);
      throw error;
    }
  }

  /**
   * Export orders summary/statistics
   */
  static async exportOrderStats(
    storeId: string,
    filters: {
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<any> {
    try {
      const query: any = {};

      if (storeId) {
        query.storeId = storeId;
      }

      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) {
          query.createdAt.$gte = filters.startDate;
        }
        if (filters.endDate) {
          query.createdAt.$lte = filters.endDate;
        }
      }

      const [
        totalOrders,
        totalRevenue,
        statusCounts,
        avgOrderValue,
        paymentStatusCounts,
        fulfillmentStatusCounts,
        sourceBreakdown,
      ] = await Promise.all([
        Order.countDocuments(query),
        Order.aggregate([
          { $match: query },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } },
        ]),
        Order.aggregate([
          { $match: query },
          { $group: { _id: '$mobileStatus.current', count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $match: query },
          { $group: { _id: null, avg: { $avg: '$totalPrice' } } },
        ]),
        Order.aggregate([
          { $match: query },
          { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $match: query },
          { $group: { _id: '$fulfillmentStatus', count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $match: query },
          { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
        ]),
      ]);

      return {
        summary: {
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          avgOrderValue: avgOrderValue[0]?.avg || 0,
        },
        statusBreakdown: statusCounts.reduce((acc: any, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        paymentStatusBreakdown: paymentStatusCounts.reduce((acc: any, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        fulfillmentStatusBreakdown: fulfillmentStatusCounts.reduce((acc: any, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        sourceBreakdown: sourceBreakdown.map((item) => ({
          source: item._id || 'unknown',
          count: item.count,
          revenue: item.revenue,
        })),
        dateRange: {
          start: filters.startDate,
          end: filters.endDate,
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Order stats export error:', error);
      throw new Error('Failed to export order statistics');
    }
  }
}

export default OrderExportService;
