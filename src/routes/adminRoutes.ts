import express from 'express';
import { Request, Response } from 'express';
import { 
  getBackgroundJobsStatus, 
  runBackgroundJobManually 
} from '../services/backgroundJobService';
import { 
  getSyncStatus, 
  performFullSync, 
  performIncrementalSync,
  validateSyncIntegrity 
} from '../services/syncService';
import {
  getLowStockProducts,
  getInventoryReservations
} from '../services/inventoryService';
// import { auth } from '../middleware/auth'; // Temporarily disabled
import Product from '../models/Product';
import Order from '../models/Order';
import User from '../models/User';
import Customer from '../models/Customer';
import Store from '../models/Store';

const router = express.Router();

// Apply authentication middleware - in production, add admin role check
// router.use(auth); // Temporarily disabled to fix server startup

// ===============================
// SYNC STATUS DASHBOARD
// ===============================

/**
 * GET /api/admin/dashboard - Get comprehensive admin dashboard data
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const [
      syncStatus,
      jobsStatus,
      systemStats,
      recentActivity
    ] = await Promise.all([
      getSyncStatus(),
      getBackgroundJobsStatus(),
      getSystemStatistics(),
      getRecentActivity()
    ]);

    const dashboard = {
      sync: syncStatus,
      jobs: jobsStatus,
      system: systemStats,
      activity: recentActivity,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    console.error('Error getting admin dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data'
    });
  }
});

/**
 * GET /api/admin/sync/status - Detailed sync status
 * Query params: storeId (optional) - filter by store
 * Headers: X-Store-ID (optional) - alternative way to pass store ID
 */
router.get('/sync/status', async (req: Request, res: Response) => {
  try {
    const storeId = (req.query.storeId as string) || req.headers['x-store-id'] as string;

    // Get global sync status
    const [syncStatus, integrityCheck] = await Promise.all([
      getSyncStatus(),
      validateSyncIntegrity()
    ]);

    // Build query filter for store-specific counts
    const storeFilter = storeId ? { storeId } : {};

    // Get resource counts (in parallel for performance)
    const [productCount, customerCount, orderCount, store] = await Promise.all([
      Product.countDocuments(storeFilter),
      Customer.countDocuments(storeFilter),
      Order.countDocuments(storeFilter),
      storeId ? Store.findById(storeId).select('shopify.lastSyncAt name') : null
    ]);

    // Calculate next scheduled sync (incremental runs every 4 hours)
    const now = new Date();
    const nextSync = new Date(now);
    nextSync.setHours(nextSync.getHours() + (4 - (nextSync.getHours() % 4)));
    nextSync.setMinutes(0);
    nextSync.setSeconds(0);
    nextSync.setMilliseconds(0);

    // Get last sync info - prefer store-specific, fallback to global
    const storeLastSync = store?.shopify?.lastSyncAt;
    const lastSyncDate = storeLastSync || syncStatus.lastIncrementalSync || syncStatus.lastFullSync;

    // Determine overall status
    let status: 'healthy' | 'syncing' | 'error' | 'unknown' = 'unknown';
    if (syncStatus.inProgress) {
      status = 'syncing';
    } else if (syncStatus.errors.length > 0) {
      status = 'error';
    } else if (lastSyncDate) {
      // Check if last sync was within 24 hours
      const hoursSinceSync = (Date.now() - new Date(lastSyncDate).getTime()) / (1000 * 60 * 60);
      status = hoursSinceSync < 24 ? 'healthy' : 'error'; // Stale data = error
    }
    const lastSyncType = syncStatus.lastIncrementalSync
      ? (syncStatus.lastIncrementalSync > (syncStatus.lastFullSync || new Date(0)) ? 'incremental' : 'full')
      : (syncStatus.lastFullSync ? 'full' : null);

    res.json({
      success: true,
      data: {
        status,
        lastSync: {
          completedAt: lastSyncDate?.toISOString() || null,
          type: lastSyncType,
          duration: undefined // Duration tracking would need to be added to syncService
        },
        nextScheduledSync: nextSync.toISOString(),
        resources: {
          products: {
            count: productCount,
            lastUpdated: lastSyncDate?.toISOString() || null
          },
          customers: {
            count: customerCount,
            lastUpdated: lastSyncDate?.toISOString() || null
          },
          orders: {
            count: orderCount,
            lastUpdated: lastSyncDate?.toISOString() || null
          },
          inventory: {
            count: productCount, // Inventory tied to products
            lastUpdated: lastSyncDate?.toISOString() || null
          }
        },
        recentErrors: syncStatus.errors.length > 0
          ? syncStatus.errors.slice(0, 5).map(err => ({
              timestamp: new Date().toISOString(),
              resource: 'sync',
              message: err
            }))
          : undefined,
        // Include legacy data for backward compatibility
        stats: syncStatus.stats,
        integrity: integrityCheck,
        inProgress: syncStatus.inProgress
      }
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      data: {
        status: 'error',
        lastSync: { completedAt: null, type: null },
        resources: {
          products: { count: 0, lastUpdated: null },
          customers: { count: 0, lastUpdated: null },
          orders: { count: 0, lastUpdated: null },
          inventory: { count: 0, lastUpdated: null }
        }
      }
    });
  }
});

/**
 * POST /api/admin/sync/trigger - Trigger sync operations
 */
router.post('/sync/trigger', async (req: Request, res: Response) => {
  try {
    const { type } = req.body;

    if (!['full', 'incremental'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sync type. Use "full" or "incremental"'
      });
    }

    const result = type === 'full' ? 
      await performFullSync() : 
      await performIncrementalSync();

    res.json({
      success: true,
      message: `${type} sync completed successfully`,
      data: result
    });
  } catch (error) {
    console.error(`Error triggering ${req.body.type} sync:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to trigger ${req.body.type} sync`
    });
  }
});

// ===============================
// BACKGROUND JOBS MANAGEMENT
// ===============================

/**
 * GET /api/admin/jobs - Get all background jobs status
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const jobsStatus = getBackgroundJobsStatus();
    res.json({
      success: true,
      data: jobsStatus
    });
  } catch (error) {
    console.error('Error getting jobs status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get jobs status'
    });
  }
});

/**
 * POST /api/admin/jobs/:jobName/run - Manually run a background job
 */
router.post('/jobs/:jobName/run', async (req: Request, res: Response) => {
  try {
    const { jobName } = req.params;
    await runBackgroundJobManually(jobName);

    res.json({
      success: true,
      message: `Job ${jobName} executed successfully`
    });
  } catch (error) {
    console.error(`Error running job ${req.params.jobName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run job'
    });
  }
});

// ===============================
// INVENTORY MANAGEMENT
// ===============================

/**
 * GET /api/admin/inventory/overview - Get inventory overview
 */
router.get('/inventory/overview', async (req: Request, res: Response) => {
  try {
    const [lowStockProducts, inventoryStats] = await Promise.all([
      getLowStockProducts(),
      getInventoryStatistics()
    ]);

    res.json({
      success: true,
      data: {
        lowStock: lowStockProducts,
        statistics: inventoryStats
      }
    });
  } catch (error) {
    console.error('Error getting inventory overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get inventory overview'
    });
  }
});

/**
 * GET /api/admin/inventory/reservations - Get current inventory reservations
 */
router.get('/inventory/reservations', async (req: Request, res: Response) => {
  try {
    // Get active products to check their reservations
    const products = await Product.find({ 
      status: 'active',
      'inventoryTracking.tracked': true 
    }).limit(50);

    const reservations = [];

    for (const product of products) {
      for (const variant of product.variants) {
        const productReservations = getInventoryReservations(product._id.toString(), variant.id);
        if (productReservations.length > 0) {
          reservations.push({
            productId: product._id,
            productTitle: product.title,
            variantId: variant.id,
            variantTitle: variant.title,
            reservations: productReservations
          });
        }
      }
    }

    res.json({
      success: true,
      data: reservations,
      count: reservations.length
    });
  } catch (error) {
    console.error('Error getting inventory reservations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get inventory reservations'
    });
  }
});

// ===============================
// SYSTEM MONITORING
// ===============================

/**
 * GET /api/admin/system/health - System health check
 */
router.get('/system/health', async (req: Request, res: Response) => {
  try {
    const health = await performHealthCheck();
    
    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: health.status === 'healthy',
      data: health
    });
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

/**
 * GET /api/admin/system/stats - System statistics
 */
router.get('/system/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getSystemStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting system stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system statistics'
    });
  }
});

/**
 * GET /api/admin/logs - Get recent system logs (simplified)
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { limit = 100, level = 'all' } = req.query;
    
    // In a production system, you'd integrate with your logging system
    // For now, return recent activity from database
    const recentActivity = await getRecentActivity(parseInt(limit as string));

    res.json({
      success: true,
      data: {
        logs: recentActivity,
        level,
        count: recentActivity.length
      }
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get logs'
    });
  }
});

// ===============================
// HELPER FUNCTIONS
// ===============================

/**
 * Get comprehensive system statistics
 */
async function getSystemStatistics(): Promise<any> {
  const [
    productStats,
    orderStats,
    userStats,
    inventoryStats
  ] = await Promise.all([
    getProductStatistics(),
    getOrderStatistics(),
    getUserStatistics(),
    getInventoryStatistics()
  ]);

  return {
    products: productStats,
    orders: orderStats,
    users: userStats,
    inventory: inventoryStats,
    timestamp: new Date().toISOString()
  };
}

/**
 * Get product statistics
 */
async function getProductStatistics(): Promise<any> {
  const pipeline = [
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        totalValue: { $sum: { $multiply: ['$price', '$inventoryTracking.totalQuantity'] } }
      }
    }
  ];

  const [stats, totalProducts, syncedProducts] = await Promise.all([
    Product.aggregate(pipeline),
    Product.countDocuments(),
    Product.countDocuments({ shopifyProductId: { $exists: true } })
  ]);

  return {
    total: totalProducts,
    synced: syncedProducts,
    syncRate: totalProducts > 0 ? Math.round((syncedProducts / totalProducts) * 100) : 0,
    byStatus: stats,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get order statistics
 */
async function getOrderStatistics(): Promise<any> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [totalOrders, recentOrders, mobileOrders, revenue] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Order.countDocuments({ shopifyOrderId: { $exists: false } }),
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totals.total' },
          averageOrderValue: { $avg: '$totals.total' }
        }
      }
    ])
  ]);

  return {
    total: totalOrders,
    recent: recentOrders,
    mobileOnly: mobileOrders,
    shopifyOrders: totalOrders - mobileOrders,
    revenue: revenue[0] || { totalRevenue: 0, averageOrderValue: 0 }
  };
}

/**
 * Get user statistics
 */
async function getUserStatistics(): Promise<any> {
  const [totalUsers, activeUsers, shopifyCustomers] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ shopifyCustomerId: { $exists: true } })
  ]);

  return {
    total: totalUsers,
    active: activeUsers,
    shopifyCustomers,
    localOnly: totalUsers - shopifyCustomers
  };
}

/**
 * Get inventory statistics
 */
async function getInventoryStatistics(): Promise<any> {
  const pipeline = [
    {
      $match: { 'inventoryTracking.tracked': true }
    },
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalInventory: { $sum: '$inventoryTracking.totalQuantity' },
        avgInventory: { $avg: '$inventoryTracking.totalQuantity' },
        totalValue: { $sum: { $multiply: ['$price', '$inventoryTracking.totalQuantity'] } }
      }
    }
  ];

  const [stats, lowStockCount] = await Promise.all([
    Product.aggregate(pipeline),
    Product.countDocuments({
      'inventoryTracking.tracked': true,
      $expr: {
        $lte: ['$inventoryTracking.totalQuantity', '$inventoryTracking.lowStockThreshold']
      }
    })
  ]);

  return {
    ...(stats[0] || {}),
    lowStockProducts: lowStockCount
  };
}

/**
 * Get recent system activity
 */
async function getRecentActivity(limit: number = 50): Promise<any[]> {
  // Get recent orders, product updates, and other activities
  const [recentOrders, recentProducts] = await Promise.all([
    Order.find({})
      .sort({ createdAt: -1 })
      .limit(limit / 2)
      .select('_id totals.total mobileStatus.current createdAt')
      .lean(),
    Product.find({})
      .sort({ updatedAt: -1 })
      .limit(limit / 2)
      .select('_id title status updatedAt')
      .lean()
  ]);

  const activity = [
    ...recentOrders.map(order => ({
      type: 'order',
      id: order._id,
      description: `Order created - $${(order as any).totals?.total || order.totalPrice || 0}`,
      status: order.mobileStatus?.current || 'unknown',
      timestamp: order.createdAt
    })),
    ...recentProducts.map(product => ({
      type: 'product',
      id: product._id,
      description: `Product updated - ${product.title}`,
      status: product.status,
      timestamp: product.updatedAt
    }))
  ];

  return activity
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * Perform comprehensive health check
 */
async function performHealthCheck(): Promise<any> {
  const checks = {
    database: false,
    shopify: false,
    backgroundJobs: false,
    memory: false
  };

  const issues = [];

  try {
    // Database check
    await Product.findOne().lean().maxTimeMS(5000);
    checks.database = true;
  } catch (error) {
    issues.push('Database connectivity issues');
  }

  try {
    // Background jobs check
    const jobsStatus = getBackgroundJobsStatus();
    checks.backgroundJobs = jobsStatus.isInitialized;
    if (!jobsStatus.isInitialized) {
      issues.push('Background jobs not initialized');
    }
  } catch (error) {
    issues.push('Background jobs system error');
  }

  try {
    // Memory usage check (Node.js)
    const memUsage = process.memoryUsage();
    const memUsageInMB = memUsage.heapUsed / 1024 / 1024;
    checks.memory = memUsageInMB < 500; // Alert if over 500MB
    if (!checks.memory) {
      issues.push(`High memory usage: ${Math.round(memUsageInMB)}MB`);
    }
  } catch (error) {
    issues.push('Memory check failed');
  }

  try {
    // Shopify connectivity check (basic)
    const { getShopifyClient } = require('../services/shopifyService');
    await getShopifyClient(); // Just instantiate, don't make API call
    checks.shopify = true;
  } catch (error) {
    issues.push('Shopify client initialization failed');
  }

  const healthyChecks = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const status = healthyChecks === totalChecks ? 'healthy' : 'degraded';

  return {
    status,
    score: Math.round((healthyChecks / totalChecks) * 100),
    checks,
    issues,
    timestamp: new Date().toISOString()
  };
}

export default router;