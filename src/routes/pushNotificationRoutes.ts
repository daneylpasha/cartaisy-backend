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
} from '../controllers/pushNotificationController';

const router = express.Router();

// Customer endpoints
router.post('/register-token', authenticateCustomer, registerDeviceToken);
router.post('/unregister-token', authenticateCustomer, unregisterDeviceToken);
router.get('/preferences', authenticateCustomer, getNotificationPreferences);
router.patch('/preferences', authenticateCustomer, updateNotificationPreferences);

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

export default router;
