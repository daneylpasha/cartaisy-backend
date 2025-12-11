import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order';
import OrderTracking from '../models/OrderTracking';
import Product, { IProductDocument } from '../models/Product';
import Customer from '../models/Customer';
import { CustomerInfo } from '../middleware/customerAuth';

// Extend Request to include customer info from authenticateCustomer middleware
interface CustomerRequest extends Request {
  customer: CustomerInfo;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate unique order number
 */
const generateOrderNumber = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `ORD-${timestamp}${random}`.toUpperCase();
};

/**
 * Check if order status allows cancellation
 */
const canCancelOrder = (status: string): boolean => {
  return ['placed', 'confirmed', 'pending'].includes(status);
};

/**
 * Check if order status allows return
 */
const canReturnOrder = (status: string): boolean => {
  return status === 'delivered';
};

// =============================================================================
// CONTROLLER FUNCTIONS
// =============================================================================

/**
 * Get all orders for the authenticated customer
 */
export const getOrders = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const {
      status,
      limit = '20',
      page = '1',
      startDate,
      endDate
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter - query by either customer or user field for backwards compatibility
    const filter: any = { $or: [{ customer: customerId }, { user: customerId }] };

    if (status) {
      filter['mobileStatus.current'] = status;
    }

    if (startDate || endDate) {
      filter.placedAt = {};
      if (startDate) filter.placedAt.$gte = new Date(startDate as string);
      if (endDate) filter.placedAt.$lte = new Date(endDate as string);
    }

    // Fetch orders
    const orders = await Order.find(filter)
      .sort({ placedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-notifications -supportTickets -returns -merchantNotes')
      .lean();

    // Manually populate products for valid productIds
    const productIds = orders
      .flatMap(order => order.lineItems || [])
      .map((item: any) => item.productId)
      .filter(id => id);

    let productsMap: any = {};
    if (productIds.length > 0) {
      try {
        const products = await Product.find({ _id: { $in: productIds } })
          .select('title handle images')
          .lean();
        productsMap = products.reduce((acc: any, p: any) => {
          acc[p._id.toString()] = p;
          return acc;
        }, {});
      } catch (err) {
        console.warn('Error fetching products for orders:', err);
      }
    }

    // Attach product data to line items
    const ordersWithProducts = orders.map(order => ({
      ...order,
      lineItems: (order.lineItems || []).map((item: any) => ({
        ...item,
        product: item.productId ? productsMap[item.productId.toString()] || null : null
      }))
    }));

    const total = await Order.countDocuments(filter);

    res.status(200).json({
      status: 'success',
      data: {
        orders: ordersWithProducts,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch orders'
    });
  }
};

/**
 * Create a new order for the authenticated customer
 */
export const createOrder = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const {
      lineItems,
      shippingAddressId,
      billingAddressId,
      shipping,
      notes,
      source = 'mobile',
      channel = 'app'
    } = req.body;

    // Validate required fields
    if (!lineItems || lineItems.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Order must contain at least one item'
      });
      return;
    }

    if (shippingAddressId === undefined || !shipping) {
      res.status(400).json({
        status: 'error',
        message: 'Shipping address and shipping method are required'
      });
      return;
    }

    // Get customer and validate addresses
    const customer = await Customer.findById(customerId).select('addresses email name');
    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found'
      });
      return;
    }

    const shippingAddress = customer.addresses?.[shippingAddressId];
    if (!shippingAddress) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid shipping address'
      });
      return;
    }

    // Use shipping address as billing if not specified
    const billingIdx = billingAddressId !== undefined ? billingAddressId : shippingAddressId;
    const billingAddress = customer.addresses?.[billingIdx] || shippingAddress;

    // Validate and process line items
    const processedLineItems = [];
    let subtotalPrice = 0;

    for (const item of lineItems) {
      const product = await Product.findById(item.productId) as IProductDocument;
      if (!product || product.status !== 'active') {
        res.status(400).json({
          status: 'error',
          message: `Product ${item.productId} not found or not available`
        });
        return;
      }

      // Check inventory
      if (product.inventoryTracking && product.inventoryTracking.totalQuantity < item.quantity) {
        res.status(400).json({
          status: 'error',
          message: `Insufficient inventory for ${product.title}`
        });
        return;
      }

      const itemPrice = item.price || product.price;
      const itemTotal = itemPrice * item.quantity;
      subtotalPrice += itemTotal;

      processedLineItems.push({
        productId: product._id,
        variantId: item.variantId,
        quantity: item.quantity,
        price: itemPrice,
        title: product.title,
        sku: product.variants?.[0]?.sku || '',
        image: product.images?.[0]?.url,
        properties: item.properties || {}
      });
    }

    // Calculate totals (8% tax rate example)
    const taxRate = 0.08;
    const totalTax = subtotalPrice * taxRate;
    const shippingCost = shipping.cost || 0;
    const totalPrice = subtotalPrice + totalTax + shippingCost;

    // Format addresses for order
    const formatAddress = (addr: any) => ({
      firstName: addr.firstName || addr.name?.split(' ')[0] || '',
      lastName: addr.lastName || addr.name?.split(' ').slice(1).join(' ') || '',
      company: addr.company || '',
      address1: addr.address1 || addr.street || '',
      address2: addr.address2 || addr.apartment || '',
      city: addr.city || '',
      province: addr.province || addr.state || '',
      country: addr.country || '',
      zip: addr.zip || addr.postalCode || '',
      phone: addr.phone || ''
    });

    // Create order
    const order = new Order({
      customer: customerId,
      email: customer.email,
      lineItems: processedLineItems,
      subtotalPrice,
      totalTax,
      totalPrice,
      totalItems: processedLineItems.reduce((sum, item) => sum + item.quantity, 0),
      currency: 'USD',
      billingAddress: formatAddress(billingAddress),
      shippingAddress: formatAddress(shippingAddress),
      shipping: {
        method: shipping.method || 'Standard',
        cost: shippingCost,
        carrier: shipping.carrier || '',
        estimatedDelivery: shipping.estimatedDelivery
      },
      specialInstructions: notes,
      source,
      channel,
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

    // Update customer segmentation data
    await Customer.findByIdAndUpdate(customerId, {
      $set: { lastOrderDate: new Date() },
      $inc: { orderCount: 1, totalSpent: totalPrice }
    });

    // Send push notification (async, don't wait)
    setImmediate(() => {
      const { FirebaseNotificationService } = require('../services/firebaseNotificationService');
      FirebaseNotificationService.sendOrderNotification(order, 'confirmed').catch((err: any) => {
        console.error('Order confirmation push error:', err);
      });
    });

    res.status(201).json({
      status: 'success',
      message: 'Order created successfully',
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: order.mobileStatus?.current || 'placed',
          subtotal: subtotalPrice,
          tax: totalTax,
          shipping: shippingCost,
          total: totalPrice,
          currency: 'USD',
          itemCount: (order as any).totalItems || order.lineItems?.length || 0,
          placedAt: order.placedAt
        }
      }
    });
  } catch (error) {
    console.error('Create customer order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create order'
    });
  }
};

/**
 * Get a specific order by ID for the authenticated customer
 */
export const getOrder = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;

    // Fetch order and verify ownership
    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] }).lean();

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    // Manually populate products
    const productIds = (order.lineItems || [])
      .map((item: any) => item.productId)
      .filter((id: any) => id);

    let productsMap: any = {};
    if (productIds.length > 0) {
      try {
        const products = await Product.find({ _id: { $in: productIds } })
          .select('title handle images price')
          .lean();
        productsMap = products.reduce((acc: any, p: any) => {
          acc[p._id.toString()] = p;
          return acc;
        }, {});
      } catch (err) {
        console.warn('Error fetching products for order:', err);
      }
    }

    // Attach product data
    const orderWithProducts = {
      ...order,
      lineItems: (order.lineItems || []).map((item: any) => ({
        ...item,
        product: item.productId ? productsMap[item.productId.toString()] || null : null
      }))
    };

    // Get tracking information if available
    let tracking = null;
    if (order.shipping?.trackingNumber) {
      tracking = await OrderTracking.findOne({
        trackingNumber: order.shipping.trackingNumber
      }).lean();
    }

    res.status(200).json({
      status: 'success',
      data: {
        order: orderWithProducts,
        tracking
      }
    });
  } catch (error) {
    console.error('Get customer order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch order'
    });
  }
};

/**
 * Cancel an order for the authenticated customer
 */
export const cancelOrder = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] });

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    const currentStatus = order.mobileStatus?.current || 'placed';
    if (!canCancelOrder(currentStatus)) {
      res.status(403).json({
        status: 'error',
        message: 'Order cannot be cancelled at this stage'
      });
      return;
    }

    // Update order status
    if (typeof order.updateMobileStatus === 'function') {
      await order.updateMobileStatus('cancelled', reason);
    } else {
      // Fallback if method doesn't exist
      order.mobileStatus = {
        ...order.mobileStatus,
        current: 'cancelled',
        history: [
          ...(order.mobileStatus?.history || []),
          {
            status: 'cancelled',
            timestamp: new Date(),
            note: reason
          }
        ]
      };
      await order.save();
    }

    // Restore inventory
    for (const item of order.lineItems || []) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { 'inventoryTracking.totalQuantity': item.quantity }
        });
      }
    }

    // Send push notification (async, don't wait)
    setImmediate(() => {
      const { FirebaseNotificationService } = require('../services/firebaseNotificationService');
      FirebaseNotificationService.sendOrderNotification(order, 'cancelled').catch((err: any) => {
        console.error('Order cancellation push error:', err);
      });
    });

    res.status(200).json({
      status: 'success',
      message: 'Order cancelled successfully',
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber,
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason
        }
      }
    });
  } catch (error) {
    console.error('Cancel customer order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel order'
    });
  }
};

/**
 * Request a return for an order
 */
export const returnOrder = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;
    const { items, reason, type = 'return' } = req.body;

    if (!['return', 'exchange'].includes(type)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid return type. Must be "return" or "exchange"'
      });
      return;
    }

    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] });

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    const currentStatus = order.mobileStatus?.current || 'placed';
    if (!canReturnOrder(currentStatus)) {
      res.status(403).json({
        status: 'error',
        message: 'Only delivered orders can be returned'
      });
      return;
    }

    // Validate return items
    if (!items || items.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'At least one item must be selected for return'
      });
      return;
    }

    if (!reason) {
      res.status(400).json({
        status: 'error',
        message: 'Return reason is required'
      });
      return;
    }

    // Generate return ID
    const returnId = `RET-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    const returnRequest: any = {
      id: returnId,
      type,
      status: 'requested',
      reason,
      items: items.map((item: any) => ({
        lineItemId: item.lineItemId || item.productId,
        quantity: item.quantity,
        reason: item.reason || reason
      })),
      requestedAt: new Date()
    };

    // Initialize returns array if doesn't exist
    if (!order.returns) {
      order.returns = [];
    }
    order.returns.push(returnRequest);
    await order.save();

    res.status(200).json({
      status: 'success',
      message: 'Return request submitted successfully',
      data: {
        order: {
          id: order._id,
          orderNumber: order.orderNumber
        },
        returnRequest: {
          id: returnId,
          type,
          status: 'requested',
          reason,
          itemCount: items.length,
          requestedAt: returnRequest.requestedAt
        }
      }
    });
  } catch (error) {
    console.error('Return customer order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to submit return request'
    });
  }
};

/**
 * Get tracking information for an order
 */
export const getOrderTracking = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] })
      .select('orderNumber shipping mobileStatus')
      .lean();

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    let tracking = null;
    if (order.shipping?.trackingNumber) {
      const trackingDoc = await OrderTracking.findOne({
        trackingNumber: order.shipping.trackingNumber
      }).lean();

      if (trackingDoc) {
        tracking = {
          carrier: trackingDoc.carrier || order.shipping.carrier,
          trackingNumber: trackingDoc.trackingNumber,
          trackingUrl: (trackingDoc as any).trackingUrl || (order.shipping as any).trackingUrl,
          estimatedDelivery: trackingDoc.estimatedDelivery || order.shipping.estimatedDelivery,
          currentStatus: trackingDoc.currentStatus,
          events: trackingDoc.events || []
        };
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        tracking: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.mobileStatus?.current || 'placed',
          carrier: tracking?.carrier || order.shipping?.carrier || null,
          trackingNumber: tracking?.trackingNumber || order.shipping?.trackingNumber || null,
          trackingUrl: tracking?.trackingUrl || order.shipping?.trackingUrl || null,
          estimatedDelivery: tracking?.estimatedDelivery || order.shipping?.estimatedDelivery || null,
          events: tracking?.events || order.mobileStatus?.history?.map((h: any) => ({
            status: h.status,
            location: h.location,
            timestamp: h.timestamp,
            description: h.note || `Order ${h.status}`
          })) || []
        }
      }
    });
  } catch (error) {
    console.error('Get customer order tracking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch tracking information'
    });
  }
};

/**
 * Rate a delivered order
 */
export const rateOrder = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;
    const {
      rating,
      review,
      deliveryRating,
      packagingRating,
      productQualityRating,
      customerServiceRating
    } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({
        status: 'error',
        message: 'Rating is required and must be between 1 and 5'
      });
      return;
    }

    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] });

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    const currentStatus = order.mobileStatus?.current || 'placed';
    if (currentStatus !== 'delivered') {
      res.status(403).json({
        status: 'error',
        message: 'Can only rate delivered orders'
      });
      return;
    }

    if (order.customerRating) {
      res.status(400).json({
        status: 'error',
        message: 'Order has already been rated'
      });
      return;
    }

    order.customerRating = {
      overallRating: rating,
      deliveryRating,
      packagingRating,
      productQualityRating,
      customerServiceRating,
      comment: review?.trim(),
      ratedAt: new Date()
    };

    await order.save();

    res.status(200).json({
      status: 'success',
      message: 'Order rated successfully',
      data: {
        rating: order.customerRating.overallRating,
        review: order.customerRating.comment || null
      }
    });
  } catch (error) {
    console.error('Rate customer order error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to rate order'
    });
  }
};

/**
 * Create a support ticket for an order
 */
export const createSupportTicket = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { orderId } = req.params;
    const { subject, message, priority = 'medium' } = req.body;

    if (!subject || subject.trim().length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Subject is required'
      });
      return;
    }

    const order = await Order.findOne({ _id: orderId, $or: [{ customer: customerId }, { user: customerId }] });

    if (!order) {
      res.status(404).json({
        status: 'error',
        message: 'Order not found'
      });
      return;
    }

    const ticketNumber = `TKT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;

    const ticket: any = {
      id: ticketNumber,
      subject: subject.trim(),
      status: 'open',
      priority: ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium',
      messages: message ? [{
        content: message.trim(),
        sender: 'customer',
        timestamp: new Date()
      }] : [],
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    // Initialize supportTickets array if doesn't exist
    if (!order.supportTickets) {
      order.supportTickets = [];
    }
    order.supportTickets.push(ticket);
    await order.save();

    res.status(201).json({
      status: 'success',
      message: 'Support ticket created successfully',
      data: {
        ticket: {
          id: ticketNumber,
          ticketNumber,
          status: 'open',
          subject: ticket.subject,
          message: message || null,
          priority: ticket.priority,
          createdAt: ticket.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Create customer support ticket error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create support ticket'
    });
  }
};

/**
 * Get order analytics for the authenticated customer
 */
export const getOrderAnalytics = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { timeframe = '365' } = req.query;

    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get customer's order statistics
    const customerObjectId = new mongoose.Types.ObjectId(customerId);
    const orderStats = await Order.aggregate([
      {
        $match: {
          $or: [{ customer: customerObjectId }, { user: customerObjectId }],
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

    // Get status distribution (all time)
    const statusDistribution = await Order.aggregate([
      {
        $match: {
          $or: [{ customer: customerObjectId }, { user: customerObjectId }]
        }
      },
      {
        $group: {
          _id: '$mobileStatus.current',
          count: { $sum: 1 }
        }
      }
    ]);

    // Format status distribution as object
    const ordersByStatus: Record<string, number> = {};
    statusDistribution.forEach((item: any) => {
      ordersByStatus[item._id || 'unknown'] = item.count;
    });

    // Get recent orders
    const recentOrders = await Order.find({ $or: [{ customer: customerId }, { user: customerId }] })
      .sort({ placedAt: -1 })
      .limit(5)
      .select('orderNumber totalPrice mobileStatus.current placedAt')
      .lean();

    // Get favorite products (most ordered)
    const favoriteProducts = await Order.aggregate([
      {
        $match: {
          $or: [{ customer: customerObjectId }, { user: customerObjectId }]
        }
      },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: '$lineItems.productId',
          title: { $first: '$lineItems.title' },
          image: { $first: '$lineItems.image' },
          orderCount: { $sum: 1 },
          totalQuantity: { $sum: '$lineItems.quantity' }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);

    const stats = orderStats[0] || {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      totalItems: 0
    };

    res.status(200).json({
      status: 'success',
      data: {
        analytics: {
          totalOrders: stats.totalOrders,
          totalSpent: Math.round(stats.totalSpent * 100) / 100,
          averageOrderValue: Math.round(stats.averageOrderValue * 100) / 100,
          ordersByStatus,
          recentOrders: recentOrders.map((order: any) => ({
            id: order._id,
            orderNumber: order.orderNumber,
            total: order.totalPrice,
            status: order.mobileStatus?.current || 'placed',
            placedAt: order.placedAt
          })),
          favoriteProducts: favoriteProducts.map((p: any) => ({
            productId: p._id,
            title: p.title,
            image: p.image,
            orderCount: p.orderCount,
            totalQuantity: p.totalQuantity
          }))
        }
      }
    });
  } catch (error) {
    console.error('Get customer order analytics error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch order analytics'
    });
  }
};
