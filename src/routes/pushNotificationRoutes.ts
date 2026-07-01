import express from 'express';
import { authenticateCustomer, optionalCustomerAuth } from '../middleware/customerAuth';
import { authenticate, authorize, requireStoreAdmin } from '../middleware/auth';
import { requireOwnedStoreParam } from '../middleware/storeOwnership';
import {
  registerDeviceToken,
  unregisterDeviceToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  broadcastStoreNotification,
  sendTestNotificationAdmin,
  getNotificationStats,
  getNotificationRecipients,
  getAvailableSegments,
  getNotificationHistory,
  getNotificationDetail,
  getNotificationDiagnostic,
  getScheduledNotifications,
  cancelScheduledNotification,
  sendScheduledNow,
  updateScheduledNotification,
  // Template functions
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  recordTemplateUsage,
  duplicateTemplate,
  // Engagement tracking functions
  trackNotificationEvent,
  trackNotificationOpen,
  trackNotificationClick,
  getNotificationEngagement,
} from '../controllers/pushNotificationController';
import {
  getImageUsage,
  getUploadSignature,
  registerImage,
  markImageUsed,
  deleteImage,
  getImages,
} from '../controllers/imageController';

const router = express.Router();
const storeAdminParamAuth = [authenticate, authorize('admin', 'super_admin'), requireOwnedStoreParam()];

// Customer endpoints
router.post('/register-token', authenticateCustomer, registerDeviceToken);
router.post('/unregister-token', authenticateCustomer, unregisterDeviceToken);
router.get('/preferences', authenticateCustomer, getNotificationPreferences);
router.patch('/preferences', authenticateCustomer, updateNotificationPreferences);

// Engagement tracking endpoints (customer)
// Unified tracking endpoint - handles delivered, opened, clicked events
// Uses optional auth - works with or without login (tracks by device if not logged in)
router.post('/track', optionalCustomerAuth, trackNotificationEvent);
// Legacy endpoints (deprecated - use /track with eventType instead)
router.post('/track-open', authenticateCustomer, trackNotificationOpen);
router.post('/track-click', authenticateCustomer, trackNotificationClick);

// Admin endpoints
// Broadcast notification to all store customers
router.post('/stores/:storeId/broadcast', storeAdminParamAuth as any, broadcastStoreNotification);

// Send test notification to specific customer
router.post('/test', requireStoreAdmin as any, sendTestNotificationAdmin);

// Get notification statistics
router.get('/stores/:storeId/stats', storeAdminParamAuth as any, getNotificationStats);

// Get list of customers who can receive notifications
router.get('/stores/:storeId/recipients', storeAdminParamAuth as any, getNotificationRecipients);

// Get available customer segments for targeted notifications
router.get('/stores/:storeId/segments', storeAdminParamAuth as any, getAvailableSegments);

// Notification history endpoints
// Get paginated notification history for a store
router.get('/stores/:storeId/history', storeAdminParamAuth as any, getNotificationHistory);

// Get single notification detail
router.get('/stores/:storeId/history/:notificationId', storeAdminParamAuth as any, getNotificationDetail);

// Get engagement details for a notification
router.get('/stores/:storeId/history/:notificationId/engagement', storeAdminParamAuth as any, getNotificationEngagement);

// Diagnostic endpoint for debugging push notification system
router.get('/stores/:storeId/diagnostic', storeAdminParamAuth as any, getNotificationDiagnostic);

// Scheduled notifications endpoints
// Get all scheduled notifications for a store
router.get('/stores/:storeId/scheduled', storeAdminParamAuth as any, getScheduledNotifications);

// Cancel a scheduled notification
router.post('/stores/:storeId/scheduled/:notificationId/cancel', storeAdminParamAuth as any, cancelScheduledNotification);

// Send a scheduled notification immediately
router.post('/stores/:storeId/scheduled/:notificationId/send-now', storeAdminParamAuth as any, sendScheduledNow);

// Update a scheduled notification
router.patch('/stores/:storeId/scheduled/:notificationId', storeAdminParamAuth as any, updateScheduledNotification);

// =============================================================================
// NOTIFICATION TEMPLATES
// =============================================================================

// Get all templates for a store
router.get('/stores/:storeId/templates', storeAdminParamAuth as any, getTemplates);

// Get a single template by ID
router.get('/stores/:storeId/templates/:templateId', storeAdminParamAuth as any, getTemplate);

// Create a new template
router.post('/stores/:storeId/templates', storeAdminParamAuth as any, createTemplate);

// Update a template
router.patch('/stores/:storeId/templates/:templateId', storeAdminParamAuth as any, updateTemplate);

// Delete a template (soft delete)
router.delete('/stores/:storeId/templates/:templateId', storeAdminParamAuth as any, deleteTemplate);

// Record template usage
router.post('/stores/:storeId/templates/:templateId/use', storeAdminParamAuth as any, recordTemplateUsage);

// Duplicate a template
router.post('/stores/:storeId/templates/:templateId/duplicate', storeAdminParamAuth as any, duplicateTemplate);

// =============================================================================
// IMAGE MANAGEMENT
// =============================================================================

// Get image usage for a store
router.get('/stores/:storeId/images/usage', storeAdminParamAuth as any, getImageUsage);

// Get upload signature for client-side Cloudinary upload
router.get('/stores/:storeId/images/signature', storeAdminParamAuth as any, getUploadSignature);

// Register an uploaded image (after client-side upload)
router.post('/stores/:storeId/images/register', storeAdminParamAuth as any, registerImage);

// Mark image as used in template or notification
router.post('/stores/:storeId/images/:imageId/use', storeAdminParamAuth as any, markImageUsed);

// Delete an image
router.delete('/stores/:storeId/images/:imageId', storeAdminParamAuth as any, deleteImage);

// Get all images for a store (for image picker)
router.get('/stores/:storeId/images', storeAdminParamAuth as any, getImages);

export default router;
