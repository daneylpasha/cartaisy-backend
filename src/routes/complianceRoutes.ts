import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  exportCustomerData,
  exportAllCustomersData,
  getExportStatus,
  getExportHistory,
  deleteCustomerData,
  downloadExportData,
} from '../controllers/admin/complianceController';

const router = express.Router();

/**
 * GDPR Compliance Routes
 *
 * Admin endpoints for GDPR data export and deletion.
 * All routes require authentication and admin role.
 *
 * Routes:
 * - POST /stores/:storeId/compliance/export/customer/:customerId  - Export single customer
 * - POST /stores/:storeId/compliance/export/all                   - Export all customers
 * - GET  /stores/:storeId/compliance/export/:exportId             - Get export status
 * - GET  /stores/:storeId/compliance/export/:exportId/download    - Download export
 * - GET  /stores/:storeId/compliance/exports                      - Get export history
 * - POST /stores/:storeId/compliance/delete/customer/:customerId  - Delete customer data
 */

// Apply authentication and admin authorization to all routes
router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

// =============================================================================
// DATA EXPORT ENDPOINTS
// =============================================================================

/**
 * POST /stores/:storeId/compliance/export/customer/:customerId
 *
 * Export all data for a specific customer (GDPR Article 20 - Data Portability)
 *
 * Returns:
 * - Export ID and status
 * - Complete customer data export
 */
router.post('/stores/:storeId/compliance/export/customer/:customerId', exportCustomerData);

/**
 * POST /stores/:storeId/compliance/export/all
 *
 * Export all customer data for the entire store (bulk export)
 *
 * WARNING: This can be resource-intensive for large stores.
 * Consider implementing pagination or background processing for production.
 *
 * Returns:
 * - Export ID
 * - Array of all customer data exports
 */
router.post('/stores/:storeId/compliance/export/all', exportAllCustomersData);

/**
 * GET /stores/:storeId/compliance/export/:exportId
 *
 * Get status of a specific export request
 *
 * Returns:
 * - Export status (pending, processing, completed, failed, expired)
 * - Export metadata (size, categories, dates)
 * - Download URL if completed
 */
router.get('/stores/:storeId/compliance/export/:exportId', getExportStatus);

/**
 * GET /stores/:storeId/compliance/export/:exportId/download
 *
 * Download the exported data as JSON file
 *
 * Returns:
 * - JSON file with all customer data
 */
router.get('/stores/:storeId/compliance/export/:exportId/download', downloadExportData);

/**
 * GET /stores/:storeId/compliance/exports
 *
 * Get all export requests for the store
 *
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 * - status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired'
 *
 * Returns:
 * - Paginated list of export requests
 */
router.get('/stores/:storeId/compliance/exports', getExportHistory);

// =============================================================================
// DATA DELETION ENDPOINTS (RIGHT TO BE FORGOTTEN)
// =============================================================================

/**
 * POST /stores/:storeId/compliance/delete/customer/:customerId
 *
 * Delete all personal data for a customer (GDPR Article 17 - Right to be Forgotten)
 *
 * Body:
 * - confirmDelete: boolean (required, must be true)
 * - reason: string (optional, for audit purposes)
 *
 * This will:
 * - Anonymize orders (preserve for financial records)
 * - Delete payment methods
 * - Delete search history
 * - Delete product views
 * - Delete cart activity
 * - Delete wishlists
 * - Delete notification data
 * - Anonymize audit logs
 * - Delete customer account
 *
 * Returns:
 * - Deletion summary with counts
 */
router.post('/stores/:storeId/compliance/delete/customer/:customerId', deleteCustomerData);

export default router;
