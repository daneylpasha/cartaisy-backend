import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  listCustomers,
  searchCustomers,
  getCustomerDetail,
  getCustomerOrders,
  getCustomerActivity,
  getCustomerStats,
} from '../controllers/admin/customerManagementController';

// Data Export controllers (GDPR compliance)
import {
  adminRequestDataExport,
  adminGetDataExports,
} from '../controllers/dataExportController';

const router = express.Router();

/**
 * Customer Management Routes
 *
 * Admin endpoints for managing store customers.
 * All routes require authentication and admin role.
 *
 * Routes:
 * - GET  /stores/:storeId/customers           - List customers (paginated)
 * - GET  /stores/:storeId/customers/search    - Search customers
 * - GET  /stores/:storeId/customers/stats     - Customer statistics
 * - GET  /stores/:storeId/customers/:customerId         - Customer detail
 * - GET  /stores/:storeId/customers/:customerId/orders  - Customer orders
 * - GET  /stores/:storeId/customers/:customerId/activity - Customer activity
 */

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// =============================================================================
// CUSTOMER LIST & SEARCH
// =============================================================================

/**
 * GET /stores/:storeId/customers
 *
 * List customers with pagination, sorting, and filtering
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - sortBy: 'createdAt' | 'lastOrderDate' | 'totalSpent' | 'orderCount'
 * - sortOrder: 'asc' | 'desc' (default: 'desc')
 * - dateFrom: ISO date string
 * - dateTo: ISO date string
 * - hasOrders: 'true' | 'false'
 * - segment: 'all' | 'new' | 'returning' | 'high_value' | 'at_risk' | 'inactive'
 */
router.get('/stores/:storeId/customers', listCustomers);

/**
 * GET /stores/:storeId/customers/search
 *
 * Search customers by name, email, or phone
 *
 * Query params:
 * - q: search query (min 2 characters)
 * - limit: number (default: 20, max: 50)
 */
router.get('/stores/:storeId/customers/search', searchCustomers);

/**
 * GET /stores/:storeId/customers/stats
 *
 * Get customer statistics for the store
 *
 * Returns:
 * - Overview (total, active, new customers, conversion rate)
 * - Platform breakdown (iOS vs Android)
 * - Revenue metrics (total, average customer value)
 */
router.get('/stores/:storeId/customers/stats', getCustomerStats);

// =============================================================================
// INDIVIDUAL CUSTOMER ENDPOINTS
// =============================================================================

/**
 * GET /stores/:storeId/customers/:customerId
 *
 * Get detailed customer profile
 *
 * Returns:
 * - All profile fields
 * - Addresses
 * - Payment method count (not details)
 * - Order summary (count, total spent, average order value)
 * - App engagement (last active, notification preferences, device info)
 */
router.get('/stores/:storeId/customers/:customerId', getCustomerDetail);

/**
 * GET /stores/:storeId/customers/:customerId/orders
 *
 * Get paginated order history for a specific customer
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 *
 * Returns:
 * - Order ID, order number
 * - Date, status
 * - Total, item count, currency
 */
router.get('/stores/:storeId/customers/:customerId/orders', getCustomerOrders);

/**
 * GET /stores/:storeId/customers/:customerId/activity
 *
 * Get recent activity/events for a customer
 *
 * Query params:
 * - limit: number (default: 50, max: 200)
 *
 * Returns:
 * - Product views, searches, cart activity
 * - Event summary by type
 */
router.get('/stores/:storeId/customers/:customerId/activity', getCustomerActivity);

// =============================================================================
// DATA EXPORT ENDPOINTS (GDPR Compliance)
// =============================================================================

/**
 * POST /stores/:storeId/customers/:customerId/data-export
 *
 * Initiate GDPR data export for a customer (merchant-initiated)
 *
 * Returns:
 * - Export ID, status
 * - Complete user data export
 *
 * Rate limit: 1 request per 24 hours per customer
 */
router.post('/stores/:storeId/customers/:customerId/data-export', adminRequestDataExport);

/**
 * GET /stores/:storeId/data-exports
 *
 * List all data export requests for the store
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
 *
 * Returns:
 * - Paginated list of export requests with customer info
 */
router.get('/stores/:storeId/data-exports', adminGetDataExports);

export default router;
