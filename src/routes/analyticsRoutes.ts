import { Router } from 'express';
import { authenticate, authenticateAdmin } from '../middleware/auth';
import * as analyticsController from '../controllers/analyticsController';

const router = Router();

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
router.get('/dashboard', authenticateAdmin as any, analyticsController.getCombinedDashboard);

// Legacy dashboard (existing)
router.get('/legacy-dashboard', authenticateAdmin as any, analyticsController.getDashboardAnalytics);

// ============================================
// SHOPIFY ANALYTICS (Admin only)
// ============================================

// Sales
router.get('/sales/overview', authenticateAdmin as any, analyticsController.getSalesOverview);
router.get('/sales/top-products', authenticateAdmin as any, analyticsController.getTopSellingProducts);
router.get('/sales/trends', authenticateAdmin as any, analyticsController.getSalesTrends);
router.get('/sales/by-category', authenticateAdmin as any, analyticsController.getRevenueByCategory);

// Customers
router.get('/customers/metrics', authenticateAdmin as any, analyticsController.getCustomerMetrics);

// Orders
router.get('/orders/fulfillment', authenticateAdmin as any, analyticsController.getFulfillmentStats);
router.get('/orders/recent', authenticateAdmin as any, analyticsController.getRecentOrders);

// Inventory
router.get('/inventory/low-stock', authenticateAdmin as any, analyticsController.getLowStockProducts);
router.get('/inventory/analytics', authenticateAdmin as any, analyticsController.getInventoryAnalytics);

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
router.get('/app-engagement', authenticateAdmin as any, analyticsController.getAppEngagementMetrics);
router.get('/app-stats', authenticateAdmin as any, analyticsController.getAppQuickStats);

// Engagement
router.get('/app/engagement', authenticateAdmin as any, analyticsController.getEngagementMetrics);
router.get('/app/top-products', authenticateAdmin as any, analyticsController.getTopProductsByEngagement);
router.get('/app/top-searches', authenticateAdmin as any, analyticsController.getTopSearches);
router.get('/app/platforms', authenticateAdmin as any, analyticsController.getPlatformBreakdown);
router.get('/app/funnel', authenticateAdmin as any, analyticsController.getFunnelAnalysis);
router.get('/app/hourly-activity', authenticateAdmin as any, analyticsController.getHourlyActivity);
router.get('/app/journey/:sessionId', authenticateAdmin as any, analyticsController.getUserJourney);

// ============================================
// LEGACY ANALYTICS (Existing endpoints)
// ============================================

router.get('/products', authenticateAdmin as any, analyticsController.getProductAnalytics);
router.get('/user-behavior', authenticateAdmin as any, analyticsController.getUserBehaviorAnalytics);
router.get('/revenue', authenticateAdmin as any, analyticsController.getRevenueAnalytics);

export default router;
