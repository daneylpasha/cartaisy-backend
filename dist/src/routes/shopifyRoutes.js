"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const syncService_1 = require("../services/syncService");
const inventoryService_1 = require("../services/inventoryService");
const productEnhancementService_1 = require("../services/productEnhancementService");
const auth_1 = require("../middleware/auth");
const Product_1 = __importDefault(require("../models/Product"));
const Order_1 = __importDefault(require("../models/Order"));
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_1.auth);
// ===============================
// SYNC MANAGEMENT ROUTES
// ===============================
/**
 * GET /api/shopify/sync/status - Get current synchronization status
 */
router.get('/sync/status', async (req, res) => {
    try {
        const status = (0, syncService_1.getSyncStatus)();
        res.json({
            success: true,
            data: status
        });
    }
    catch (error) {
        console.error('Error getting sync status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sync status'
        });
    }
});
/**
 * POST /api/shopify/sync/full - Trigger full synchronization
 */
router.post('/sync/full', async (req, res) => {
    try {
        const result = await (0, syncService_1.performFullSync)();
        res.json({
            success: true,
            message: 'Full synchronization completed',
            data: result
        });
    }
    catch (error) {
        console.error('Error performing full sync:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Full synchronization failed'
        });
    }
});
/**
 * POST /api/shopify/sync/incremental - Trigger incremental synchronization
 */
router.post('/sync/incremental', async (req, res) => {
    try {
        const result = await (0, syncService_1.performIncrementalSync)();
        res.json({
            success: true,
            message: 'Incremental synchronization completed',
            data: result
        });
    }
    catch (error) {
        console.error('Error performing incremental sync:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Incremental synchronization failed'
        });
    }
});
// ===============================
// INVENTORY MANAGEMENT ROUTES
// ===============================
/**
 * POST /api/shopify/inventory/sync - Sync inventory levels from Shopify
 */
router.post('/inventory/sync', async (req, res) => {
    try {
        const { productId } = req.body;
        await (0, inventoryService_1.updateInventoryLevels)(productId);
        res.json({
            success: true,
            message: productId ?
                'Product inventory updated successfully' :
                'All inventory levels updated successfully'
        });
    }
    catch (error) {
        console.error('Error syncing inventory:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync inventory levels'
        });
    }
});
/**
 * GET /api/shopify/inventory/low-stock - Get products with low stock
 */
router.get('/inventory/low-stock', async (req, res) => {
    try {
        const threshold = req.query.threshold ? parseInt(req.query.threshold) : undefined;
        const lowStockProducts = await (0, inventoryService_1.getLowStockProducts)(threshold);
        res.json({
            success: true,
            data: lowStockProducts,
            count: lowStockProducts.length
        });
    }
    catch (error) {
        console.error('Error getting low stock products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get low stock products'
        });
    }
});
/**
 * GET /api/shopify/inventory/history/:productId - Get inventory history for a product
 */
router.get('/inventory/history/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const history = await (0, inventoryService_1.getInventoryHistory)(productId, limit);
        res.json({
            success: true,
            data: history,
            count: history.length
        });
    }
    catch (error) {
        console.error('Error getting inventory history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get inventory history'
        });
    }
});
/**
 * PUT /api/shopify/inventory/bulk-update - Bulk update inventory levels
 */
router.put('/inventory/bulk-update', async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({
                success: false,
                error: 'Updates must be an array'
            });
        }
        const result = await (0, inventoryService_1.bulkUpdateInventory)(updates);
        res.json({
            success: true,
            message: `Successfully updated ${result.success} items`,
            data: {
                successful: result.success,
                errors: result.errors
            }
        });
    }
    catch (error) {
        console.error('Error bulk updating inventory:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to bulk update inventory'
        });
    }
});
// ===============================
// PRODUCT ENHANCEMENT ROUTES
// ===============================
/**
 * GET /api/shopify/products/:productId/recommendations - Get product recommendations
 */
router.get('/products/:productId/recommendations', async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.query.userId;
        const limit = req.query.limit ? parseInt(req.query.limit) : 8;
        const recommendations = await (0, productEnhancementService_1.generateProductRecommendations)(productId, userId, limit);
        res.json({
            success: true,
            data: recommendations,
            count: recommendations.length
        });
    }
    catch (error) {
        console.error('Error getting product recommendations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get product recommendations'
        });
    }
});
/**
 * POST /api/shopify/products/:productId/enhance-seo - Enhance product SEO
 */
router.post('/products/:productId/enhance-seo', async (req, res) => {
    try {
        const { productId } = req.params;
        const enhanced = await (0, productEnhancementService_1.enhanceProductSEO)(productId);
        res.json({
            success: true,
            message: 'Product SEO enhanced successfully',
            data: enhanced
        });
    }
    catch (error) {
        console.error('Error enhancing product SEO:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enhance product SEO'
        });
    }
});
/**
 * POST /api/shopify/products/:productId/optimize-images - Optimize product images
 */
router.post('/products/:productId/optimize-images', async (req, res) => {
    try {
        const { productId } = req.params;
        const result = await (0, productEnhancementService_1.optimizeProductImages)(productId);
        res.json({
            success: true,
            message: 'Product images optimized successfully',
            data: result
        });
    }
    catch (error) {
        console.error('Error optimizing product images:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to optimize product images'
        });
    }
});
/**
 * GET /api/shopify/products/:productId/analytics - Get product analytics
 */
router.get('/products/:productId/analytics', async (req, res) => {
    try {
        const { productId } = req.params;
        const period = req.query.period || '30d';
        const analytics = await (0, productEnhancementService_1.getProductAnalytics)(productId, period);
        res.json({
            success: true,
            data: analytics
        });
    }
    catch (error) {
        console.error('Error getting product analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get product analytics'
        });
    }
});
// ===============================
// DATA OVERVIEW ROUTES
// ===============================
/**
 * GET /api/shopify/overview - Get integration overview and stats
 */
router.get('/overview', async (req, res) => {
    try {
        const [productCount, orderCount, syncedProductCount, mobileOrderCount, syncStatus] = await Promise.all([
            Product_1.default.countDocuments({ status: 'active' }),
            Order_1.default.countDocuments(),
            Product_1.default.countDocuments({ shopifyProductId: { $exists: true } }),
            Order_1.default.countDocuments({ shopifyOrderId: { $exists: false } }),
            (0, syncService_1.getSyncStatus)()
        ]);
        const overview = {
            products: {
                total: productCount,
                syncedWithShopify: syncedProductCount,
                syncRate: productCount > 0 ? Math.round((syncedProductCount / productCount) * 100) : 0
            },
            orders: {
                total: orderCount,
                mobileOnly: mobileOrderCount,
                shopifyOrders: orderCount - mobileOrderCount
            },
            sync: {
                lastFullSync: syncStatus.lastFullSync,
                lastIncrementalSync: syncStatus.lastIncrementalSync,
                inProgress: syncStatus.inProgress,
                errorCount: syncStatus.errors?.length || 0
            },
            integration: {
                status: syncedProductCount > 0 ? 'active' : 'inactive',
                health: syncStatus.errors?.length === 0 ? 'healthy' : 'issues'
            }
        };
        res.json({
            success: true,
            data: overview
        });
    }
    catch (error) {
        console.error('Error getting Shopify overview:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get integration overview'
        });
    }
});
/**
 * GET /api/shopify/products/sync-status - Get products sync status
 */
router.get('/products/sync-status', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const products = await Product_1.default.find({})
            .select('title handle shopifyProductId updatedAt status')
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(limit);
        const total = await Product_1.default.countDocuments({});
        const productsWithStatus = products.map(product => ({
            _id: product._id,
            title: product.title,
            handle: product.handle,
            isSynced: !!product.shopifyProductId,
            lastUpdated: product.updatedAt,
            status: product.status,
            shopifyProductId: product.shopifyProductId
        }));
        res.json({
            success: true,
            data: productsWithStatus,
            pagination: {
                current: page,
                total: Math.ceil(total / limit),
                count: products.length,
                totalItems: total
            }
        });
    }
    catch (error) {
        console.error('Error getting products sync status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get products sync status'
        });
    }
});
// ===============================
// TESTING AND DEBUG ROUTES
// ===============================
/**
 * GET /api/shopify/test-connection - Test Shopify API connection
 */
router.get('/test-connection', async (req, res) => {
    try {
        const { getShopifyClient } = require('../services/shopifyService');
        const shopify = getShopifyClient();
        // Try to get shop info to test connection
        const shopInfo = await shopify.get({
            path: 'shop'
        });
        res.json({
            success: true,
            message: 'Successfully connected to Shopify',
            data: {
                shopName: shopInfo.body.shop.name,
                domain: shopInfo.body.shop.domain,
                email: shopInfo.body.shop.email,
                currency: shopInfo.body.shop.currency,
                timezone: shopInfo.body.shop.timezone
            }
        });
    }
    catch (error) {
        console.error('Shopify connection test failed:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to connect to Shopify API',
            details: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=shopifyRoutes.js.map