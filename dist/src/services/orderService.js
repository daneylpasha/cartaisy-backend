"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOrderCancellation = exports.trackOrderProgress = exports.sendOrderConfirmation = exports.handleOrderRefund = exports.fulfillOrder = exports.processPayment = exports.calculateOrderTotals = exports.createMobileOrder = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Order_1 = __importDefault(require("../models/Order"));
const Product_1 = __importDefault(require("../models/Product"));
const User_1 = __importDefault(require("../models/User"));
const shopifyService_1 = require("./shopifyService");
const inventoryService_1 = require("./inventoryService");
const tenant_1 = require("../config/tenant");
const errors_1 = require("../utils/errors");
/**
 * Create a mobile order with full processing pipeline
 */
const createMobileOrder = async (userId, cartData) => {
    const session = await mongoose_1.default.startSession();
    session.startTransaction();
    try {
        // 1. Validate user
        const user = await User_1.default.findById(userId).session(session);
        if (!user) {
            throw new Error('User not found');
        }
        // 2. Validate and process cart items
        const processedItems = await validateAndProcessCartItems(cartData.items, session);
        // 3. Calculate order totals
        const totals = await (0, exports.calculateOrderTotals)(processedItems, cartData.shippingAddress);
        // 4. Reserve inventory
        const reservations = await reserveInventoryForOrder(processedItems);
        try {
            // 5. Process payment (if payment token provided)
            let paymentResult;
            if (cartData.paymentToken) {
                paymentResult = await (0, exports.processPayment)({
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
            const order = new Order_1.default(orderData);
            await order.save({ session });
            // 7. Create order in Shopify (if configured)
            let shopifyOrder;
            if (tenant_1.tenantConfig.shopify.storeUrl && tenant_1.tenantConfig.shopify.accessToken) {
                try {
                    shopifyOrder = await (0, shopifyService_1.createOrder)({
                        email: user.email,
                        lineItems: processedItems.map(item => ({
                            variantId: item.variantId || item.product.variants[0]?.id,
                            quantity: item.quantity
                        })),
                        billingAddress: cartData.billingAddress,
                        shippingAddress: cartData.shippingAddress,
                        specialInstructions: cartData.specialInstructions
                    });
                    // Update order with Shopify ID
                    order.shopifyOrderId = shopifyOrder.id.toString();
                    order.shopifyOrderNumber = shopifyOrder.order_number.toString();
                    await order.save({ session });
                    console.log(`📋 Created Shopify order: ${shopifyOrder.order_number}`);
                }
                catch (shopifyError) {
                    console.error('Failed to create Shopify order:', shopifyError);
                    // Continue with local order, log for manual sync later
                }
            }
            // 8. Update inventory
            await commitInventoryReservations(reservations);
            // 9. Send order confirmation
            await (0, exports.sendOrderConfirmation)(order._id.toString());
            // 10. Update order status to confirmed
            await order.updateMobileStatus('confirmed', 'Order confirmed and being processed');
            await session.commitTransaction();
            console.log(`✅ Created mobile order: ${order.orderNumber}`);
            return { order, shopifyOrder };
        }
        catch (error) {
            // Release reservations on any error
            await releaseOrderReservations(reservations);
            throw error;
        }
    }
    catch (error) {
        await session.abortTransaction();
        console.error('Error creating mobile order:', error);
        throw new errors_1.ApiError('Failed to create mobile order', 500);
    }
    finally {
        session.endSession();
    }
};
exports.createMobileOrder = createMobileOrder;
/**
 * Calculate comprehensive order totals including taxes and shipping
 */
const calculateOrderTotals = async (items, shippingAddress) => {
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
            currency: tenant_1.tenantConfig.store.currency
        };
    }
    catch (error) {
        console.error('Error calculating order totals:', error);
        throw new errors_1.ApiError('Failed to calculate order totals', 500);
    }
};
exports.calculateOrderTotals = calculateOrderTotals;
/**
 * Process payment using configured payment provider
 */
const processPayment = async (paymentData) => {
    try {
        // This is a simplified payment processing example
        // In production, integrate with Stripe, PayPal, or other payment providers
        if (tenant_1.tenantConfig.payments.stripe.secretKey) {
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
    }
    catch (error) {
        console.error('Payment processing error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Payment processing failed'
        };
    }
};
exports.processPayment = processPayment;
/**
 * Mark order as fulfilled with tracking information
 */
const fulfillOrder = async (orderId, trackingInfo) => {
    try {
        const order = await Order_1.default.findById(orderId);
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
        await order.updateMobileStatus('shipped', `Order shipped with tracking: ${trackingInfo.trackingNumber}`, undefined);
        await order.save();
        // Send shipping notification
        await order.sendNotification('push', 'Order Shipped!', `Your order #${order.orderNumber} has been shipped. Track it: ${trackingInfo.trackingNumber}`);
        console.log(`📦 Fulfilled order: ${order.orderNumber}`);
    }
    catch (error) {
        console.error('Error fulfilling order:', error);
        throw new errors_1.ApiError('Failed to fulfill order', 500);
    }
};
exports.fulfillOrder = fulfillOrder;
/**
 * Process order refund
 */
const handleOrderRefund = async (orderId, amount, reason, items) => {
    try {
        const order = await Order_1.default.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }
        // Create return record
        const returnId = `RET-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const returnData = {
            id: returnId,
            type: 'return',
            status: 'approved',
            reason,
            items: items || order.lineItems.map(item => ({
                lineItemId: item._id.toString(),
                quantity: item.quantity,
                reason
            })),
            requestedAt: new Date(),
            processedAt: new Date(),
            refundAmount: amount
        };
        order.returns.push(returnData);
        // Update financial status
        if (amount >= order.totalPrice) {
            order.financialStatus = 'refunded';
        }
        else {
            order.financialStatus = 'partially_refunded';
        }
        // Update mobile status
        await order.updateMobileStatus('returned', `Refund processed: $${amount}`, undefined);
        // Process actual refund (integrate with payment provider)
        // For now, just log
        console.log(`💰 Processing refund: $${amount} for order ${order.orderNumber}`);
        await order.save();
        // Send refund notification
        await order.sendNotification('email', 'Refund Processed', `Your refund of $${amount} for order #${order.orderNumber} has been processed.`);
        console.log(`💰 Processed refund for order: ${order.orderNumber}`);
    }
    catch (error) {
        console.error('Error processing refund:', error);
        throw new errors_1.ApiError('Failed to process refund', 500);
    }
};
exports.handleOrderRefund = handleOrderRefund;
/**
 * Send order confirmation email/notification
 */
const sendOrderConfirmation = async (orderId) => {
    try {
        const order = await Order_1.default.findById(orderId)
            .populate('user', 'name email')
            .populate('lineItems.productId', 'title images');
        if (!order) {
            throw new Error('Order not found');
        }
        // Send email confirmation
        await order.sendNotification('email', 'Order Confirmation', `Thank you for your order #${order.orderNumber}! We've received your order and will send you updates as it's processed.`);
        // Send push notification
        await order.sendNotification('push', 'Order Confirmed!', `Your order #${order.orderNumber} has been confirmed. Total: $${order.totalPrice}`);
        console.log(`📧 Sent order confirmation for: ${order.orderNumber}`);
    }
    catch (error) {
        console.error('Error sending order confirmation:', error);
        throw new errors_1.ApiError('Failed to send order confirmation', 500);
    }
};
exports.sendOrderConfirmation = sendOrderConfirmation;
const trackOrderProgress = async (orderId) => {
    try {
        const order = await Order_1.default.findById(orderId)
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
                id: order._id,
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
    }
    catch (error) {
        console.error('Error tracking order progress:', error);
        throw new errors_1.ApiError('Failed to track order progress', 500);
    }
};
exports.trackOrderProgress = trackOrderProgress;
/**
 * Handle order cancellation
 */
const handleOrderCancellation = async (orderId, reason, userId) => {
    try {
        const order = await Order_1.default.findById(orderId);
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
            await (0, exports.handleOrderRefund)(orderId, order.totalPrice, `Order cancelled: ${reason}`);
        }
        // Restore inventory
        for (const item of order.lineItems) {
            try {
                const product = await Product_1.default.findById(item.productId);
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
            }
            catch (inventoryError) {
                console.error(`Error restoring inventory for item ${item.productId}:`, inventoryError);
            }
        }
        await order.save();
        // Send cancellation notification
        await order.sendNotification('email', 'Order Cancelled', `Your order #${order.orderNumber} has been cancelled. ${reason}`);
        console.log(`❌ Cancelled order: ${order.orderNumber}`);
    }
    catch (error) {
        console.error('Error cancelling order:', error);
        throw new errors_1.ApiError('Failed to cancel order', 500);
    }
};
exports.handleOrderCancellation = handleOrderCancellation;
// Helper functions
async function validateAndProcessCartItems(items, session) {
    const processedItems = [];
    for (const item of items) {
        const product = await Product_1.default.findById(item.productId).session(session);
        if (!product || product.status !== 'active') {
            throw new Error(`Product ${item.productId} not found or inactive`);
        }
        // Check inventory availability
        const availability = await (0, inventoryService_1.checkInventoryAvailability)(item.productId, item.quantity, item.variantId);
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
async function reserveInventoryForOrder(items) {
    const reservations = [];
    const tempOrderId = `temp_${Date.now()}`;
    for (const item of items) {
        const reservation = await (0, inventoryService_1.reserveInventory)(item.product._id.toString(), item.quantity, tempOrderId, item.variantId, 30 // 30 minutes reservation
        );
        if (!reservation.success) {
            // Release any previous reservations
            for (const prevReservation of reservations) {
                await (0, inventoryService_1.releaseInventory)(prevReservation.productId, prevReservation.quantity, tempOrderId, prevReservation.variantId);
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
async function commitInventoryReservations(reservations) {
    // In a real implementation, this would convert reservations to actual inventory deductions
    // For now, we'll just update the product quantities directly
    for (const reservation of reservations) {
        const product = await Product_1.default.findById(reservation.productId);
        if (product) {
            if (reservation.variantId) {
                const variant = product.variants.find(v => v.id === reservation.variantId);
                if (variant) {
                    variant.inventory.quantity -= reservation.quantity;
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
}
async function releaseOrderReservations(reservations) {
    const tempOrderId = `temp_${Date.now()}`;
    for (const reservation of reservations) {
        await (0, inventoryService_1.releaseInventory)(reservation.productId, reservation.quantity, tempOrderId, reservation.variantId);
    }
}
function calculateTaxRate(address) {
    // Simplified tax calculation - in production, use proper tax service
    const taxRates = {
        'CA': 0.0875, // California
        'NY': 0.08, // New York
        'TX': 0.0625, // Texas
        'FL': 0.06, // Florida
        // Add more states/provinces as needed
    };
    return taxRates[address.province] || 0.05; // Default 5% tax
}
async function calculateShippingCost(items, address) {
    // Simplified shipping calculation
    const totalWeight = items.reduce((weight, item) => {
        return weight + (item.product.weight || 1) * item.quantity;
    }, 0);
    const baseShipping = tenant_1.tenantConfig.store.shipping.baseCost;
    const freeShippingThreshold = tenant_1.tenantConfig.store.shipping.freeShippingThreshold;
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
//# sourceMappingURL=orderService.js.map