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

/**
 * Failed token details for logging
 */
export interface FailedTokenDetail {
  token: string;
  error: string;
  errorCode?: string;
}

/**
 * Detailed notification send result for logging
 */
export interface NotificationSendResult {
  targetCount: number;
  successCount: number;
  failureCount: number;
  failedTokens: FailedTokenDetail[];
  invalidTokens: string[];
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
   * Returns detailed result for logging purposes
   */
  static async sendToDevices(
    deviceTokens: string[],
    notification: PushNotification
  ): Promise<NotificationSendResult> {
    const result: NotificationSendResult = {
      targetCount: deviceTokens.length,
      successCount: 0,
      failureCount: 0,
      failedTokens: [],
      invalidTokens: [],
    };

    if (!firebaseApp) {
      console.warn('Firebase not initialized. Cannot send notification.');
      result.failureCount = deviceTokens.length;
      result.failedTokens.push({
        token: 'all',
        error: 'Firebase not initialized',
        errorCode: 'firebase/not-initialized',
      });
      return result;
    }

    try {
      // Filter out empty/invalid tokens
      const validTokens = deviceTokens.filter(
        (token) => token && typeof token === 'string' && token.length > 20
      );

      result.targetCount = validTokens.length;

      if (validTokens.length === 0) {
        console.warn('No valid device tokens provided');
        return result;
      }

      // Log tokens being sent to (for debugging)
      console.log(`📤 Sending push notification to ${validTokens.length} device(s):`);
      console.log(`   Title: "${notification.title}"`);
      console.log(`   Body: "${notification.body}"`);
      console.log(`   Image: "${notification.imageUrl || 'none'}"`);
      validTokens.forEach((token, idx) => {
        console.log(`   Token ${idx + 1}: ${token.substring(0, 40)}...`);
      });

      // Build FCM message
      const message: admin.messaging.MulticastMessage = {
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
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
            ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
          },
        },

        // iOS-specific configuration
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body,
              },
              sound: 'default',
              badge: 1,
              'mutable-content': 1, // Required for iOS to display images
            },
          },
          headers: {
            'apns-push-type': 'alert',
            'apns-priority': '10',
          },
          fcmOptions: {
            ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
          },
        },
      };

      // Send notification
      const response = await admin.messaging().sendEachForMulticast(message);

      // Update result with response counts
      result.successCount = response.successCount;
      result.failureCount = response.failureCount;

      // Log results
      console.log(`📱 Push notification result:`);
      console.log(`   ✅ Success: ${response.successCount}`);
      console.log(`   ❌ Failed: ${response.failureCount}`);

      // Collect failed token details and invalid tokens for cleanup
      response.responses.forEach((resp, idx) => {
        if (!resp.success && validTokens[idx]) {
          const error = resp.error as any;
          const errorCode = error?.code || 'unknown';
          const errorMessage = error?.message || 'No error message';

          // Log EVERY error with full details
          console.log(`   ❌ Token ${idx + 1} failed:`);
          console.log(`      Token: ${validTokens[idx].substring(0, 50)}...`);
          console.log(`      Error Code: ${errorCode}`);
          console.log(`      Error Message: ${errorMessage}`);
          console.log(`      Full Error JSON: ${JSON.stringify(error, null, 2)}`);

          // Add to failed tokens (cap at 50 to avoid huge documents)
          if (result.failedTokens.length < 50) {
            result.failedTokens.push({
              token: validTokens[idx].substring(0, 30) + '...',
              error: errorMessage,
              errorCode: errorCode,
            });
          }

          // These error codes mean the token is invalid/expired
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            result.invalidTokens.push(validTokens[idx]);
            console.log(`      Action: Token marked for removal`);
          }
        }
      });

      if (result.invalidTokens.length > 0) {
        console.log(`   🗑️  Invalid tokens to remove: ${result.invalidTokens.length}`);
      }

      return result;
    } catch (error: any) {
      console.error('🔥 Firebase send error (exception):');
      console.error(`   Error name: ${error?.name || 'Unknown'}`);
      console.error(`   Error code: ${error?.code || 'Unknown'}`);
      console.error(`   Error message: ${error?.message || 'No message'}`);
      console.error(`   Full error:`, error);

      result.failureCount = deviceTokens.length;
      result.failedTokens.push({
        token: 'all',
        error: error?.message || 'Batch send failed',
        errorCode: error?.code,
      });

      return result;
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

      console.log(`📤 Sending push notification to topic: ${topic}`);
      console.log(`   Title: "${notification.title}"`);
      console.log(`   Body: "${notification.body}"`);
      console.log(`   Image: "${notification.imageUrl || 'none'}"`);

      const message: admin.messaging.Message = {
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
        },
        data: notification.data || {},
        topic,

        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
            ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
          },
        },

        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'mutable-content': 1, // Required for iOS to display images
            },
          },
          fcmOptions: {
            ...(notification.imageUrl && { imageUrl: notification.imageUrl }),
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
