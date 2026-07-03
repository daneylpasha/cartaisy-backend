import { Request, Response } from 'express';
import { syncProduct } from '../services/shopifyService';
import { syncProductData, syncCustomerData } from '../services/syncService';
import Product from '../models/Product';
import User from '../models/User';
import { getTrustedWebhookStoreId } from '../middleware/shopifyWebhookAuth';
import {
  reconcileShopifyOrder,
  mapShopifyFinancialStatus,
  mapShopifyFulfillmentStatus,
  mapToMobileStatus,
} from '../services/orderReconciliationService';

/**
 * Fail closed if the trusted store context is missing. The webhook middleware
 * chain (HMAC verification + shop-domain Store resolution) must run before
 * any handler; without it no handler may mutate data.
 */
const requireTrustedStoreId = (req: Request, res: Response): string | null => {
  const storeId = getTrustedWebhookStoreId(req);
  if (!storeId) {
    console.error('❌ Webhook handler invoked without trusted store context; rejecting');
    res.status(401).json({ error: 'Webhook store context missing' });
    return null;
  }
  return storeId;
};

/**
 * Handle product update webhook from Shopify
 */
export const handleProductUpdate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyProduct = req.body;
    console.log(`📦 Received product update webhook for: ${shopifyProduct.title} (store: ${storeId})`);

    // Find existing product within the trusted store only
    const existingProduct = await Product.findOne({
      storeId,
      shopifyProductId: shopifyProduct.id.toString()
    });

    if (existingProduct) {
      // Merge Shopify data with our enhancements
      const mergedData = await syncProductData(shopifyProduct, existingProduct);

      // Handle any data conflicts
      const { resolved } = await handleDataConflicts(existingProduct.toObject(), mergedData, 'product');

      // Update the product
      Object.assign(existingProduct, resolved);
      await existingProduct.save();

      console.log(`✅ Updated product: ${shopifyProduct.title}`);
    } else {
      // Create new product in the trusted store
      await syncProduct(shopifyProduct.id.toString(), shopifyProduct, storeId);
      console.log(`🆕 Created new product: ${shopifyProduct.title}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling product update webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process product update webhook' 
    });
  }
};

/**
 * Handle product creation webhook from Shopify
 */
export const handleProductCreate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyProduct = req.body;
    console.log(`🆕 Received product create webhook for: ${shopifyProduct.title} (store: ${storeId})`);

    // Check if product already exists in this store (shouldn't, but safety check)
    const existingProduct = await Product.findOne({
      storeId,
      shopifyProductId: shopifyProduct.id.toString()
    });

    if (existingProduct) {
      console.warn(`⚠️ Product ${shopifyProduct.id} already exists, updating instead`);
      return handleProductUpdate(req, res);
    }

    // Create new product in the trusted store
    await syncProduct(shopifyProduct.id.toString(), shopifyProduct, storeId);
    console.log(`✅ Created product: ${shopifyProduct.title}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling product create webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process product create webhook' 
    });
  }
};

/**
 * Handle product deletion webhook from Shopify
 */
export const handleProductDelete = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyProduct = req.body;
    console.log(`🗑️ Received product delete webhook for: ${shopifyProduct.id} (store: ${storeId})`);

    // Find and update product status instead of deleting (preserve analytics);
    // scoped to the trusted store only
    const existingProduct = await Product.findOne({
      storeId,
      shopifyProductId: shopifyProduct.id.toString()
    });

    if (existingProduct) {
      existingProduct.status = 'archived';
      await existingProduct.save();
      console.log(`📦 Archived product: ${existingProduct.title}`);
    } else {
      console.warn(`⚠️ Product ${shopifyProduct.id} not found for deletion`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling product delete webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process product delete webhook' 
    });
  }
};

/**
 * Handle order creation webhook from Shopify.
 *
 * Reconciles the order into a store-scoped local Order (issue #76): matches
 * the CheckoutHandoff that started the Shopify-hosted checkout where
 * possible, attributes the order to the store's Customer or a guest
 * session/contact, and never creates dashboard User records.
 */
export const handleOrderCreate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyOrder = req.body;
    console.log(`📋 Received order create webhook for: ${shopifyOrder.order_number} (store: ${storeId})`);

    const { order, created, attribution } = await reconcileShopifyOrder(storeId, shopifyOrder);

    // Unprocessable payloads (no order id / no email) can never succeed on
    // retry; the service already logged why. Acknowledge with 200 so the
    // webhook does not enter Shopify's retry pipeline.
    if (!order) {
      return res.status(200).json({ success: true });
    }

    if (!created) {
      // Duplicate webhook delivery: idempotent no-op
      console.warn(`⚠️ Order ${shopifyOrder.order_number} already exists (store: ${storeId})`);
      return res.status(200).json({ success: true });
    }

    // Notification failures must not push the webhook into Shopify's retry
    // pipeline; the order itself is already saved
    try {
      await order.sendNotification(
        'email',
        'Order Confirmation',
        `Your order #${shopifyOrder.order_number} has been received and is being processed.`
      );
    } catch (notificationError) {
      console.warn('Failed to send order confirmation notification:', notificationError);
    }

    console.log(`✅ Created order: ${shopifyOrder.order_number} (store: ${storeId}, attribution: ${attribution})`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling order create webhook:', error);
    res.status(500).json({
      error: 'Failed to process order create webhook'
    });
  }
};

/**
 * Handle order update webhook from Shopify.
 *
 * An order unknown locally (e.g. placed before webhooks were subscribed, or
 * whose create webhook was missed) is reconciled store-scoped from this
 * payload instead of being rejected with a 404 that Shopify would retry.
 */
export const handleOrderUpdate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyOrder = req.body;
    console.log(`📋 Received order update webhook for: ${shopifyOrder.order_number} (store: ${storeId})`);

    const { order, created } = await reconcileShopifyOrder(storeId, shopifyOrder);

    // Unprocessable payloads can never succeed on retry; already logged
    if (!order) {
      return res.status(200).json({ success: true });
    }

    if (created) {
      // The order was just built from this payload, so its statuses and
      // tracking are already current
      console.log(`🆕 Stored previously unknown order from update webhook: ${shopifyOrder.order_number} (store: ${storeId})`);
      return res.status(200).json({ success: true });
    }

    // Update order status
    const newMobileStatus = mapToMobileStatus(shopifyOrder.fulfillment_status);

    if (order.mobileStatus.current !== newMobileStatus) {
      await order.updateMobileStatus(
        newMobileStatus,
        'Status updated from Shopify',
        shopifyOrder.shipping_address?.city
      );
    }

    // Update financial status
    order.financialStatus = mapShopifyFinancialStatus(shopifyOrder.financial_status);
    order.fulfillmentStatus = mapShopifyFulfillmentStatus(shopifyOrder.fulfillment_status);

    // Update tracking information
    if (shopifyOrder.tracking_number) {
      order.shipping.trackingNumber = shopifyOrder.tracking_number;
      order.shipping.trackingUrl = shopifyOrder.tracking_url;
    }

    await order.save();
    console.log(`✅ Updated order: ${shopifyOrder.order_number} (store: ${storeId})`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling order update webhook:', error);
    res.status(500).json({
      error: 'Failed to process order update webhook'
    });
  }
};

/**
 * Handle order payment webhook from Shopify.
 *
 * An order unknown locally is reconciled store-scoped from this payload
 * first. The paid transition (and its notification) only fires when the
 * order was not already paid, so duplicate paid webhooks are idempotent.
 */
export const handleOrderPaid = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyOrder = req.body;
    console.log(`💳 Received order paid webhook for: ${shopifyOrder.order_number} (store: ${storeId})`);

    const { order } = await reconcileShopifyOrder(storeId, shopifyOrder);

    // Unprocessable payloads can never succeed on retry; already logged
    if (!order) {
      return res.status(200).json({ success: true });
    }

    if (order.financialStatus === 'paid') {
      // Duplicate paid webhook, or the order was just created from this
      // already-paid payload: nothing left to transition
      console.log(`💳 Order ${shopifyOrder.order_number} already marked paid (store: ${storeId})`);
      return res.status(200).json({ success: true });
    }

    // Update financial status to paid
    order.financialStatus = 'paid';

    // Update mobile status to processing
    await order.updateMobileStatus(
      'processing',
      'Payment confirmed',
      undefined
    );

    await order.save();

    // Notification failures must not push the webhook into Shopify's retry
    // pipeline; the paid state is already saved
    try {
      await order.sendNotification(
        'push',
        'Payment Confirmed',
        `Payment for order #${shopifyOrder.order_number} has been confirmed. We're processing your order now!`
      );
    } catch (notificationError) {
      console.warn('Failed to send payment confirmation notification:', notificationError);
    }

    console.log(`✅ Payment confirmed for order: ${shopifyOrder.order_number} (store: ${storeId})`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling order paid webhook:', error);
    res.status(500).json({
      error: 'Failed to process order paid webhook'
    });
  }
};

/**
 * Handle customer creation webhook from Shopify
 */
export const handleCustomerCreate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyCustomer = req.body;
    console.log(`👤 Received customer create webhook for: ${shopifyCustomer.email} (store: ${storeId})`);

    // Check if customer already exists
    const existingUser = await User.findOne({ email: shopifyCustomer.email });

    if (existingUser) {
      // Update existing user with Shopify data
      const mergedData = await syncCustomerData(shopifyCustomer, existingUser);
      Object.assign(existingUser, mergedData);
      await existingUser.save();
      console.log(`✅ Updated existing user: ${shopifyCustomer.email}`);
    } else {
      // Create new user
      const userData = await syncCustomerData(shopifyCustomer);
      const newUser = new User({
        ...userData,
        role: 'customer',
        isActive: true
      });
      await newUser.save();
      console.log(`🆕 Created new user: ${shopifyCustomer.email}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling customer create webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process customer create webhook' 
    });
  }
};

/**
 * Handle customer update webhook from Shopify
 */
export const handleCustomerUpdate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const shopifyCustomer = req.body;
    console.log(`👤 Received customer update webhook for: ${shopifyCustomer.email} (store: ${storeId})`);

    // Find existing user
    const existingUser = await User.findOne({ 
      $or: [
        { email: shopifyCustomer.email },
        { shopifyCustomerId: shopifyCustomer.id.toString() }
      ]
    });

    if (existingUser) {
      // Merge and resolve conflicts
      const mergedData = await syncCustomerData(shopifyCustomer, existingUser);
      const { resolved } = await handleDataConflicts(existingUser.toObject(), mergedData, 'customer');
      
      Object.assign(existingUser, resolved);
      await existingUser.save();
      console.log(`✅ Updated user: ${shopifyCustomer.email}`);
    } else {
      console.warn(`⚠️ User ${shopifyCustomer.email} not found for update`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling customer update webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process customer update webhook' 
    });
  }
};

/**
 * Handle inventory level update webhook from Shopify
 */
export const handleInventoryUpdate = async (req: Request, res: Response): Promise<Response | void> => {
  const storeId = requireTrustedStoreId(req, res);
  if (!storeId) return;

  try {
    const inventoryLevel = req.body;
    const inventoryItemId = inventoryLevel?.inventory_item_id?.toString();

    // Acknowledge with 200: a payload without inventory_item_id can never
    // succeed on retry, and non-2xx responses put the webhook into
    // Shopify's retry pipeline and count toward endpoint removal
    if (!inventoryItemId) {
      console.warn(`⚠️ Inventory update webhook missing inventory_item_id; skipping (store: ${storeId})`);
      return res.status(200).json({ success: true });
    }

    console.log(`📦 Received inventory update webhook for item: ${inventoryItemId} (store: ${storeId})`);

    // Shopify sends inventory_item_id, which maps to variants.inventoryItemId
    // (variants.id is the Shopify variant ID, a different identifier);
    // scoped to the trusted store only
    const products = await Product.find({
      storeId,
      'variants.inventoryItemId': inventoryItemId
    });

    if (products.length === 0) {
      console.warn(`⚠️ No product variant matches inventory item ${inventoryItemId}; skipping inventory update (store: ${storeId})`);
      return res.status(200).json({ success: true });
    }

    for (const product of products) {
      // Update the specific variant's inventory
      const variant = product.variants.find(v => v.inventoryItemId === inventoryItemId);
      const previousQuantity = variant?.inventory.quantity || 0;
      if (variant) {
        variant.inventory.quantity = inventoryLevel.available || 0;
      }

      // Recalculate total inventory
      const totalQuantity = product.variants.reduce((total, v) => total + (v.inventory.quantity || 0), 0);
      product.inventoryTracking.totalQuantity = totalQuantity;

      // Add to inventory history
      product.inventoryTracking.history.push({
        date: new Date(),
        change: (inventoryLevel.available || 0) - previousQuantity,
        newQuantity: inventoryLevel.available || 0,
        reason: 'shopify_sync',
        note: 'Updated from Shopify webhook'
      });

      await product.save();
      console.log(`📦 Updated inventory for product: ${product.title}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling inventory update webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process inventory update webhook' 
    });
  }
};

// Helper functions (imported from shopifyService)
import { handleDataConflicts } from '../services/syncService';