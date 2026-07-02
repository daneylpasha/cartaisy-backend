import express from 'express';
import {
  handleProductCreate,
  handleProductUpdate,
  handleProductDelete,
  handleOrderCreate,
  handleOrderUpdate,
  handleOrderPaid,
  handleCustomerCreate,
  handleInventoryUpdate
} from '../controllers/webhookController';
import {
  verifyShopifyWebhook,
  resolveShopifyWebhookStore,
} from '../middleware/shopifyWebhookAuth';

const router = express.Router();

// Every Shopify webhook must pass HMAC verification and resolve its shop
// domain to exactly one trusted Store before any handler can run
router.use('/shopify', verifyShopifyWebhook, resolveShopifyWebhookStore);

// Product webhooks
router.post('/shopify/products/create', handleProductCreate);
router.post('/shopify/products/update', handleProductUpdate);
router.post('/shopify/products/delete', handleProductDelete);

// Order webhooks
router.post('/shopify/orders/create', handleOrderCreate);
router.post('/shopify/orders/updated', handleOrderUpdate);
router.post('/shopify/orders/paid', handleOrderPaid);

// Customer webhooks
router.post('/shopify/customers/create', handleCustomerCreate);

// Inventory webhooks
router.post('/shopify/inventory_levels/update', handleInventoryUpdate);

// Health check endpoint for webhook testing
router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Webhook endpoints are ready',
    timestamp: new Date().toISOString()
  });
});

export default router;