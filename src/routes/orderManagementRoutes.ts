import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as orderController from '../controllers/orderManagementController';

const router = Router();

/**
 * Order Management Routes
 *
 * Admin-facing routes for managing orders.
 * All routes require authentication and admin role.
 */

// Apply authentication middleware to all routes
router.use(authenticate as unknown as RequestHandler);
router.use(authorize('admin', 'super_admin') as unknown as RequestHandler);

// =============================================================================
// ORDER LISTING & SEARCH
// =============================================================================

/**
 * GET /stores/:storeId/orders
 * Get orders with filtering, searching, and pagination
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20)
 * - status: placed|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|returned
 * - paymentStatus: pending|paid|failed|refunded
 * - fulfillmentStatus: unfulfilled|partial|fulfilled|restocked|cancelled
 * - search: search by order number, email, etc.
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - sortBy: field to sort by (default: createdAt)
 * - sortOrder: asc|desc (default: desc)
 * - source: mobile|web|api|pos
 * - channel: app|website|marketplace|social
 */
router.get('/stores/:storeId/orders', orderController.getOrders as unknown as RequestHandler);

/**
 * GET /orders (without storeId - for all orders)
 * Get all orders with filtering
 */
router.get('/orders', orderController.getOrders as unknown as RequestHandler);

// =============================================================================
// SINGLE ORDER OPERATIONS
// =============================================================================

/**
 * GET /orders/:orderId
 * Get single order details
 */
router.get('/orders/:orderId', orderController.getOrderDetails as unknown as RequestHandler);

/**
 * PATCH /orders/:orderId/status
 * Update order status, tracking, and notes
 *
 * Body:
 * - status: placed|confirmed|processing|shipped|out_for_delivery|delivered|cancelled|returned
 * - paymentStatus: pending|paid|failed|refunded
 * - fulfillmentStatus: unfulfilled|partial|fulfilled|restocked|cancelled
 * - trackingNumber: string
 * - trackingUrl: string
 * - carrier: string
 * - estimatedDelivery: ISO date string
 * - merchantNote: string
 */
router.patch('/orders/:orderId/status', orderController.updateOrderStatus as unknown as RequestHandler);

/**
 * POST /orders/:orderId/notes
 * Add merchant note to order
 *
 * Body:
 * - note: string (required)
 */
router.post('/orders/:orderId/notes', orderController.addMerchantNote as unknown as RequestHandler);

// =============================================================================
// EXPORT OPERATIONS
// =============================================================================

/**
 * GET /stores/:storeId/orders/export
 * Export orders to CSV
 *
 * Query params:
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - status: filter by status
 * - paymentStatus: filter by payment status
 * - fulfillmentStatus: filter by fulfillment status
 */
router.get('/stores/:storeId/orders/export', orderController.exportOrders as unknown as RequestHandler);

/**
 * GET /orders/export (without storeId)
 * Export all orders to CSV
 */
router.get('/orders/export', orderController.exportOrders as unknown as RequestHandler);

/**
 * GET /orders/:orderId/export
 * Export single order details (for printing/invoice)
 */
router.get('/orders/:orderId/export', orderController.exportOrderDetails as unknown as RequestHandler);

// =============================================================================
// SHOPIFY SYNC OPERATIONS
// =============================================================================

/**
 * POST /orders/:orderId/sync-shopify
 * Manually sync order to Shopify (create draft order)
 */
router.post('/orders/:orderId/sync-shopify', orderController.syncToShopify as unknown as RequestHandler);

/**
 * POST /orders/:orderId/complete-shopify
 * Complete draft order in Shopify (convert to actual order)
 */
router.post('/orders/:orderId/complete-shopify', orderController.completeDraftOrder as unknown as RequestHandler);

// =============================================================================
// ANALYTICS & STATISTICS
// =============================================================================

/**
 * GET /stores/:storeId/orders/stats
 * Get order statistics and analytics
 *
 * Query params:
 * - startDate: ISO date string
 * - endDate: ISO date string
 */
router.get('/stores/:storeId/orders/stats', orderController.getOrderStats as unknown as RequestHandler);

/**
 * GET /orders/stats (without storeId)
 * Get statistics for all orders
 */
router.get('/orders/stats', orderController.getOrderStats as unknown as RequestHandler);

// =============================================================================
// BULK OPERATIONS
// =============================================================================

/**
 * POST /orders/bulk-update
 * Bulk update multiple orders
 *
 * Body:
 * - orderIds: string[] (required)
 * - updates: { status?, paymentStatus?, fulfillmentStatus? }
 */
router.post('/orders/bulk-update', orderController.bulkUpdateOrders as unknown as RequestHandler);

export default router;
