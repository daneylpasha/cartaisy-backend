import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import { ShopifyOrderSyncService } from '../services/shopifyOrderSyncService';
import { OrderExportService } from '../services/orderExportService';
import { AuthenticatedRequest } from '../types';

/**
 * Order Management Controller
 *
 * Admin-facing endpoints for managing orders, including filtering,
 * status updates, exports, and Shopify sync.
 */

/**
 * Get orders with filtering and pagination (for admin dashboard)
 */
export const getOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId?: string };
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      fulfillmentStatus,
      search,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      source,
      channel,
    } = req.query as {
      page?: number;
      limit?: number;
      status?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
      sortBy?: string;
      sortOrder?: string;
      source?: string;
      channel?: string;
    };

    // Build query
    const query: any = {};

    // Add storeId filter if provided
    if (storeId) {
      query.storeId = new mongoose.Types.ObjectId(storeId);
    }

    if (status) {
      query['mobileStatus.current'] = status;
    }

    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    if (fulfillmentStatus) {
      query.fulfillmentStatus = fulfillmentStatus;
    }

    if (source) {
      query.source = source;
    }

    if (channel) {
      query.channel = channel;
    }

    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { 'guestContact.email': { $regex: search, $options: 'i' } },
        { 'guestContact.fullName': { $regex: search, $options: 'i' } },
        { shopifyOrderId: { $regex: search, $options: 'i' } },
        { shopifyDraftOrderId: { $regex: search, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    // Execute query with pagination
    const skip = (Number(page) - 1) * Number(limit);
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('user', 'name email')
        .populate('customer', 'name email')
        .populate('lineItems.productId', 'title images')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments(query),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        orders,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch orders',
    });
  }
};

/**
 * Get single order details
 */
export const getOrderDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };

    const order = await Order.findById(orderId)
      .populate('user', 'name email phone')
      .populate('customer', 'name email phone')
      .populate('lineItems.productId', 'title images sku price');

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: { order },
    });
  } catch (error: any) {
    console.error('Get order details error:', error?.message || error);
    console.error('Stack:', error?.stack);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch order details',
      error: error?.message || 'Unknown error',
    });
  }
};

/**
 * Update order status and tracking information
 *
 * Supports action-based updates for convenience:
 * - action: "fulfill" → Sets fulfillmentStatus to "fulfilled" and status to "shipped"
 * - action: "ship" → Sets status to "shipped"
 * - action: "cancel" → Sets status to "cancelled"
 * - action: "deliver" → Sets status to "delivered"
 */
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };
    let {
      action,
      status,
      paymentStatus,
      fulfillmentStatus,
      trackingNumber,
      trackingUrl,
      carrier,
      trackingCompany, // Alias for carrier (dashboard compatibility)
      estimatedDelivery,
      merchantNote,
      notifyCustomer,
    } = req.body as {
      action?: string;
      status?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
      trackingNumber?: string;
      trackingUrl?: string;
      carrier?: string;
      trackingCompany?: string;
      estimatedDelivery?: string;
      merchantNote?: string;
      notifyCustomer?: boolean;
    };

    // Handle action-based updates (convenience shortcuts)
    if (action) {
      switch (action.toLowerCase()) {
        case 'fulfill':
          // Fulfill order: set fulfillment status and optionally ship
          fulfillmentStatus = fulfillmentStatus || 'fulfilled';
          status = status || 'shipped';
          break;
        case 'ship':
          status = 'shipped';
          break;
        case 'cancel':
          status = 'cancelled';
          fulfillmentStatus = fulfillmentStatus || 'cancelled';
          break;
        case 'deliver':
          status = 'delivered';
          fulfillmentStatus = fulfillmentStatus || 'fulfilled';
          break;
        case 'confirm':
          status = 'confirmed';
          break;
        case 'process':
          status = 'processing';
          break;
        default:
          // Unknown action, ignore and use explicit fields
          break;
      }
    }

    // Use trackingCompany as carrier if carrier not provided
    if (!carrier && trackingCompany) {
      carrier = trackingCompany;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
      return;
    }

    // Update mobile status if provided
    if (status) {
      const validStatuses = ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          status: 'error',
          message: `Invalid status. Valid values: ${validStatuses.join(', ')}`,
        });
        return;
      }

      // Add to history
      order.mobileStatus.history.push({
        status: order.mobileStatus.current,
        timestamp: new Date(),
        note: `Status changed to ${status}`,
      });

      order.mobileStatus.current = status as 'placed' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';

      // Set timestamps based on status
      const now = new Date();
      if (status === 'confirmed' && !order.processedAt) {
        order.processedAt = now;
      } else if (status === 'shipped' && !order.shippedAt) {
        order.shippedAt = now;
      } else if (status === 'delivered' && !order.deliveredAt) {
        order.deliveredAt = now;
      } else if (status === 'cancelled' && !order.cancelledAt) {
        order.cancelledAt = now;
      }
    }

    // Update payment status
    if (paymentStatus) {
      const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
      if (!validPaymentStatuses.includes(paymentStatus)) {
        res.status(400).json({
          status: 'error',
          message: `Invalid payment status. Valid values: ${validPaymentStatuses.join(', ')}`,
        });
        return;
      }
      order.paymentStatus = paymentStatus as 'pending' | 'paid' | 'failed' | 'refunded';
    }

    // Update fulfillment status
    if (fulfillmentStatus) {
      const validFulfillmentStatuses = ['unfulfilled', 'partial', 'fulfilled', 'restocked', 'cancelled'];
      if (!validFulfillmentStatuses.includes(fulfillmentStatus)) {
        res.status(400).json({
          status: 'error',
          message: `Invalid fulfillment status. Valid values: ${validFulfillmentStatuses.join(', ')}`,
        });
        return;
      }
      order.fulfillmentStatus = fulfillmentStatus as 'unfulfilled' | 'partial' | 'fulfilled' | 'restocked' | 'cancelled';
    }

    // Update tracking info
    if (trackingNumber !== undefined) {
      if (!order.shipping) {
        order.shipping = { method: 'Standard', cost: 0 };
      }
      order.shipping.trackingNumber = trackingNumber;
    }

    if (trackingUrl !== undefined) {
      if (!order.shipping) {
        order.shipping = { method: 'Standard', cost: 0 };
      }
      order.shipping.trackingUrl = trackingUrl;
    }

    if (carrier !== undefined) {
      if (!order.shipping) {
        order.shipping = { method: 'Standard', cost: 0 };
      }
      order.shipping.carrier = carrier;
    }

    if (estimatedDelivery) {
      if (!order.shipping) {
        order.shipping = { method: 'Standard', cost: 0 };
      }
      order.shipping.estimatedDelivery = new Date(estimatedDelivery);
      order.mobileStatus.estimatedDelivery = new Date(estimatedDelivery);
    }

    // Update merchant note
    if (merchantNote !== undefined) {
      order.merchantNotes = merchantNote;
    }

    await order.save();

    // Async: Update draft order in Shopify
    ShopifyOrderSyncService.updateDraftOrder(orderId).catch((err) =>
      console.error('Shopify sync error:', err)
    );

    // Send push notification for status changes (async, don't wait)
    if (status) {
      setImmediate(() => {
        const { FirebaseNotificationService } = require('../services/firebaseNotificationService');

        // Map status to notification type
        let notificationType: 'confirmed' | 'shipped' | 'delivered' | 'cancelled' | null = null;

        if (status === 'shipped' || status === 'out_for_delivery') {
          notificationType = 'shipped';
        } else if (status === 'delivered') {
          notificationType = 'delivered';
        } else if (status === 'cancelled') {
          notificationType = 'cancelled';
        } else if (status === 'confirmed') {
          notificationType = 'confirmed';
        }

        if (notificationType) {
          FirebaseNotificationService.sendOrderNotification(order, notificationType).catch((err: any) => {
            console.error('Order status update push error:', err);
          });
        }
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Order updated successfully',
      data: { order },
    });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update order',
    });
  }
};

/**
 * Export orders to CSV
 */
export const exportOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId?: string };
    const { startDate, endDate, status, paymentStatus, fulfillmentStatus } = req.query as {
      startDate?: string;
      endDate?: string;
      status?: string;
      paymentStatus?: string;
      fulfillmentStatus?: string;
    };

    const csv = await OrderExportService.exportToCSV(storeId || '', {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status: status,
      paymentStatus: paymentStatus,
      fulfillmentStatus: fulfillmentStatus,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${Date.now()}.csv`);
    res.status(200).send(csv);
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to export orders',
    });
  }
};

/**
 * Export single order details (for printing/invoice)
 */
export const exportOrderDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };

    const orderDetails = await OrderExportService.exportOrderDetails(orderId);

    res.status(200).json({
      status: 'success',
      data: orderDetails,
    });
  } catch (error) {
    console.error('Export order details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to export order details',
    });
  }
};

/**
 * Sync order to Shopify (create draft order)
 */
export const syncToShopify = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };

    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
      return;
    }

    // Check if already synced
    if (order.shopifyDraftOrderId) {
      res.status(400).json({
        status: 'error',
        message: 'Order already synced to Shopify',
        data: { shopifyDraftOrderId: order.shopifyDraftOrderId },
      });
      return;
    }

    const draftOrderId = await ShopifyOrderSyncService.createDraftOrder(orderId);

    if (draftOrderId) {
      res.status(200).json({
        status: 'success',
        message: 'Order synced to Shopify',
        data: { shopifyDraftOrderId: draftOrderId },
      });
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Store not connected to Shopify or sync failed',
      });
    }
  } catch (error) {
    console.error('Sync to Shopify error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to sync order to Shopify',
    });
  }
};

/**
 * Complete draft order in Shopify (convert to actual order)
 */
export const completeDraftOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };

    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
      return;
    }

    if (!order.shopifyDraftOrderId) {
      res.status(400).json({
        status: 'error',
        message: 'Order has no draft order in Shopify. Sync first.',
      });
      return;
    }

    await ShopifyOrderSyncService.completeDraftOrder(orderId);

    // Reload order to get updated shopifyOrderId
    const updatedOrder = await Order.findById(orderId);

    res.status(200).json({
      status: 'success',
      message: 'Draft order completed in Shopify',
      data: {
        shopifyDraftOrderId: updatedOrder?.shopifyDraftOrderId,
        shopifyOrderId: updatedOrder?.shopifyOrderId,
      },
    });
  } catch (error) {
    console.error('Complete draft order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to complete draft order in Shopify',
    });
  }
};

/**
 * Get order statistics/analytics
 */
export const getOrderStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId?: string };
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const stats = await OrderExportService.exportOrderStats(storeId || '', {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.status(200).json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch order statistics',
    });
  }
};

/**
 * Bulk update orders (e.g., mark multiple as shipped)
 */
export const bulkUpdateOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderIds, updates } = req.body as {
      orderIds?: string[];
      updates?: { status?: string; paymentStatus?: string; fulfillmentStatus?: string };
    };

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'orderIds array is required',
      });
      return;
    }

    if (!updates || typeof updates !== 'object') {
      res.status(400).json({
        status: 'error',
        message: 'updates object is required',
      });
      return;
    }

    const allowedUpdates = ['status', 'paymentStatus', 'fulfillmentStatus'];
    const updateKeys = Object.keys(updates);
    const hasInvalidUpdate = updateKeys.some((key) => !allowedUpdates.includes(key));

    if (hasInvalidUpdate) {
      res.status(400).json({
        status: 'error',
        message: `Only the following fields can be bulk updated: ${allowedUpdates.join(', ')}`,
      });
      return;
    }

    const results = {
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const orderId of orderIds) {
      try {
        const order = await Order.findById(orderId);
        if (!order) {
          results.failed++;
          results.errors.push(`Order ${orderId} not found`);
          continue;
        }

        if (updates.status) {
          order.mobileStatus.history.push({
            status: order.mobileStatus.current,
            timestamp: new Date(),
            note: `Bulk update: status changed to ${updates.status}`,
          });
          order.mobileStatus.current = updates.status as 'placed' | 'confirmed' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'returned';
        }

        if (updates.paymentStatus) {
          order.paymentStatus = updates.paymentStatus as 'pending' | 'paid' | 'failed' | 'refunded';
        }

        if (updates.fulfillmentStatus) {
          order.fulfillmentStatus = updates.fulfillmentStatus as 'unfulfilled' | 'partial' | 'fulfilled' | 'restocked' | 'cancelled';
        }

        await order.save();
        results.updated++;
      } catch (err) {
        results.failed++;
        results.errors.push(`Failed to update order ${orderId}`);
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Updated ${results.updated} orders, ${results.failed} failed`,
      data: results,
    });
  } catch (error) {
    console.error('Bulk update orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to bulk update orders',
    });
  }
};

/**
 * Add merchant note to order
 */
export const addMerchantNote = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params as { orderId: string };
    const { note } = req.body as { note?: string };

    if (!note || typeof note !== 'string') {
      res.status(400).json({
        status: 'error',
        message: 'Note is required',
      });
      return;
    }

    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
      return;
    }

    // Append to existing notes with timestamp
    const timestamp = new Date().toISOString();
    const existingNotes = order.merchantNotes || '';
    order.merchantNotes = existingNotes
      ? `${existingNotes}\n\n[${timestamp}]\n${note}`
      : `[${timestamp}]\n${note}`;

    await order.save();

    res.status(200).json({
      status: 'success',
      message: 'Note added successfully',
      data: { merchantNotes: order.merchantNotes },
    });
  } catch (error) {
    console.error('Add merchant note error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add note',
    });
  }
};
