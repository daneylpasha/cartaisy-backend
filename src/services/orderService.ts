import mongoose from 'mongoose';
import Order from '../models/Order';
import Product from '../models/Product';
import User from '../models/User';
import { createOrder as createShopifyOrder, reduceShopifyInventoryForOrder } from './shopifyService';
import { reserveInventory, releaseInventory, checkInventoryAvailability } from './inventoryService';
import { tenantConfig } from '../config/tenant';
import { IOrder, IProduct, IUser, IAddress, IOrderLineItem, IMobileStatusHistory } from '../types/index';
import { ApiError } from '../utils/errors';

interface ProcessedCartItem {
  product: IProduct;
  variant?: any;
  variantId?: string;
  quantity: number;
  price: number;
  customizations?: { [key: string]: string };
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

interface ReservationInfo {
  productId: string;
  variantId?: string;
  quantity: number;
  reservationId?: string;
}

interface TrackingInfo {
  trackingNumber: string;
  carrier?: string;
  trackingUrl?: string;
  estimatedDelivery?: Date;
}

interface ICartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  customizations?: { [key: string]: string };
}

interface IShippingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

interface IOrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
}

/**
 * Create a mobile order with full processing pipeline
 */
export const createMobileOrder = async (
  userId: string,
  cartData: {
    items: ICartItem[];
    billingAddress: IShippingAddress;
    shippingAddress: IShippingAddress;
    shippingMethod: string;
    specialInstructions?: string;
    deliveryPreferences?: any;
    paymentToken?: string;
    campaignId?: string;
  }
): Promise<{ order: IOrder; shopifyOrder?: any }> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate user
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // 2. Validate and process cart items
    const processedItems = await validateAndProcessCartItems(cartData.items, session);

    // 3. Calculate order totals
    const totals = await calculateOrderTotals(processedItems, cartData.shippingAddress);

    // 4. Reserve inventory
    const reservations = await reserveInventoryForOrder(processedItems);

    try {
      // 5. Process payment (if payment token provided)
      let paymentResult;
      if (cartData.paymentToken) {
        paymentResult = await processPayment({
          amount: totals.total,
          currency: totals.currency,
          paymentToken: cartData.paymentToken,
          userId,
          email: user.email
        });

        if (!paymentResult.success) {
          throw new Error(`Payment failed: ${paymentResult.error}`);
        }
      }

      // 6. Create order in our database
      const orderData = {
        user: userId,
        email: user.email,
        lineItems: processedItems.map(item => ({
          productId: item.product._id,
          variantId: item.variantId,
          quantity: item.quantity,
          price: item.price,
          title: item.product.title,
          sku: item.variant?.sku || item.product.sku,
          image: item.product.images[0]?.url,
          properties: item.customizations || {}
        })),
        
        subtotalPrice: totals.subtotal,
        totalTax: totals.tax,
        totalPrice: totals.total,
        currency: totals.currency,
        
        billingAddress: cartData.billingAddress,
        shippingAddress: cartData.shippingAddress,
        
        shipping: {
          method: cartData.shippingMethod,
          cost: totals.shipping
        },
        
        financialStatus: cartData.paymentToken ? 'paid' : 'pending',
        fulfillmentStatus: 'unfulfilled',
        
        mobileStatus: {
          current: 'placed',
          history: [{
            status: 'placed',
            timestamp: new Date(),
            note: 'Order placed via mobile app'
          }]
        },
        
        specialInstructions: cartData.specialInstructions,
        deliveryPreferences: cartData.deliveryPreferences || {},
        
        source: 'mobile',
        channel: 'app',
        campaignId: cartData.campaignId,
        
        notificationPreferences: {
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false
        }
      };

      const order = new Order(orderData);
      await order.save({ session });

      // 7. Create order in Shopify (if configured)
      let shopifyOrder;
      if (tenantConfig.shopify.storeUrl && tenantConfig.shopify.accessToken) {
        try {
          shopifyOrder = await createShopifyOrder({
            email: user.email,
            lineItems: processedItems.map(item => ({
              variantId: item.variantId || item.product.variants[0]?.id,
              quantity: item.quantity
            })) as any,
            billingAddress: cartData.billingAddress,
            shippingAddress: cartData.shippingAddress,
            specialInstructions: cartData.specialInstructions
          });

          // Update order with Shopify ID
          order.shopifyOrderId = shopifyOrder.id.toString();
          order.shopifyOrderNumber = shopifyOrder.order_number.toString();
          await order.save({ session });

          console.log(`📋 Created Shopify order: ${shopifyOrder.order_number}`);
        } catch (shopifyError) {
          console.error('Failed to create Shopify order:', shopifyError);
          // Continue with local order, log for manual sync later
        }
      }

      // 8. Update inventory
      await commitInventoryReservations(reservations);

      // 9. Send order confirmation
      await sendOrderConfirmation(order._id.toString());

      // 10. Update order status to confirmed
      await order.updateMobileStatus('confirmed', 'Order confirmed and being processed');

      await session.commitTransaction();
      
      console.log(`✅ Created mobile order: ${order.orderNumber}`);
      return { order, shopifyOrder };

    } catch (error) {
      // Release reservations on any error
      await releaseOrderReservations(reservations);
      throw error;
    }

  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating mobile order:', error);
    throw new ApiError('Failed to create mobile order', 500);
  } finally {
    session.endSession();
  }
};

/**
 * Calculate comprehensive order totals including taxes and shipping
 */
export const calculateOrderTotals = async (
  items: ProcessedCartItem[],
  shippingAddress: IShippingAddress
): Promise<IOrderTotals> => {
  try {
    // Calculate subtotal
    const subtotal = items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);

    // Calculate tax (simplified - in production, use tax service like Avalara)
    const taxRate = calculateTaxRate(shippingAddress);
    const tax = subtotal * taxRate;

    // Calculate shipping
    const shipping = await calculateShippingCost(items, shippingAddress);

    const total = subtotal + tax + shipping;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping: Math.round(shipping * 100) / 100,
      total: Math.round(total * 100) / 100,
      currency: tenantConfig.store.currency
    };
  } catch (error) {
    console.error('Error calculating order totals:', error);
    throw new ApiError('Failed to calculate order totals', 500);
  }
};

/**
 * Process payment using configured payment provider
 */
export const processPayment = async (paymentData: {
  amount: number;
  currency: string;
  paymentToken: string;
  userId: string;
  email: string;
}): Promise<PaymentResult> => {
  try {
    // This is a simplified payment processing example
    // In production, integrate with Stripe, PayPal, or other payment providers
    
    if (tenantConfig.payments.stripe.secretKey) {
      // Stripe integration example
      // const stripe = require('stripe')(tenantConfig.payments.stripe.secretKey);
      // const paymentIntent = await stripe.paymentIntents.create({
      //   amount: Math.round(paymentData.amount * 100), // Stripe uses cents
      //   currency: paymentData.currency.toLowerCase(),
      //   payment_method: paymentData.paymentToken,
      //   confirm: true,
      //   metadata: {
      //     userId: paymentData.userId,
      //     email: paymentData.email
      //   }
      // });
      
      // For now, simulate successful payment
      console.log(`💳 Processing payment: $${paymentData.amount} for user ${paymentData.email}`);
      
      return {
        success: true,
        transactionId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    }

    // If no payment provider configured, mark as pending
    return {
      success: true,
      transactionId: 'pending_payment'
    };

  } catch (error) {
    console.error('Payment processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment processing failed'
    };
  }
};

/**
 * Mark order as fulfilled with tracking information
 */
export const fulfillOrder = async (
  orderId: string,
  trackingInfo: TrackingInfo
): Promise<void> => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Update shipping information
    order.shipping.trackingNumber = trackingInfo.trackingNumber;
    order.shipping.carrier = trackingInfo.carrier;
    order.shipping.trackingUrl = trackingInfo.trackingUrl;
    order.shipping.estimatedDelivery = trackingInfo.estimatedDelivery;

    // Update status
    order.fulfillmentStatus = 'fulfilled';
    order.shippedAt = new Date();

    await order.updateMobileStatus(
      'shipped',
      `Order shipped with tracking: ${trackingInfo.trackingNumber}`,
      undefined
    );

    await order.save();

    // Send shipping notification
    await order.sendNotification(
      'push',
      'Order Shipped!',
      `Your order #${order.orderNumber} has been shipped. Track it: ${trackingInfo.trackingNumber}`
    );

    console.log(`📦 Fulfilled order: ${order.orderNumber}`);
  } catch (error) {
    console.error('Error fulfilling order:', error);
    throw new ApiError('Failed to fulfill order', 500);
  }
};

/**
 * Process order refund
 */
export const handleOrderRefund = async (
  orderId: string,
  amount: number,
  reason: string,
  items?: Array<{ lineItemId: string; quantity: number }>
): Promise<void> => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Create return record
    const returnId = `RET-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const returnData = {
      id: returnId,
      type: 'return' as const,
      status: 'approved',
      reason,
      items: items || order.lineItems.map((item: any, index: number) => ({
        lineItemId: item._id?.toString() || `item-${index}`,
        quantity: item.quantity,
        reason
      })),
      requestedAt: new Date(),
      processedAt: new Date(),
      refundAmount: amount
    };

    order.returns.push(returnData as any);

    // Update financial status
    if (amount >= order.totalPrice) {
      order.financialStatus = 'refunded';
    } else {
      order.financialStatus = 'partially_refunded';
    }

    // Update mobile status
    await order.updateMobileStatus(
      'returned',
      `Refund processed: $${amount}`,
      undefined
    );

    // Process actual refund (integrate with payment provider)
    // For now, just log
    console.log(`💰 Processing refund: $${amount} for order ${order.orderNumber}`);

    await order.save();

    // Send refund notification
    await order.sendNotification(
      'email',
      'Refund Processed',
      `Your refund of $${amount} for order #${order.orderNumber} has been processed.`
    );

    console.log(`💰 Processed refund for order: ${order.orderNumber}`);
  } catch (error) {
    console.error('Error processing refund:', error);
    throw new ApiError('Failed to process refund', 500);
  }
};

/**
 * Send order confirmation email/notification
 */
export const sendOrderConfirmation = async (orderId: string): Promise<void> => {
  try {
    const order = await Order.findById(orderId)
      .populate('user', 'name email')
      .populate('lineItems.productId', 'title images');

    if (!order) {
      throw new Error('Order not found');
    }

    // Send email confirmation
    await order.sendNotification(
      'email',
      'Order Confirmation',
      `Thank you for your order #${order.orderNumber}! We've received your order and will send you updates as it's processed.`
    );

    // Send push notification
    await order.sendNotification(
      'push',
      'Order Confirmed!',
      `Your order #${order.orderNumber} has been confirmed. Total: $${order.totalPrice}`
    );

    console.log(`📧 Sent order confirmation for: ${order.orderNumber}`);
  } catch (error) {
    console.error('Error sending order confirmation:', error);
    throw new ApiError('Failed to send order confirmation', 500);
  }
};

/**
 * Enhanced order tracking with real-time updates
 */
interface OrderTrackingResponse {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalPrice: number;
    currency: string;
    placedAt: Date;
    estimatedDelivery?: Date;
  };
  tracking: any;
  timeline: IMobileStatusHistory[];
  canBeCancelled: boolean;
  canBeReturned: boolean;
}

export const trackOrderProgress = async (orderId: string): Promise<OrderTrackingResponse> => {
  try {
    const order = await Order.findById(orderId)
      .populate('lineItems.productId', 'title images')
      .populate('user', 'name email');

    if (!order) {
      throw new Error('Order not found');
    }

    // Get additional tracking info if available
    let trackingDetails = null;
    if (order.shipping.trackingNumber) {
      // Integrate with carrier APIs (FedEx, UPS, USPS, etc.)
      // For now, return mock tracking data
      trackingDetails = {
        trackingNumber: order.shipping.trackingNumber,
        carrier: order.shipping.carrier,
        status: order.mobileStatus.current,
        estimatedDelivery: order.shipping.estimatedDelivery,
        trackingEvents: order.mobileStatus.history.map(event => ({
          status: event.status,
          timestamp: event.timestamp,
          location: event.location,
          description: event.note
        }))
      };
    }

    return {
      order: {
        id: order._id.toString(),
        orderNumber: order.orderNumber,
        status: order.mobileStatus.current,
        totalPrice: order.totalPrice,
        currency: order.currency,
        placedAt: order.placedAt,
        estimatedDelivery: order.shipping.estimatedDelivery
      },
      tracking: trackingDetails,
      timeline: order.mobileStatus.history,
      canBeCancelled: order.canBeCancelled(),
      canBeReturned: order.canBeReturned()
    };
  } catch (error) {
    console.error('Error tracking order progress:', error);
    throw new ApiError('Failed to track order progress', 500);
  }
};

/**
 * Handle order cancellation
 */
export const handleOrderCancellation = async (
  orderId: string,
  reason: string,
  userId?: string
): Promise<void> => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Verify cancellation is allowed
    if (!order.canBeCancelled()) {
      throw new Error('Order cannot be cancelled at this stage');
    }

    // Verify user permission (if userId provided)
    if (userId && order.user.toString() !== userId) {
      throw new Error('Unauthorized to cancel this order');
    }

    // Update order status
    await order.updateMobileStatus('cancelled', reason);
    order.cancelledAt = new Date();

    // Process refund if payment was made
    if (order.financialStatus === 'paid') {
      await handleOrderRefund(orderId, order.totalPrice, `Order cancelled: ${reason}`);
    }

    // Restore inventory
    for (const item of order.lineItems) {
      try {
        const product = await Product.findById(item.productId);
        if (product) {
          // Find matching variant or update total quantity
          if (item.variantId) {
            const variant = product.variants.find(v => v.id === item.variantId);
            if (variant) {
              variant.inventory.quantity += item.quantity;
            }
          }
          
          product.inventoryTracking.totalQuantity += item.quantity;
          
          // Add to inventory history
          product.inventoryTracking.history.push({
            date: new Date(),
            change: item.quantity,
            newQuantity: product.inventoryTracking.totalQuantity,
            reason: 'order_cancelled',
            note: `Inventory restored from cancelled order ${order.orderNumber}`
          });
          
          await product.save();
        }
      } catch (inventoryError) {
        console.error(`Error restoring inventory for item ${item.productId}:`, inventoryError);
      }
    }

    await order.save();

    // Send cancellation notification
    await order.sendNotification(
      'email',
      'Order Cancelled',
      `Your order #${order.orderNumber} has been cancelled. ${reason}`
    );

    console.log(`❌ Cancelled order: ${order.orderNumber}`);
  } catch (error) {
    console.error('Error cancelling order:', error);
    throw new ApiError('Failed to cancel order', 500);
  }
};

// Helper functions

async function validateAndProcessCartItems(items: ICartItem[], session: mongoose.ClientSession): Promise<ProcessedCartItem[]> {
  const processedItems = [];

  for (const item of items) {
    const product = await Product.findById(item.productId).session(session);
    if (!product || product.status !== 'active') {
      throw new Error(`Product ${item.productId} not found or inactive`);
    }

    // Check inventory availability
    const availability = await checkInventoryAvailability(
      item.productId,
      item.quantity,
      item.variantId
    );

    if (!availability.available) {
      throw new Error(`Insufficient inventory for ${product.title}`);
    }

    // Get variant info and price
    let variant = null;
    let price = product.price;

    if (item.variantId) {
      variant = product.variants.find(v => v.id === item.variantId);
      if (!variant) {
        throw new Error(`Variant ${item.variantId} not found for product ${product.title}`);
      }
      price = variant.price;
    }

    processedItems.push({
      product,
      variant,
      variantId: item.variantId,
      quantity: item.quantity,
      price,
      customizations: item.customizations
    });
  }

  return processedItems;
}

async function reserveInventoryForOrder(items: ProcessedCartItem[]): Promise<ReservationInfo[]> {
  const reservations = [];
  const tempOrderId = `temp_${Date.now()}`;

  for (const item of items) {
    const reservation = await reserveInventory(
      item.product._id.toString(),
      item.quantity,
      tempOrderId,
      item.variantId,
      30 // 30 minutes reservation
    );

    if (!reservation.success) {
      // Release any previous reservations
      for (const prevReservation of reservations) {
        await releaseInventory(
          prevReservation.productId,
          prevReservation.quantity,
          tempOrderId,
          prevReservation.variantId
        );
      }
      throw new Error(`Failed to reserve inventory for ${item.product.title}`);
    }

    reservations.push({
      productId: item.product._id.toString(),
      variantId: item.variantId,
      quantity: item.quantity,
      reservationId: reservation.reservationId
    });
  }

  return reservations;
}

async function commitInventoryReservations(reservations: ReservationInfo[]): Promise<void> {
  // Collect items for Shopify inventory update
  const shopifyItems: Array<{ inventoryItemId: string; quantity: number }> = [];

  // Update local database inventory
  for (const reservation of reservations) {
    const product = await Product.findById(reservation.productId);
    if (product) {
      if (reservation.variantId) {
        const variant = product.variants.find(v => v.id === reservation.variantId);
        if (variant) {
          variant.inventory.quantity -= reservation.quantity;

          // Collect inventoryItemId for Shopify update
          if (variant.inventoryItemId) {
            shopifyItems.push({
              inventoryItemId: variant.inventoryItemId,
              quantity: reservation.quantity
            });
          }
        }
      }

      product.inventoryTracking.totalQuantity -= reservation.quantity;

      // Add to inventory history
      product.inventoryTracking.history.push({
        date: new Date(),
        change: -reservation.quantity,
        newQuantity: product.inventoryTracking.totalQuantity,
        reason: 'order_placed',
        note: 'Inventory deducted for completed order'
      });

      await product.save();
    }
  }

  // Update Shopify inventory (async, don't block order completion)
  if (shopifyItems.length > 0) {
    reduceShopifyInventoryForOrder(shopifyItems)
      .then(result => {
        if (result.errors.length > 0) {
          console.warn('Shopify inventory sync errors:', result.errors);
        } else {
          console.log(`✅ Shopify inventory updated for ${shopifyItems.length} items`);
        }
      })
      .catch(err => {
        console.error('Failed to update Shopify inventory:', err);
      });
  }
}

async function releaseOrderReservations(reservations: ReservationInfo[]): Promise<void> {
  const tempOrderId = `temp_${Date.now()}`;
  
  for (const reservation of reservations) {
    await releaseInventory(
      reservation.productId,
      reservation.quantity,
      tempOrderId,
      reservation.variantId
    );
  }
}

function calculateTaxRate(address: IShippingAddress): number {
  // Simplified tax calculation - in production, use proper tax service
  const taxRates: { [key: string]: number } = {
    'CA': 0.0875, // California
    'NY': 0.08,   // New York
    'TX': 0.0625, // Texas
    'FL': 0.06,   // Florida
    // Add more states/provinces as needed
  };

  return taxRates[address.province] || 0.05; // Default 5% tax
}

async function calculateShippingCost(items: ProcessedCartItem[], address: IShippingAddress): Promise<number> {
  // Simplified shipping calculation
  const totalWeight = items.reduce((weight, item) => {
    return weight + (item.product.weight || 1) * item.quantity;
  }, 0);

  const storeConfig = tenantConfig.store as any;
  const baseShipping = storeConfig.shipping?.baseCost || 5;
  const freeShippingThreshold = storeConfig.shipping?.freeShippingThreshold || 50;
  
  const subtotal = items.reduce((total, item) => total + (item.price * item.quantity), 0);

  // Free shipping over threshold
  if (subtotal >= freeShippingThreshold) {
    return 0;
  }

  // Weight-based shipping
  const weightMultiplier = Math.ceil(totalWeight / 5); // $5 per 5 pounds
  const shippingCost = Math.max(baseShipping, weightMultiplier * 5);

  return shippingCost;
}