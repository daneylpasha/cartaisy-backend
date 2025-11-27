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
router.get('/dashboard', authenticateAdmin, analyticsController.getCombinedDashboard);

// Legacy dashboard (existing)
router.get('/legacy-dashboard', authenticateAdmin, analyticsController.getDashboardAnalytics);

// ============================================
// SHOPIFY ANALYTICS (Admin only)
// ============================================

// Sales
router.get('/sales/overview', authenticateAdmin, analyticsController.getSalesOverview);
router.get('/sales/top-products', authenticateAdmin, analyticsController.getTopSellingProducts);
router.get('/sales/trends', authenticateAdmin, analyticsController.getSalesTrends);
router.get('/sales/by-category', authenticateAdmin, analyticsController.getRevenueByCategory);

// Customers
router.get('/customers/metrics', authenticateAdmin, analyticsController.getCustomerMetrics);

// Orders
router.get('/orders/fulfillment', authenticateAdmin, analyticsController.getFulfillmentStats);
router.get('/orders/recent', authenticateAdmin, analyticsController.getRecentOrders);

// Inventory
router.get('/inventory/low-stock', authenticateAdmin, analyticsController.getLowStockProducts);
router.get('/inventory/analytics', authenticateAdmin, analyticsController.getInventoryAnalytics);

// ============================================
// APP ANALYTICS (Admin only)
// ============================================

// Engagement
router.get('/app/engagement', authenticateAdmin, analyticsController.getEngagementMetrics);
router.get('/app/top-products', authenticateAdmin, analyticsController.getTopProductsByEngagement);
router.get('/app/top-searches', authenticateAdmin, analyticsController.getTopSearches);
router.get('/app/platforms', authenticateAdmin, analyticsController.getPlatformBreakdown);
router.get('/app/funnel', authenticateAdmin, analyticsController.getFunnelAnalysis);
router.get('/app/hourly-activity', authenticateAdmin, analyticsController.getHourlyActivity);
router.get('/app/journey/:sessionId', authenticateAdmin, analyticsController.getUserJourney);

// ============================================
// LEGACY ANALYTICS (Existing endpoints)
// ============================================

router.get('/products', authenticateAdmin, analyticsController.getProductAnalytics);
router.get('/user-behavior', authenticateAdmin, analyticsController.getUserBehaviorAnalytics);
router.get('/revenue', authenticateAdmin, analyticsController.getRevenueAnalytics);

export default router;
