import express from 'express';
import { authenticateCustomer } from '../middleware/customerAuth';
import { requireAdmin } from '../middleware/auth';
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
} from '../controllers/pushNotificationController';

const router = express.Router();

// Customer endpoints
router.post('/register-token', authenticateCustomer, registerDeviceToken);
router.post('/unregister-token', authenticateCustomer, unregisterDeviceToken);
router.get('/preferences', authenticateCustomer, getNotificationPreferences);
router.patch('/preferences', authenticateCustomer, updateNotificationPreferences);

// Admin endpoints
// Broadcast notification to all store customers
router.post('/stores/:storeId/broadcast', requireAdmin as any, broadcastStoreNotification);

// Send test notification to specific customer
router.post('/test', requireAdmin as any, sendTestNotificationAdmin);

// Get notification statistics
router.get('/stores/:storeId/stats', requireAdmin as any, getNotificationStats);

// Get list of customers who can receive notifications
router.get('/stores/:storeId/recipients', requireAdmin as any, getNotificationRecipients);

// Get available customer segments for targeted notifications
router.get('/stores/:storeId/segments', requireAdmin as any, getAvailableSegments);

export default router;
