import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import OrderTracking from '../models/OrderTracking';
import Product, { IProductDocument } from '../models/Product';

interface AuthenticatedRequest extends Request {
  user?: {
    _id: mongoose.Types.ObjectId;
    email: string;
    role: string;
    name: string;
    isActive: boolean;
  };
}

export const getUserOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate
    } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = { user: userId };

    if (status) {
      filter['mobileStatus.current'] = status;
    }

    if (startDate || endDate) {
      filter.placedAt = {};
      if (startDate) filter.placedAt.$gte = new Date(startDate as string);
      if (endDate) filter.placedAt.$lte = new Date(endDate as string);
    }

    const orders = await Order.find(filter)
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-notifications -supportTickets -returns -merchantNotes')
      .populate('lineItems.productId', 'title handle images');

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: pageNum,
          total: Math.ceil(total / limitNum),
          count: orders.length,
          totalOrders: total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

export const getOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id;

    const order = await Order.findById(orderId)
      .populate('lineItems.productId', 'title handle images price')
      .populate('user', 'name email');

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }

    // Check access permissions
    if (order.user.toString() !== userId?.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Get tracking information if available
    let tracking = null;
    if (order.shipping.trackingNumber) {
      tracking = await OrderTracking.findOne({
        trackingNumber: order.shipping.trackingNumber
      });
    }

    res.json({
      success: true,
      data: {
        order,
        tracking
      }
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
};

export const createOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const {
      lineItems,
      billingAddress,
      shippingAddress,
      shipping,
      specialInstructions,
      deliveryPreferences,
      source = 'mobile',
      channel = 'app',
      campaignId
    } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Validate required fields
    if (!lineItems || lineItems.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Order must contain at least one item'
      });
    }

    if (!billingAddress || !shippingAddress || !shipping) {
      res.status(400).json({
        success: false,
        message: 'Billing address, shipping address, and shipping method are required'
      });
    }

    // Validate and process line items
    const processedLineItems = [];
    let subtotalPrice = 0;

    for (const item of lineItems) {
      const product = await Product.findById(item.productId) as IProductDocument;
      if (!product || product.status !== 'active') {
        res.status(400).json({
          success: false,
          message: `Product ${item.productId} not found or not available`
        });
        return;
      }

      // Check inventory
      if (product.inventoryTracking.totalQuantity < item.quantity) {
        res.status(400).json({
          success: false,
          message: `Insufficient inventory for ${product.title}`
        });
        return;
      }

      const itemTotal = product.price * item.quantity;
      subtotalPrice += itemTotal;

      processedLineItems.push({
        productId: product._id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: product.price,
        title: product.title,
        sku: product.variants[0]?.sku || '',
        image: product.images[0]?.url,
        properties: item.properties || {}
      });
    }

    // Calculate totals (simplified - you'd want proper tax calculation)
    const totalTax = subtotalPrice * 0.08; // 8% tax rate example
    const totalPrice = subtotalPrice + totalTax + shipping.cost;

    // Create order
    const order = new Order({
      user: userId,
      email: req.user?.email,
      lineItems: processedLineItems,
      subtotalPrice,
      totalTax,
      totalPrice,
      currency: 'USD',
      billingAddress,
      shippingAddress,
      shipping,
      specialInstructions,
      deliveryPreferences: deliveryPreferences || {},
      source,
      channel,
      campaignId,
      notificationPreferences: {
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false
      }
    });

    await order.save();

    // Update product inventory
    for (const item of processedLineItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { 'inventoryTracking.totalQuantity': -item.quantity }
      });
    }

    // Send order confirmation notification
    await order.sendNotification(
      'email',
      'Order Confirmation',
      `Your order #${order.orderNumber} has been received and is being processed.`
    );

    res.status(201).json({
      success: true,
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          totalPrice: order.totalPrice,
          mobileStatus: order.mobileStatus,
          placedAt: order.placedAt
        }
      },
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
};

export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { status, note, location } = req.body;

    if (!status) {
      res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const validStatuses = ['placed', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
      return;
    }

    await order.updateMobileStatus(status, note, location);

    res.json({
      success: true,
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          mobileStatus: order.mobileStatus
        }
      },
      message: 'Order status updated successfully'
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

export const cancelOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const userId = req.user?._id;

    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!order.canBeCancelled()) {
      res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    await order.updateMobileStatus('cancelled', reason);

    // Restore inventory
    for (const item of order.lineItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { 'inventoryTracking.totalQuantity': item.quantity }
      });
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

export const requestReturn = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { type, reason, items } = req.body; // type: 'return' or 'exchange'
    const userId = req.user?._id;

    if (!['return', 'exchange'].includes(type)) {
      res.status(400).json({
        success: false,
        message: 'Invalid return type'
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!order.canBeReturned()) {
      res.status(400).json({
        success: false,
        message: 'Order cannot be returned'
      });
    }

    // Validate return items
    if (!items || items.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one item must be selected for return'
      });
    }

    // Generate return ID
    const returnId = `RET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const returnRequest = {
      id: returnId,
      type,
      status: 'requested',
      reason,
      items: items.map((item: any) => ({
        lineItemId: item.lineItemId,
        quantity: item.quantity,
        reason: item.reason
      })),
      requestedAt: new Date()
    };

    order.returns.push(returnRequest);
    await order.save();

    res.json({
      success: true,
      data: {
        returnId,
        status: 'requested'
      },
      message: 'Return request submitted successfully'
    });
  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit return request'
    });
  }
};

export const getOrderTracking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const userId = req.user?._id;

    const order = await Order.findById(orderId).select('user shipping mobileStatus');

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let tracking = null;
    if (order.shipping.trackingNumber) {
      tracking = await OrderTracking.findOne({
        trackingNumber: order.shipping.trackingNumber
      });
    }

    res.json({
      success: true,
      data: {
        orderStatus: order.mobileStatus,
        shipping: order.shipping,
        tracking: tracking ? {
          trackingNumber: tracking.trackingNumber,
          currentStatus: tracking.currentStatus,
          estimatedDelivery: tracking.estimatedDelivery,
          events: tracking.events,
          carrierInfo: tracking.carrierInfo
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching order tracking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tracking information'
    });
  }
};

export const rateOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const {
      overallRating,
      deliveryRating,
      packagingRating,
      productQualityRating,
      customerServiceRating,
      comment
    } = req.body;
    const userId = req.user?._id;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      res.status(400).json({
        success: false,
        message: 'Overall rating is required and must be between 1 and 5'
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (order.mobileStatus.current !== 'delivered') {
      res.status(400).json({
        success: false,
        message: 'Can only rate delivered orders'
      });
    }

    if (order.customerRating) {
      res.status(400).json({
        success: false,
        message: 'Order has already been rated'
      });
    }

    order.customerRating = {
      overallRating,
      deliveryRating,
      packagingRating,
      productQualityRating,
      customerServiceRating,
      comment: comment?.trim(),
      ratedAt: new Date()
    };

    await order.save();

    res.json({
      success: true,
      message: 'Order rated successfully',
      data: {
        rating: order.customerRating
      }
    });
  } catch (error) {
    console.error('Error rating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate order'
    });
  }
};

export const createSupportTicket = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { subject, priority = 'medium' } = req.body;
    const userId = req.user?._id;

    if (!subject || subject.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Subject is required'
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.user.toString() !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const ticketId = `TICKET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const ticket = {
      id: ticketId,
      subject: subject.trim(),
      status: 'open',
      priority,
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    order.supportTickets.push(ticket);
    await order.save();

    res.status(201).json({
      success: true,
      data: {
        ticket
      },
      message: 'Support ticket created successfully'
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket'
    });
  }
};

export const getOrderAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;
    const { timeframe = '30' } = req.query;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get user's order statistics
    const orderStats = await Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          placedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalPrice' },
          averageOrderValue: { $avg: '$totalPrice' },
          totalItems: { $sum: '$totalItems' }
        }
      }
    ]);

    // Get status distribution
    const statusDistribution = await Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId)
        }
      },
      {
        $group: {
          _id: '$mobileStatus.current',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get monthly spending trend
    const spendingTrend = await Order.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          placedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$placedAt'
            }
          },
          totalSpent: { $sum: '$totalPrice' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: orderStats[0] || {
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          totalItems: 0
        },
        statusDistribution,
        spendingTrend
      }
    });
  } catch (error) {
    console.error('Error fetching order analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
};