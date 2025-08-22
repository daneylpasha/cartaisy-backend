"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const webhookController_1 = require("../controllers/webhookController");
const router = express_1.default.Router();
// Middleware to verify Shopify webhook signatures
router.use(webhookController_1.verifyShopifyWebhook);
// Product webhooks
router.post('/shopify/products/create', webhookController_1.handleProductCreate);
router.post('/shopify/products/update', webhookController_1.handleProductUpdate);
router.post('/shopify/products/delete', webhookController_1.handleProductDelete);
// Order webhooks
router.post('/shopify/orders/create', webhookController_1.handleOrderCreate);
router.post('/shopify/orders/updated', webhookController_1.handleOrderUpdate);
router.post('/shopify/orders/paid', webhookController_1.handleOrderPaid);
// Customer webhooks
router.post('/shopify/customers/create', webhookController_1.handleCustomerCreate);
// Inventory webhooks
router.post('/shopify/inventory_levels/update', webhookController_1.handleInventoryLevelUpdate);
// Health check endpoint for webhook testing
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Webhook endpoints are ready',
        timestamp: new Date().toISOString()
    });
});
exports.default = router;
//# sourceMappingURL=webhookRoutes.js.map