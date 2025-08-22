import { Request, Response } from 'express';
import { verifyWebhookSignature, syncProduct } from '../services/shopifyService';
import { syncProductData, syncCustomerData } from '../services/syncService';
import Product from '../models/Product';
import User from '../models/User';
import Order from '../models/Order';
import { tenantConfig } from '../config/tenant';

/**
 * Middleware to verify Shopify webhook signature
 */
export const verifyWebhookSignature = (req: Request, res: Response, next: any) => {
  try {
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const body = JSON.stringify(req.body);
    const secret = tenantConfig.shopify.webhookSecret;

    if (!signature) {
      return res.status(401).json({
        error: 'Missing webhook signature'
      });
    }

    const isValid = verifyWebhookSignature(body, signature, secret);

    if (!isValid) {
      console.warn('⚠️ Invalid webhook signature received');
      return res.status(401).json({
        error: 'Invalid webhook signature'
      });
    }

    next();
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    res.status(500).json({
      error: 'Webhook verification failed'
    });
  }
};

/**
 * Handle product update webhook from Shopify
 */
export const handleProductUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyProduct = req.body;
    console.log(`📦 Received product update webhook for: ${shopifyProduct.title}`);

    // Find existing product
    const existingProduct = await Product.findOne({ 
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
      // Create new product
      await syncProduct(shopifyProduct.id.toString(), shopifyProduct);
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
export const handleProductCreate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyProduct = req.body;
    console.log(`🆕 Received product create webhook for: ${shopifyProduct.title}`);

    // Check if product already exists (shouldn't, but safety check)
    const existingProduct = await Product.findOne({ 
      shopifyProductId: shopifyProduct.id.toString() 
    });

    if (existingProduct) {
      console.warn(`⚠️ Product ${shopifyProduct.id} already exists, updating instead`);
      return handleProductUpdate(req, res);
    }

    // Create new product
    await syncProduct(shopifyProduct.id.toString(), shopifyProduct);
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
export const handleProductDelete = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyProduct = req.body;
    console.log(`🗑️ Received product delete webhook for: ${shopifyProduct.id}`);

    // Find and update product status instead of deleting (preserve analytics)
    const existingProduct = await Product.findOne({ 
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
 * Handle order creation webhook from Shopify
 */
export const handleOrderCreate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyOrder = req.body;
    console.log(`📋 Received order create webhook for: ${shopifyOrder.order_number}`);

    // Check if order already exists
    const existingOrder = await Order.findOne({ 
      shopifyOrderId: shopifyOrder.id.toString() 
    });

    if (existingOrder) {
      console.warn(`⚠️ Order ${shopifyOrder.order_number} already exists`);
      return res.status(200).json({ success: true });
    }

    // Find or create user
    let user = await User.findOne({ email: shopifyOrder.email });
    
    if (!user) {
      // Create user from order data
      const userData = {
        name: `${shopifyOrder.billing_address?.first_name || ''} ${shopifyOrder.billing_address?.last_name || ''}`.trim(),
        email: shopifyOrder.email,
        role: 'customer',
        isActive: true,
        isVerified: true,
        shopifyCustomerId: shopifyOrder.customer?.id?.toString(),
        addresses: shopifyOrder.billing_address ? [{
          type: 'billing' as const,
          firstName: shopifyOrder.billing_address.first_name,
          lastName: shopifyOrder.billing_address.last_name,
          address1: shopifyOrder.billing_address.address1,
          address2: shopifyOrder.billing_address.address2,
          city: shopifyOrder.billing_address.city,
          province: shopifyOrder.billing_address.province,
          country: shopifyOrder.billing_address.country,
          zip: shopifyOrder.billing_address.zip,
          phone: shopifyOrder.billing_address.phone,
          isDefault: true
        }] : []
      };

      user = new User(userData);
      await user.save();
      console.log(`👤 Created user: ${shopifyOrder.email}`);
    }

    // Create enhanced order
    const orderData = {
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number.toString(),
      orderNumber: shopifyOrder.name || shopifyOrder.order_number.toString(),
      user: user._id,
      email: shopifyOrder.email,
      
      lineItems: shopifyOrder.line_items?.map((item: any) => ({
        productId: item.product_id?.toString(),
        variantId: item.variant_id?.toString(),
        quantity: item.quantity,
        price: parseFloat(item.price),
        title: item.title,
        sku: item.sku
      })) || [],
      
      subtotalPrice: parseFloat(shopifyOrder.subtotal_price),
      totalTax: parseFloat(shopifyOrder.total_tax),
      totalPrice: parseFloat(shopifyOrder.total_price),
      currency: shopifyOrder.currency,
      
      billingAddress: mapShopifyAddress(shopifyOrder.billing_address),
      shippingAddress: mapShopifyAddress(shopifyOrder.shipping_address),
      
      shipping: {
        method: shopifyOrder.shipping_lines?.[0]?.title || 'Standard',
        cost: shopifyOrder.shipping_lines?.[0] ? 
          parseFloat(shopifyOrder.shipping_lines[0].price) : 0,
        carrier: shopifyOrder.shipping_lines?.[0]?.carrier_identifier,
        trackingNumber: shopifyOrder.tracking_number,
        trackingUrl: shopifyOrder.tracking_url
      },
      
      financialStatus: mapShopifyFinancialStatus(shopifyOrder.financial_status),
      fulfillmentStatus: mapShopifyFulfillmentStatus(shopifyOrder.fulfillment_status),
      
      // Enhanced mobile status
      mobileStatus: {
        current: 'confirmed',
        history: [{
          status: 'placed',
          timestamp: new Date(shopifyOrder.created_at),
          note: 'Order received from Shopify'
        }]
      },
      
      placedAt: new Date(shopifyOrder.created_at),
      source: 'web',
      channel: 'website',
      
      // Notification preferences
      notificationPreferences: {
        pushEnabled: true,
        emailEnabled: true,
        smsEnabled: false
      }
    };

    const newOrder = new Order(orderData);
    await newOrder.save();

    // Send order confirmation notification
    await newOrder.sendNotification(
      'email',
      'Order Confirmation',
      `Your order #${shopifyOrder.order_number} has been received and is being processed.`
    );

    console.log(`✅ Created order: ${shopifyOrder.order_number}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling order create webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process order create webhook' 
    });
  }
};

/**
 * Handle order update webhook from Shopify
 */
export const handleOrderUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyOrder = req.body;
    console.log(`📋 Received order update webhook for: ${shopifyOrder.order_number}`);

    // Find existing order
    const existingOrder = await Order.findOne({ 
      shopifyOrderId: shopifyOrder.id.toString() 
    });

    if (!existingOrder) {
      console.warn(`⚠️ Order ${shopifyOrder.order_number} not found for update`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order status
    const newMobileStatus = mapToMobileStatus(shopifyOrder.fulfillment_status);
    
    if (existingOrder.mobileStatus.current !== newMobileStatus) {
      await existingOrder.updateMobileStatus(
        newMobileStatus,
        'Status updated from Shopify',
        shopifyOrder.shipping_address?.city
      );
    }

    // Update financial status
    existingOrder.financialStatus = mapShopifyFinancialStatus(shopifyOrder.financial_status);
    existingOrder.fulfillmentStatus = mapShopifyFulfillmentStatus(shopifyOrder.fulfillment_status);

    // Update tracking information
    if (shopifyOrder.tracking_number) {
      existingOrder.shipping.trackingNumber = shopifyOrder.tracking_number;
      existingOrder.shipping.trackingUrl = shopifyOrder.tracking_url;
    }

    await existingOrder.save();
    console.log(`✅ Updated order: ${shopifyOrder.order_number}`);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error handling order update webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process order update webhook' 
    });
  }
};

/**
 * Handle order payment webhook from Shopify
 */
export const handleOrderPaid = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyOrder = req.body;
    console.log(`💳 Received order paid webhook for: ${shopifyOrder.order_number}`);

    // Find existing order
    const existingOrder = await Order.findOne({ 
      shopifyOrderId: shopifyOrder.id.toString() 
    });

    if (!existingOrder) {
      console.warn(`⚠️ Order ${shopifyOrder.order_number} not found for payment update`);
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update financial status to paid
    existingOrder.financialStatus = 'paid';
    
    // Update mobile status to processing
    await existingOrder.updateMobileStatus(
      'processing',
      'Payment confirmed',
      undefined
    );

    // Send payment confirmation notification
    await existingOrder.sendNotification(
      'push',
      'Payment Confirmed',
      `Payment for order #${shopifyOrder.order_number} has been confirmed. We're processing your order now!`
    );

    console.log(`✅ Payment confirmed for order: ${shopifyOrder.order_number}`);
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
export const handleCustomerCreate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyCustomer = req.body;
    console.log(`👤 Received customer create webhook for: ${shopifyCustomer.email}`);

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
export const handleCustomerUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const shopifyCustomer = req.body;
    console.log(`👤 Received customer update webhook for: ${shopifyCustomer.email}`);

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
export const handleInventoryUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const inventoryLevel = req.body;
    console.log(`📦 Received inventory update webhook for item: ${inventoryLevel.inventory_item_id}`);

    // Find products with this inventory item
    const products = await Product.find({
      'variants.id': inventoryLevel.inventory_item_id.toString()
    });

    for (const product of products) {
      // Update the specific variant's inventory
      const variant = product.variants.find(v => v.id === inventoryLevel.inventory_item_id.toString());
      if (variant) {
        variant.inventory.quantity = inventoryLevel.available || 0;
      }

      // Recalculate total inventory
      const totalQuantity = product.variants.reduce((total, v) => total + (v.inventory.quantity || 0), 0);
      product.inventoryTracking.totalQuantity = totalQuantity;

      // Add to inventory history
      product.inventoryTracking.history.push({
        date: new Date(),
        change: inventoryLevel.available - (variant?.inventory.quantity || 0),
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

function mapShopifyAddress(shopifyAddress: any): any {
  if (!shopifyAddress) return null;
  
  return {
    firstName: shopifyAddress.first_name,
    lastName: shopifyAddress.last_name,
    company: shopifyAddress.company,
    address1: shopifyAddress.address1,
    address2: shopifyAddress.address2,
    city: shopifyAddress.city,
    province: shopifyAddress.province,
    country: shopifyAddress.country,
    zip: shopifyAddress.zip,
    phone: shopifyAddress.phone
  };
}

function mapShopifyFinancialStatus(status: string): any {
  const statusMap: { [key: string]: any } = {
    'pending': 'pending',
    'authorized': 'authorized',
    'partially_paid': 'partially_paid',
    'paid': 'paid',
    'partially_refunded': 'partially_refunded',
    'refunded': 'refunded',
    'voided': 'voided'
  };
  
  return statusMap[status] || 'pending';
}

function mapShopifyFulfillmentStatus(status: string): any {
  const statusMap: { [key: string]: any } = {
    'fulfilled': 'fulfilled',
    'partial': 'partial',
    'restocked': 'restocked'
  };
  
  return statusMap[status] || 'unfulfilled';
}

function mapToMobileStatus(fulfillmentStatus: string): any {
  const statusMap: { [key: string]: any } = {
    'fulfilled': 'delivered',
    'partial': 'shipped',
    'restocked': 'returned'
  };
  
  return statusMap[fulfillmentStatus] || 'confirmed';
}