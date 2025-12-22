import express from 'express';
import { authenticateCustomer } from '../middleware/customerAuth';
import { requireStoreAdmin } from '../middleware/auth';
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

// Customer endpoints
router.post('/register-token', authenticateCustomer, registerDeviceToken);
router.post('/unregister-token', authenticateCustomer, unregisterDeviceToken);
router.get('/preferences', authenticateCustomer, getNotificationPreferences);
router.patch('/preferences', authenticateCustomer, updateNotificationPreferences);

// Engagement tracking endpoints (customer)
// Unified tracking endpoint - handles delivered, opened, clicked events
router.post('/track', authenticateCustomer, trackNotificationEvent);
// Legacy endpoints (deprecated - use /track with eventType instead)
router.post('/track-open', authenticateCustomer, trackNotificationOpen);
router.post('/track-click', authenticateCustomer, trackNotificationClick);

// Admin endpoints
// Broadcast notification to all store customers
router.post('/stores/:storeId/broadcast', requireStoreAdmin as any, broadcastStoreNotification);

// Send test notification to specific customer
router.post('/test', requireStoreAdmin as any, sendTestNotificationAdmin);

// Get notification statistics
router.get('/stores/:storeId/stats', requireStoreAdmin as any, getNotificationStats);

// Get list of customers who can receive notifications
router.get('/stores/:storeId/recipients', requireStoreAdmin as any, getNotificationRecipients);

// Get available customer segments for targeted notifications
router.get('/stores/:storeId/segments', requireStoreAdmin as any, getAvailableSegments);

// Notification history endpoints
// Get paginated notification history for a store
router.get('/stores/:storeId/history', requireStoreAdmin as any, getNotificationHistory);

// Get single notification detail
router.get('/stores/:storeId/history/:notificationId', requireStoreAdmin as any, getNotificationDetail);

// Get engagement details for a notification
router.get('/stores/:storeId/history/:notificationId/engagement', requireStoreAdmin as any, getNotificationEngagement);

// Diagnostic endpoint for debugging push notification system
router.get('/stores/:storeId/diagnostic', requireStoreAdmin as any, getNotificationDiagnostic);

// Scheduled notifications endpoints
// Get all scheduled notifications for a store
router.get('/stores/:storeId/scheduled', requireStoreAdmin as any, getScheduledNotifications);

// Cancel a scheduled notification
router.post('/stores/:storeId/scheduled/:notificationId/cancel', requireStoreAdmin as any, cancelScheduledNotification);

// Send a scheduled notification immediately
router.post('/stores/:storeId/scheduled/:notificationId/send-now', requireStoreAdmin as any, sendScheduledNow);

// Update a scheduled notification
router.patch('/stores/:storeId/scheduled/:notificationId', requireStoreAdmin as any, updateScheduledNotification);

// =============================================================================
// NOTIFICATION TEMPLATES
// =============================================================================

// Get all templates for a store
router.get('/stores/:storeId/templates', requireStoreAdmin as any, getTemplates);

// Get a single template by ID
router.get('/stores/:storeId/templates/:templateId', requireStoreAdmin as any, getTemplate);

// Create a new template
router.post('/stores/:storeId/templates', requireStoreAdmin as any, createTemplate);

// Update a template
router.patch('/stores/:storeId/templates/:templateId', requireStoreAdmin as any, updateTemplate);

// Delete a template (soft delete)
router.delete('/stores/:storeId/templates/:templateId', requireStoreAdmin as any, deleteTemplate);

// Record template usage
router.post('/stores/:storeId/templates/:templateId/use', requireStoreAdmin as any, recordTemplateUsage);

// Duplicate a template
router.post('/stores/:storeId/templates/:templateId/duplicate', requireStoreAdmin as any, duplicateTemplate);

// =============================================================================
// IMAGE MANAGEMENT
// =============================================================================

// Get image usage for a store
router.get('/stores/:storeId/images/usage', requireStoreAdmin as any, getImageUsage);

// Get upload signature for client-side Cloudinary upload
router.get('/stores/:storeId/images/signature', requireStoreAdmin as any, getUploadSignature);

// Register an uploaded image (after client-side upload)
router.post('/stores/:storeId/images/register', requireStoreAdmin as any, registerImage);

// Mark image as used in template or notification
router.post('/stores/:storeId/images/:imageId/use', requireStoreAdmin as any, markImageUsed);

// Delete an image
router.delete('/stores/:storeId/images/:imageId', requireStoreAdmin as any, deleteImage);

// Get all images for a store (for image picker)
router.get('/stores/:storeId/images', requireStoreAdmin as any, getImages);

export default router;
