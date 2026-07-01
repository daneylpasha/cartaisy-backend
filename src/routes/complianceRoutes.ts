import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
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
 * Authentication is applied per-route to avoid affecting other routes.
 *
 * Routes:
 * - POST /stores/:storeId/compliance/export/customer/:customerId  - Export single customer
 * - POST /stores/:storeId/compliance/export/all                   - Export all customers
 * - GET  /stores/:storeId/compliance/export/:exportId             - Get export status
 * - GET  /stores/:storeId/compliance/export/:exportId/download    - Download export
 * - GET  /stores/:storeId/compliance/exports                      - Get export history
 * - POST /stores/:storeId/compliance/delete/customer/:customerId  - Delete customer data
 */

// Middleware array for admin authentication
const adminAuth = [authenticate, authorize('admin', 'super_admin'), requireOwnedStoreParam()];

// =============================================================================
// DATA EXPORT ENDPOINTS
// =============================================================================

/**
 * POST /stores/:storeId/compliance/export/customer/:customerId
 *
 * Export all data for a specific customer (GDPR Article 20 - Data Portability)
 */
router.post('/stores/:storeId/compliance/export/customer/:customerId', adminAuth, exportCustomerData);

/**
 * POST /stores/:storeId/compliance/export/all
 *
 * Export all customer data for the entire store (bulk export)
 */
router.post('/stores/:storeId/compliance/export/all', adminAuth, exportAllCustomersData);

/**
 * GET /stores/:storeId/compliance/export/:exportId
 *
 * Get status of a specific export request
 */
router.get('/stores/:storeId/compliance/export/:exportId', adminAuth, getExportStatus);

/**
 * GET /stores/:storeId/compliance/export/:exportId/download
 *
 * Download the exported data as JSON file
 */
router.get('/stores/:storeId/compliance/export/:exportId/download', adminAuth, downloadExportData);

/**
 * GET /stores/:storeId/compliance/exports
 *
 * Get all export requests for the store
 */
router.get('/stores/:storeId/compliance/exports', adminAuth, getExportHistory);

// =============================================================================
// DATA DELETION ENDPOINTS (RIGHT TO BE FORGOTTEN)
// =============================================================================

/**
 * POST /stores/:storeId/compliance/delete/customer/:customerId
 *
 * Delete all personal data for a customer (GDPR Article 17 - Right to be Forgotten)
 */
router.post('/stores/:storeId/compliance/delete/customer/:customerId', adminAuth, deleteCustomerData);

export default router;
