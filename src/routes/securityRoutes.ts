import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getSecurityAlerts,
  getAuditLog,
  getRequestStats,
} from '../controllers/securityController';

const router = Router();

/**
 * Security Routes
 *
 * Admin-only routes for security monitoring and audit logs.
 */

// All routes require authentication and admin role
router.use(authenticate as unknown as RequestHandler);
router.use(authorize('admin', 'super_admin') as unknown as RequestHandler);

/**
 * GET /stores/:storeId/security/alerts
 * Get security alerts for a store
 *
 * Returns:
 * - Failed access attempts (24h)
 * - High volume IPs
 * - Recent failures
 * - Server errors (1h)
 * - Error endpoints
 */
router.get(
  '/stores/:storeId/security/alerts',
  getSecurityAlerts as unknown as RequestHandler
);

/**
 * GET /stores/:storeId/security/audit-log
 * Get audit log for a store
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 50)
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - statusCode: filter by HTTP status code
 * - userId: filter by user ID
 * - endpoint: filter by endpoint (partial match)
 * - method: filter by HTTP method
 * - ip: filter by IP address
 */
router.get(
  '/stores/:storeId/security/audit-log',
  getAuditLog as unknown as RequestHandler
);

/**
 * GET /stores/:storeId/security/stats
 * Get request statistics for a store
 *
 * Query params:
 * - hours: number of hours to look back (default: 24)
 *
 * Returns:
 * - Requests by hour
 * - Top endpoints
 * - Status code distribution
 */
router.get(
  '/stores/:storeId/security/stats',
  getRequestStats as unknown as RequestHandler
);

export default router;
