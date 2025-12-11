import { Router, RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getEmailConfig,
  updateEmailConfig,
  sendTestEmail,
  updateEmailPreferences,
} from '../controllers/emailConfigController';

const router = Router();

/**
 * Email Configuration Routes
 *
 * Admin-only routes for managing store email configuration.
 */

// All routes require authentication and admin role
router.use(authenticate as unknown as RequestHandler);
router.use(authorize('admin', 'super_admin') as unknown as RequestHandler);

/**
 * GET /stores/:storeId/email/config
 * Get email configuration for a store
 *
 * Returns:
 * - email: Full email configuration object
 * - currentConfig: Resolved configuration (with fallbacks applied)
 */
router.get(
  '/stores/:storeId/email/config',
  getEmailConfig as unknown as RequestHandler
);

/**
 * PUT /stores/:storeId/email/config
 * Update email configuration
 *
 * Body:
 * - domain?: string - Custom domain for sending emails
 * - fromName?: string - Display name for sender
 * - replyTo?: string - Reply-to email address
 * - preferences?: object - Email sending preferences
 */
router.put(
  '/stores/:storeId/email/config',
  updateEmailConfig as unknown as RequestHandler
);

/**
 * PATCH /stores/:storeId/email/preferences
 * Update email preferences only
 *
 * Body:
 * - sendOrderConfirmation?: boolean
 * - sendShippingUpdates?: boolean
 * - sendDeliveryConfirmation?: boolean
 */
router.patch(
  '/stores/:storeId/email/preferences',
  updateEmailPreferences as unknown as RequestHandler
);

/**
 * POST /stores/:storeId/email/test
 * Send a test email to verify configuration
 *
 * Body:
 * - to: string - Recipient email address
 */
router.post(
  '/stores/:storeId/email/test',
  sendTestEmail as unknown as RequestHandler
);

export default router;
