import admin from 'firebase-admin';

/**
 * Push notification payload interface
 */
export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;
let isInitialized = false;

try {
  // Parse service account from environment variable
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    isInitialized = true;
    console.log('✅ Firebase Admin SDK initialized successfully');
  } else {
    console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not found in environment variables');
    console.warn('⚠️  Push notifications will be disabled until credentials are added');
    console.warn('⚠️  Get credentials from: Firebase Console → Project Settings → Service Accounts');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error);
  console.error('Push notifications will be disabled');
}

export class FirebaseNotificationService {
  /**
   * Check if Firebase is properly initialized
   */
  static isInitialized(): boolean {
    return isInitialized;
  }

  /**
   * Get Firebase app instance
   */
  static getApp(): admin.app.App | null {
    return firebaseApp;
  }

  /**
   * Subscribe device token to a topic
   * Topics allow sending notifications to groups (e.g., all store customers)
   */
  static async subscribeToTopic(
    deviceToken: string,
    storeId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!firebaseApp) {
      return {
        success: false,
        error: 'Firebase not initialized',
      };
    }

    try {
      const topic = `store_${storeId}`;

      await admin.messaging().subscribeToTopic([deviceToken], topic);

      console.log(`✅ Subscribed device to topic: ${topic}`);

      return { success: true };
    } catch (error: any) {
      console.error('Subscribe to topic error:', error);
      return {
        success: false,
        error: error.message || 'Failed to subscribe to topic',
      };
    }
  }

  /**
   * Unsubscribe device token from a topic
   */
  static async unsubscribeFromTopic(
    deviceToken: string,
    storeId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!firebaseApp) {
      return {
        success: false,
        error: 'Firebase not initialized',
      };
    }

    try {
      const topic = `store_${storeId}`;

      await admin.messaging().unsubscribeFromTopic([deviceToken], topic);

      console.log(`✅ Unsubscribed device from topic: ${topic}`);

      return { success: true };
    } catch (error: any) {
      console.error('Unsubscribe from topic error:', error);
      return {
        success: false,
        error: error.message || 'Failed to unsubscribe from topic',
      };
    }
  }

  /**
   * Subscribe multiple device tokens to a topic
   * Useful for bulk operations
   */
  static async subscribeMultipleToTopic(
    deviceTokens: string[],
    storeId: string
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!firebaseApp || deviceTokens.length === 0) {
      return { successCount: 0, failureCount: deviceTokens.length };
    }

    try {
      const topic = `store_${storeId}`;

      const response = await admin.messaging().subscribeToTopic(deviceTokens, topic);

      console.log(
        `✅ Subscribed ${response.successCount}/${deviceTokens.length} devices to topic: ${topic}`
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      console.error('Subscribe multiple to topic error:', error);
      return { successCount: 0, failureCount: deviceTokens.length };
    }
  }

  /**
   * Send notification to specific device tokens
   * Use this for individual customer notifications (e.g., order updates)
   */
  static async sendToDevices(
    deviceTokens: string[],
    notification: PushNotification
  ): Promise<{
    success: number;
    failure: number;
    invalidTokens: string[];
  }> {
    if (!firebaseApp) {
      console.warn('Firebase not initialized. Cannot send notification.');
      return {
        success: 0,
        failure: deviceTokens.length,
        invalidTokens: [],
      };
    }

    try {
      // Filter out empty/invalid tokens
      const validTokens = deviceTokens.filter(
        (token) => token && typeof token === 'string' && token.length > 20
      );

      if (validTokens.length === 0) {
        console.warn('No valid device tokens provided');
        return { success: 0, failure: 0, invalidTokens: [] };
      }

      // Log tokens being sent to (for debugging)
      console.log(`📤 Sending push notification to ${validTokens.length} device(s):`);
      console.log(`   Title: "${notification.title}"`);
      console.log(`   Body: "${notification.body}"`);
      validTokens.forEach((token, idx) => {
        console.log(`   Token ${idx + 1}: ${token.substring(0, 40)}...`);
      });

      // Build FCM message
      const message: admin.messaging.MulticastMessage = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        tokens: validTokens,

        // Android-specific configuration
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
            channelId: 'orders', // Must be created in mobile app
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },

        // iOS-specific configuration
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true,
            },
          },
          headers: {
            'apns-priority': '10',
          },
        },
      };

      // Send notification
      const response = await admin.messaging().sendEachForMulticast(message);

      // Log results
      console.log(`📱 Push notification result:`);
      console.log(`   ✅ Success: ${response.successCount}`);
      console.log(`   ❌ Failed: ${response.failureCount}`);

      // Collect invalid tokens for cleanup and log ALL errors
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && validTokens[idx]) {
          const error = resp.error as any;
          const errorCode = error?.code || 'unknown';
          const errorMessage = error?.message || 'No error message';

          // Log EVERY error with full details
          console.log(`   ❌ Token ${idx + 1} failed:`);
          console.log(`      Token: ${validTokens[idx].substring(0, 40)}...`);
          console.log(`      Error Code: ${errorCode}`);
          console.log(`      Error Message: ${errorMessage}`);

          // These error codes mean the token is invalid/expired
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.push(validTokens[idx]);
            console.log(`      Action: Token marked for removal`);
          }
        }
      });

      if (invalidTokens.length > 0) {
        console.log(`   🗑️  Invalid tokens to remove: ${invalidTokens.length}`);
      }

      return {
        success: response.successCount,
        failure: response.failureCount,
        invalidTokens,
      };
    } catch (error: any) {
      console.error('🔥 Firebase send error (exception):');
      console.error(`   Error name: ${error?.name || 'Unknown'}`);
      console.error(`   Error code: ${error?.code || 'Unknown'}`);
      console.error(`   Error message: ${error?.message || 'No message'}`);
      console.error(`   Full error:`, error);
      return {
        success: 0,
        failure: deviceTokens.length,
        invalidTokens: [],
      };
    }
  }

  /**
   * Send notification to topic (all subscribers)
   * Use this for store-wide announcements
   */
  static async sendToTopic(
    storeId: string,
    notification: PushNotification
  ): Promise<{ success: boolean; messageId: string | null }> {
    if (!firebaseApp) {
      console.warn('Firebase not initialized. Cannot send notification.');
      return { success: false, messageId: null };
    }

    try {
      const topic = `store_${storeId}`;

      const message: admin.messaging.Message = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        topic,

        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
          },
        },

        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const messageId = await admin.messaging().send(message);

      console.log(`📱 Notification sent to topic: ${topic}`);
      console.log(`   Message ID: ${messageId}`);

      return { success: true, messageId };
    } catch (error: any) {
      console.error(`Send to topic error (store_${storeId}):`, error);
      return { success: false, messageId: null };
    }
  }

  /**
   * Remove invalid device tokens from database
   * Called automatically after sending notifications
   */
  static async removeInvalidTokens(invalidTokens: string[]): Promise<void> {
    if (invalidTokens.length === 0) return;

    try {
      const Customer = require('../models/Customer').default;

      for (const token of invalidTokens) {
        await Customer.updateMany(
          { 'deviceTokens.token': token },
          { $pull: { deviceTokens: { token } } }
        );
      }

      console.log(
        `🗑️  Removed ${invalidTokens.length} invalid device token(s) from database`
      );
    } catch (error) {
      console.error('Remove invalid tokens error:', error);
    }
  }

  /**
   * Send order-related notification
   * Helper method that handles the common pattern of:
   * 1. Get customer's device tokens
   * 2. Send notification
   * 3. Cleanup invalid tokens
   */
  static async sendOrderNotification(
    order: any,
    type: 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  ): Promise<void> {
    try {
      // Get customer
      const Customer = require('../models/Customer').default;

      let customer = null;
      if (order.customer) {
        customer = await Customer.findById(order.customer);
      }

      if (!customer) {
        console.log('No customer found for order notification');
        return;
      }

      // Check if customer wants order update notifications
      if (!customer.notificationPreferences?.orderUpdates) {
        console.log('Customer has disabled order update notifications');
        return;
      }

      // Get customer's device tokens
      const deviceTokens = customer.getActiveDeviceTokens();

      if (deviceTokens.length === 0) {
        console.log('Customer has no registered devices');
        return;
      }

      // Build notification based on type
      let notification: PushNotification;

      switch (type) {
        case 'confirmed':
          notification = {
            title: 'Order Confirmed',
            body: `Your order ${order.orderNumber} has been confirmed!`,
            data: {
              type: 'order',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              action: 'view_order',
            },
          };
          break;

        case 'shipped':
          notification = {
            title: 'Order Shipped',
            body: `Your order ${order.orderNumber} is on its way!`,
            data: {
              type: 'order',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              trackingNumber: order.shipping?.trackingNumber || '',
              action: 'track_order',
            },
          };
          break;

        case 'delivered':
          notification = {
            title: 'Order Delivered',
            body: `Your order ${order.orderNumber} has been delivered!`,
            data: {
              type: 'order',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              action: 'rate_order',
            },
          };
          break;

        case 'cancelled':
          notification = {
            title: 'Order Cancelled',
            body: `Your order ${order.orderNumber} has been cancelled.`,
            data: {
              type: 'order',
              orderId: order._id.toString(),
              orderNumber: order.orderNumber,
              action: 'view_order',
            },
          };
          break;
      }

      // Send notification
      const result = await this.sendToDevices(deviceTokens, notification);

      // Cleanup invalid tokens
      if (result.invalidTokens.length > 0) {
        await this.removeInvalidTokens(result.invalidTokens);
      }

      console.log(`✅ Order ${type} notification sent to customer ${customer._id}`);
    } catch (error) {
      console.error(`Send order notification error (${type}):`, error);
      // Don't throw - notification failure shouldn't break order flow
    }
  }
}
