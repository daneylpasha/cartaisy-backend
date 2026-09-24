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
  handleAppUninstalled,
  handleComplianceDispatch,
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
} from '../controllers/shopifyComplianceWebhookController';
import {
  verifyShopifyWebhook,
  resolveShopifyComplianceStore,
  resolveShopifyWebhookStore,
} from '../middleware/shopifyWebhookAuth';

const router = express.Router();

// Compliance topics and app/uninstalled are app-level Shopify subscriptions.
// They are registered before the connected-store gate so a shop that is
// already disconnected (uninstall, then shop/redact) can still resolve.
// These paths do not call Shopify and do not revoke tokens.
const complianceWebhook = [verifyShopifyWebhook, resolveShopifyComplianceStore] as const;

router.post('/shopify/customers/data_request', ...complianceWebhook, handleCustomersDataRequest);
router.post('/shopify/customers/redact', ...complianceWebhook, handleCustomersRedact);
router.post('/shopify/shop/redact', ...complianceWebhook, handleShopRedact);
router.post('/shopify/app/uninstalled', ...complianceWebhook, handleAppUninstalled);
router.post('/shopify/compliance', ...complianceWebhook, handleComplianceDispatch);

// Catalog, order, and customer webhooks must pass HMAC verification and
// resolve the shop domain to exactly one active, connected Store.
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