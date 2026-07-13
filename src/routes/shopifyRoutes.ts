import express from 'express';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { 
  performFullSync, 
  performIncrementalSync, 
  getSyncStatus 
} from '../services/syncService';
import { 
  updateInventoryLevels, 
  getLowStockProducts, 
  getInventoryHistory,
  bulkUpdateInventory 
} from '../services/inventoryService';
import {
  generateProductRecommendations,
  updateProductAnalytics,
  optimizeProductSearch,
  processProductImages
} from '../services/productEnhancementService';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreContext } from '../middleware/storeOwnership';
import Product from '../models/Product';
import Order from '../models/Order';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));
router.use(requireOwnedStoreContext());

/**
 * Trusted store context for Shopify Admin operations: the authenticated
 * user's storeId (set by `authenticate` from the User/Customer record).
 * Callers without a store fail closed.
 */
const getRequestStoreId = (req: Request): string | null => {
  const storeId = (req as any).storeId;
  return storeId ? storeId.toString() : null;
};

const missingStoreResponse = (res: Response): Response =>
  res.status(403).json({
    success: false,
    error: 'No store context for this user'
  });

// ===============================
// SYNC MANAGEMENT ROUTES
// ===============================

/**
 * GET /api/shopify/sync/status - Get current synchronization status
 */
router.get('/sync/status', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const status = getSyncStatus(storeId);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
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
router.post('/sync/full', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const result = await performFullSync(storeId);
    res.json({
      success: true,
      message: 'Full synchronization completed',
      data: result
    });
  } catch (error) {
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
router.post('/sync/incremental', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const result = await performIncrementalSync(storeId);
    res.json({
      success: true,
      message: 'Incremental synchronization completed',
      data: result
    });
  } catch (error) {
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
router.post('/inventory/sync', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const { productId } = req.body;
    if (productId) {
      if (typeof productId !== 'string' || !Types.ObjectId.isValid(productId)) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      const ownedProduct = await Product.findOne({ _id: productId, storeId }).select('_id').lean();
      if (!ownedProduct) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
    }

    await updateInventoryLevels(productId, storeId);
    
    res.json({
      success: true,
      message: productId ? 
        'Product inventory updated successfully' : 
        'All inventory levels updated successfully'
    });
  } catch (error) {
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
router.get('/inventory/low-stock', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const threshold = req.query.threshold ? parseInt(req.query.threshold as string) : undefined;
    const lowStockProducts = await getLowStockProducts(threshold, storeId);
    
    res.json({
      success: true,
      data: lowStockProducts,
      count: lowStockProducts.length
    });
  } catch (error) {
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
router.get('/inventory/history/:productId', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const { productId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const product = await Product.findOne({ _id: productId, storeId }).select('_id').lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    const history = await getInventoryHistory(productId, limit);
    
    res.json({
      success: true,
      data: history,
      count: history.length
    });
  } catch (error) {
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
router.put('/inventory/bulk-update', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({
        success: false,
        error: 'Updates must be an array'
      });
    }

    const result = await bulkUpdateInventory(updates, storeId);
    
    res.json({
      success: true,
      message: `Successfully updated ${result.success} items`,
      data: {
        successful: result.success,
        errors: result.errors
      }
    });
  } catch (error) {
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
router.get('/products/:productId/recommendations', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const userId = req.query.userId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;
    const storeId = getRequestStoreId(req);
    if (!storeId) return missingStoreResponse(res);
    
    const recommendations = await generateProductRecommendations(productId, userId, limit, storeId);
    
    res.json({
      success: true,
      data: recommendations,
      count: recommendations.length
    });
  } catch (error) {
    console.error('Error getting product recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get product recommendations'
    });
  }
});

/**
 * POST /api/shopify/products/:productId/enhance-seo - Enhance product SEO (optimize search)
 */
router.post('/products/:productId/enhance-seo', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const product = await Product.findOne({ _id: productId, storeId }).select('_id').lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    await optimizeProductSearch(productId);

    res.json({
      success: true,
      message: 'Product SEO enhanced successfully',
      data: { productId }
    });
  } catch (error) {
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
router.post('/products/:productId/optimize-images', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const product = await Product.findOne({ _id: productId, storeId });
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    const result = await processProductImages(product);

    res.json({
      success: true,
      message: 'Product images optimized successfully',
      data: result
    });
  } catch (error) {
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
router.get('/products/:productId/analytics', async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const product = await Product.findOne({ _id: productId, storeId }).select('analytics').lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    res.json({
      success: true,
      data: product.analytics
    });
  } catch (error) {
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
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const [
      productCount,
      orderCount,
      syncedProductCount,
      mobileOrderCount,
      syncStatus
    ] = await Promise.all([
      Product.countDocuments({ storeId, status: 'active' }),
      Order.countDocuments({ storeId }),
      Product.countDocuments({ storeId, shopifyProductId: { $exists: true } }),
      Order.countDocuments({ storeId, shopifyOrderId: { $exists: false } }),
      getSyncStatus(storeId)
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
  } catch (error) {
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
router.get('/products/sync-status', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const products = await Product.find({ storeId })
      .select('title handle shopifyProductId updatedAt status')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments({ storeId });

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
  } catch (error) {
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
router.get('/test-connection', async (req: Request, res: Response) => {
  try {
    const storeId = getRequestStoreId(req);
    if (!storeId) {
      missingStoreResponse(res);
      return;
    }

    const { getShopifyClientForStore } = require('../services/shopifyService');
    const client = await getShopifyClientForStore(storeId);

    if (!client) {
      res.status(500).json({
        success: false,
        error: 'Failed to connect to Shopify API',
        details: 'Store is not connected to Shopify'
      });
      return;
    }

    // Try to get shop info to test connection
    const response = await client.get('/shop.json');
    const shop = response.data?.shop || {};

    res.json({
      success: true,
      message: 'Successfully connected to Shopify',
      data: {
        shopName: shop.name,
        domain: shop.domain,
        email: shop.email,
        currency: shop.currency,
        timezone: shop.timezone
      }
    });
  } catch (error) {
    console.error('Shopify connection test failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to connect to Shopify API',
      details: error.message
    });
  }
});

export default router;
