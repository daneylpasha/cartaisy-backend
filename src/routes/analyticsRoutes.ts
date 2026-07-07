import { Router } from 'express';
import { authenticateAdmin } from '../middleware/auth';
import { requireOwnedStoreContext } from '../middleware/storeOwnership';
import * as analyticsController from '../controllers/analyticsController';

const router = Router();

// Admin analytics must bind to a VALIDATED store context (issue #79):
// requireOwnedStoreContext overwrites any untrusted req.storeId a raw
// X-Store-ID header may have set. Store admins always resolve to their own
// store (403 on any other supplied store); super admins may target a store
// explicitly or, with no store supplied, get the platform-wide aggregate.
const adminAnalytics = [
  ...(authenticateAdmin as any[]),
  requireOwnedStoreContext({ required: false }),
] as any[];

// ============================================
// PUBLIC ROUTES (Mobile App Event Tracking)
// ============================================

// Track single event
router.post('/events/track', analyticsController.trackEvent);

// Track batch events
router.post('/events/track-batch', analyticsController.trackEventsBatch);

// ============================================
// ADMIN ROUTES (Dashboard Analytics)
// ============================================

// Combined dashboard (Shopify + App)
router.get('/dashboard', ...adminAnalytics, analyticsController.getCombinedDashboard);

// Legacy dashboard (existing)
router.get('/legacy-dashboard', ...adminAnalytics, analyticsController.getDashboardAnalytics);

// ============================================
// SHOPIFY ANALYTICS (Admin only)
// ============================================

// Sales
router.get('/sales/overview', ...adminAnalytics, analyticsController.getSalesOverview);
router.get('/sales/top-products', ...adminAnalytics, analyticsController.getTopSellingProducts);
router.get('/sales/trends', ...adminAnalytics, analyticsController.getSalesTrends);
router.get('/sales/by-category', ...adminAnalytics, analyticsController.getRevenueByCategory);

// Customers
router.get('/customers/metrics', ...adminAnalytics, analyticsController.getCustomerMetrics);

// Orders
router.get('/orders/fulfillment', ...adminAnalytics, analyticsController.getFulfillmentStats);
router.get('/orders/recent', ...adminAnalytics, analyticsController.getRecentOrders);

// Inventory
router.get('/inventory/low-stock', ...adminAnalytics, analyticsController.getLowStockProducts);
router.get('/inventory/analytics', ...adminAnalytics, analyticsController.getInventoryAnalytics);

// ============================================
// SESSION TRACKING (DAU/MAU) - PUBLIC
// ============================================

// Record session event (app_open, app_close, app_backgrounded)
// Rate limited: Max 1 app_open per device per 5 minutes
router.post('/session', analyticsController.recordSession);

// ============================================
// APP ANALYTICS (Admin only)
// ============================================

// DAU/MAU Engagement Metrics
router.get('/app-engagement', ...adminAnalytics, analyticsController.getAppEngagementMetrics);
router.get('/app-stats', ...adminAnalytics, analyticsController.getAppQuickStats);

// Engagement
router.get('/app/engagement', ...adminAnalytics, analyticsController.getEngagementMetrics);
router.get('/app/top-products', ...adminAnalytics, analyticsController.getTopProductsByEngagement);
router.get('/app/top-searches', ...adminAnalytics, analyticsController.getTopSearches);
router.get('/app/platforms', ...adminAnalytics, analyticsController.getPlatformBreakdown);
router.get('/app/funnel', ...adminAnalytics, analyticsController.getFunnelAnalysis);
router.get('/app/hourly-activity', ...adminAnalytics, analyticsController.getHourlyActivity);
router.get('/app/journey/:sessionId', ...adminAnalytics, analyticsController.getUserJourney);

// ============================================
// LEGACY ANALYTICS (Existing endpoints)
// ============================================

router.get('/products', ...adminAnalytics, analyticsController.getProductAnalytics);
router.get('/user-behavior', ...adminAnalytics, analyticsController.getUserBehaviorAnalytics);
router.get('/revenue', ...adminAnalytics, analyticsController.getRevenueAnalytics);

export default router;
