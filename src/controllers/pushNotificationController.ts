import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Customer from '../models/Customer';
import NotificationLog from '../models/NotificationLog';
import NotificationTemplate from '../models/NotificationTemplate';
import NotificationEngagement from '../models/NotificationEngagement';
import { FirebaseNotificationService } from '../services/firebaseNotificationService';
import { SegmentationService, AVAILABLE_SEGMENTS } from '../services/segmentationService';

/**
 * Register device token for push notifications
 * POST /api/v1/notifications/register-token
 */
export const registerDeviceToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { token, platform, deviceId } = req.body;

    // Validation
    if (!token) {
      res.status(400).json({
        status: 'error',
        message: 'Device token is required',
      });
      return;
    }

    if (!platform || !['ios', 'android'].includes(platform)) {
      res.status(400).json({
        status: 'error',
        message: 'Platform must be "ios" or "android"',
      });
      return;
    }

    // Find customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
      return;
    }

    // Add device token to customer
    await customer.addDeviceToken(token, platform, deviceId);

    console.log(`✅ Device token registered for customer ${customerId}`);
    console.log(`   Platform: ${platform}, DeviceId: ${deviceId || 'N/A'}`);

    // Subscribe to store topic (if Firebase initialized)
    if (FirebaseNotificationService.isInitialized()) {
      const storeId = req.storeId;
      const topic = `store_${storeId}`;

      // Actually subscribe to topic
      const subscriptionResult = await FirebaseNotificationService.subscribeToTopic(
        token,
        storeId as string
      );

      if (subscriptionResult.success) {
        console.log(`   ✅ Subscribed to topic: ${topic}`);

        // Track subscribed topics
        if (!customer.subscribedToTopics.includes(topic)) {
          customer.subscribedToTopics.push(topic);
          await customer.save();
        }
      } else {
        console.log(`   ⚠️  Failed to subscribe to topic: ${subscriptionResult.error}`);
      }
    } else {
      console.log('   ⚠️  Firebase not initialized - skipping topic subscription');
    }

    res.json({
      status: 'success',
      message: 'Device token registered successfully',
      data: {
        deviceCount: customer.deviceTokens.length,
        firebaseEnabled: FirebaseNotificationService.isInitialized(),
      },
    });
  } catch (error) {
    console.error('Register device token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register device token',
    });
  }
};

/**
 * Unregister device token
 * POST /api/v1/notifications/unregister-token
 */
export const unregisterDeviceToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        status: 'error',
        message: 'Device token is required',
      });
      return;
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
      return;
    }

    // Unsubscribe from store topic (if Firebase initialized)
    if (FirebaseNotificationService.isInitialized()) {
      const storeId = req.storeId;

      await FirebaseNotificationService.unsubscribeFromTopic(token, storeId as string);

      // Remove from subscribed topics list if no more active tokens
      const remainingTokens = customer.deviceTokens.filter(
        (dt: any) => dt.token !== token && dt.active
      );
      if (remainingTokens.length === 0) {
        const topic = `store_${storeId}`;
        customer.subscribedToTopics = customer.subscribedToTopics.filter(
          (t: string) => t !== topic
        );
      }
    }

    // Remove device token
    await customer.removeDeviceToken(token);

    console.log(`✅ Device token unregistered for customer ${customerId}`);

    res.json({
      status: 'success',
      message: 'Device token unregistered successfully',
      data: {
        deviceCount: customer.deviceTokens.length,
      },
    });
  } catch (error) {
    console.error('Unregister device token error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to unregister device token',
    });
  }
};

/**
 * Get notification preferences
 * GET /api/v1/notifications/preferences
 */
export const getNotificationPreferences = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;

    const customer = await Customer.findById(customerId).select(
      'notificationPreferences deviceTokens'
    );

    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        preferences: customer.notificationPreferences,
        deviceCount: customer.deviceTokens.filter((dt: any) => dt.active).length,
        totalDevices: customer.deviceTokens.length,
        firebaseEnabled: FirebaseNotificationService.isInitialized(),
      },
    });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification preferences',
    });
  }
};

/**
 * Update notification preferences
 * PATCH /api/v1/notifications/preferences
 */
export const updateNotificationPreferences = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { pushEnabled, orderUpdates, promotions, newProducts } = req.body;

    const customer = await Customer.findById(customerId);
    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
      return;
    }

    // Update only provided preferences
    if (typeof pushEnabled === 'boolean') {
      customer.notificationPreferences.pushEnabled = pushEnabled;
    }
    if (typeof orderUpdates === 'boolean') {
      customer.notificationPreferences.orderUpdates = orderUpdates;
    }
    if (typeof promotions === 'boolean') {
      customer.notificationPreferences.promotions = promotions;
    }
    if (typeof newProducts === 'boolean') {
      customer.notificationPreferences.newProducts = newProducts;
    }

    await customer.save();

    console.log(`✅ Notification preferences updated for customer ${customerId}`);

    res.json({
      status: 'success',
      message: 'Notification preferences updated successfully',
      data: {
        preferences: customer.notificationPreferences,
      },
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update notification preferences',
    });
  }
};

/**
 * Send notification to all customers of a store (broadcast)
 * POST /api/v1/notifications/stores/:storeId/broadcast
 *
 * Store owner uses this to send promotions, announcements, etc.
 * Supports optional segment parameter to target specific customer groups.
 * Supports optional scheduledFor parameter to schedule notification for future delivery.
 * Creates a log entry for notification history.
 */
export const broadcastStoreNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  let notificationLog: any = null;

  try {
    const { storeId } = req.params;
    const { title, body, imageUrl, image, data, segment, scheduledFor, deepLink } = req.body;

    // Accept both 'image' and 'imageUrl' for compatibility
    const finalImageUrl = imageUrl || image;

    console.log('📢 [PUSH] Step 3: Broadcast request received');
    console.log('📢 [PUSH] Step 3a: Store ID from params:', storeId);
    console.log('📢 [PUSH] Step 3b: User Store ID:', req.storeId);
    console.log('📢 [PUSH] Step 3c: Segment:', segment || 'all');
    console.log('📢 [PUSH] Step 3d: Title:', title);
    console.log('📢 [PUSH] Step 3e: Body:', body);
    console.log('📢 [PUSH] Step 3f: Firebase initialized:', FirebaseNotificationService.isInitialized());
    console.log('📢 [PUSH] Step 3g: Scheduled for:', scheduledFor || 'immediate');
    console.log('📢 [PUSH] Step 3h: Image URL:', finalImageUrl || 'none');
    console.log('📢 [PUSH] Step 3i: Raw image fields - imageUrl:', imageUrl, ', image:', image);
    console.log('📢 [PUSH] Step 3j: Deep link:', deepLink ? JSON.stringify(deepLink) : 'none');

    // Validation
    if (!title || !body) {
      console.log('📢 [PUSH] ERROR: Missing title or body');
      res.status(400).json({
        status: 'error',
        message: 'Title and body are required',
      });
      return;
    }

    // Security: Verify user owns this store
    const userStoreId = req.storeId?.toString();
    if (userStoreId !== storeId) {
      console.log('📢 [PUSH] ERROR: Store ID mismatch - User:', userStoreId, 'Params:', storeId);
      res.status(403).json({
        status: 'error',
        message: 'You can only send notifications to your own store',
      });
      return;
    }

    // Validate segment if provided
    const segmentId = segment || 'all';
    if (!SegmentationService.isValidSegment(segmentId)) {
      console.log('📢 [PUSH] ERROR: Invalid segment:', segmentId);
      res.status(400).json({
        status: 'error',
        message: `Invalid segment. Available segments: ${AVAILABLE_SEGMENTS.map((s) => s.id).join(', ')}`,
      });
      return;
    }

    // Handle scheduled notifications
    if (scheduledFor) {
      const scheduleDate = new Date(scheduledFor);

      // Validate it's a valid date
      if (isNaN(scheduleDate.getTime())) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid scheduledFor date format. Use ISO 8601 format.',
        });
        return;
      }

      // Validate it's in the future
      if (scheduleDate <= new Date()) {
        res.status(400).json({
          status: 'error',
          message: 'Scheduled time must be in the future',
        });
        return;
      }

      // Create scheduled notification log
      notificationLog = await NotificationLog.create({
        storeId: new mongoose.Types.ObjectId(storeId),
        title,
        body,
        data,
        imageUrl: finalImageUrl,
        deepLink,
        segment: segmentId,
        status: 'scheduled',
        scheduledFor: scheduleDate,
        sentBy: (req as any).user?._id,
        sentByEmail: (req as any).user?.email,
        targetCount: 0,
        successCount: 0,
        failureCount: 0,
      });

      console.log(`📅 [PUSH] Notification scheduled for: ${scheduleDate.toISOString()}`);
      console.log(`📅 [PUSH] Notification ID: ${notificationLog._id}`);

      res.json({
        status: 'success',
        message: `Notification scheduled for ${scheduleDate.toLocaleString()}`,
        data: {
          notificationId: notificationLog._id.toString(),
          segment: segmentId,
          scheduled: true,
          scheduledFor: scheduleDate.toISOString(),
          targetCount: 0,
          successCount: 0,
          failureCount: 0,
          timestamp: new Date(),
        },
      });
      return;
    }

    // Create notification log entry with 'sending' status for immediate send
    notificationLog = await NotificationLog.create({
      storeId: new mongoose.Types.ObjectId(storeId),
      title,
      body,
      data,
      imageUrl: finalImageUrl,
      deepLink,
      segment: segmentId,
      status: 'sending',
      sentBy: (req as any).user?._id,
      sentByEmail: (req as any).user?.email,
      targetCount: 0,
      successCount: 0,
      failureCount: 0,
    });

    console.log('📢 [PUSH] Step 4: Querying customers for segment:', segmentId);

    // Get device tokens for the segment
    const deviceTokens = await SegmentationService.getSegmentDeviceTokens(
      storeId,
      segmentId
    );

    // Update target count
    notificationLog.targetCount = deviceTokens.length;

    console.log('📢 [PUSH] Step 4a: Customers found with devices, total tokens:', deviceTokens.length);
    console.log('📢 [PUSH] Step 4b: Sample tokens (first 3):');
    deviceTokens.slice(0, 3).forEach((token, idx) => {
      const tokenType = token.startsWith('ExponentPushToken') ? 'EXPO' : 'NATIVE_FCM';
      console.log(`   Token ${idx + 1}: ${token.substring(0, 40)}... (${tokenType})`);
    });
    console.log('📢 [PUSH] Step 4c: Token types breakdown:');
    const expoTokens = deviceTokens.filter(t => t.startsWith('ExponentPushToken'));
    const fcmTokens = deviceTokens.filter(t => !t.startsWith('ExponentPushToken'));
    console.log(`   - EXPO tokens (WILL FAIL): ${expoTokens.length}`);
    console.log(`   - Native FCM tokens (should work): ${fcmTokens.length}`);

    console.log(`📢 Broadcasting notification to store: ${storeId}`);
    console.log(`   Notification ID: ${notificationLog._id}`);
    console.log(`   Segment: ${segmentId}`);
    console.log(`   Recipients: ${deviceTokens.length} device tokens`);

    if (deviceTokens.length === 0) {
      notificationLog.status = 'sent';
      notificationLog.sentAt = new Date();
      await notificationLog.save();

      res.json({
        status: 'success',
        message: 'No customers match the selected segment',
        data: {
          notificationId: notificationLog._id.toString(),
          segment: segmentId,
          recipientCount: 0,
          successCount: 0,
          failureCount: 0,
          timestamp: new Date(),
        },
      });
      return;
    }

    console.log('🔥 [PUSH] Step 5: Sending to Firebase FCM');
    console.log('🔥 [PUSH] Step 5a: Tokens count:', deviceTokens.length);

    // Send to devices
    const result = await FirebaseNotificationService.sendToDevices(deviceTokens, {
      title,
      body,
      imageUrl: finalImageUrl,
      deepLink,
      data: {
        type: 'store_announcement',
        segment: segmentId,
        notificationId: notificationLog._id.toString(),
        ...data,
      },
    });

    console.log('🔥 [PUSH] Step 6: Firebase response received');
    console.log('🔥 [PUSH] Step 6a: Success count:', result.successCount);
    console.log('🔥 [PUSH] Step 6b: Failure count:', result.failureCount);
    console.log('🔥 [PUSH] Step 6c: Invalid tokens to remove:', result.invalidTokens.length);
    if (result.failedTokens.length > 0) {
      console.log('🔥 [PUSH] Step 6d: Failed token details:');
      result.failedTokens.slice(0, 5).forEach((ft, idx) => {
        console.log(`   ${idx + 1}. Token: ${ft.token}, Error: ${ft.errorCode} - ${ft.error}`);
      });
    }

    // Update notification log with results
    notificationLog.successCount = result.successCount;
    notificationLog.failureCount = result.failureCount;
    notificationLog.failedTokens = result.failedTokens;
    notificationLog.sentAt = new Date();

    // Determine final status
    if (result.failureCount === 0) {
      notificationLog.status = 'sent';
    } else if (result.successCount === 0) {
      notificationLog.status = 'failed';
    } else {
      notificationLog.status = 'partial';
    }

    await notificationLog.save();

    // Cleanup invalid tokens
    if (result.invalidTokens.length > 0) {
      await FirebaseNotificationService.removeInvalidTokens(result.invalidTokens);
    }

    console.log(`📢 Notification logged: ${notificationLog._id} (${notificationLog.status})`);

    res.json({
      status: 'success',
      message: `Notification sent to ${result.successCount} devices`,
      data: {
        notificationId: notificationLog._id.toString(),
        segment: segmentId,
        targetCount: deviceTokens.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        deliveryRate: deviceTokens.length > 0
          ? Math.round((result.successCount / deviceTokens.length) * 100)
          : 0,
        invalidTokensRemoved: result.invalidTokens.length,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);

    // Update log with failure if it was created
    if (notificationLog) {
      notificationLog.status = 'failed';
      notificationLog.failedTokens = [{
        token: 'all',
        error: (error as Error).message || 'Unknown error',
        errorCode: 'broadcast/exception',
      }];
      await notificationLog.save();
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to broadcast notification',
    });
  }
};

/**
 * Send test notification to specific customer
 * POST /api/v1/notifications/test
 *
 * Useful for testing before broadcasting to all customers
 */
export const sendTestNotificationAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { customerId, title, body, imageUrl, image } = req.body;

    // Accept both 'image' and 'imageUrl' for compatibility
    const finalImageUrl = imageUrl || image;

    if (!customerId || !title || !body) {
      res.status(400).json({
        status: 'error',
        message: 'customerId, title, and body are required',
      });
      return;
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      res.status(404).json({
        status: 'error',
        message: 'Customer not found',
      });
      return;
    }

    // Security: Verify customer belongs to admin's store
    if (customer.storeId.toString() !== req.storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Customer does not belong to your store',
      });
      return;
    }

    const deviceTokens = customer.getActiveDeviceTokens();
    if (deviceTokens.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Customer has no registered devices',
      });
      return;
    }

    console.log(`🧪 Sending test notification to customer ${customerId}`);
    console.log(`   Devices: ${deviceTokens.length}`);

    const result = await FirebaseNotificationService.sendToDevices(deviceTokens, {
      title,
      body,
      imageUrl: finalImageUrl,
      data: { type: 'test' },
    });

    // Cleanup invalid tokens
    if (result.invalidTokens.length > 0) {
      await FirebaseNotificationService.removeInvalidTokens(result.invalidTokens);
    }

    res.json({
      status: 'success',
      message: 'Test notification sent',
      data: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        invalidTokensRemoved: result.invalidTokens.length,
      },
    });
  } catch (error) {
    console.error('Send test notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send test notification',
    });
  }
};

/**
 * Get notification statistics for store
 * GET /api/v1/notifications/stores/:storeId/stats
 *
 * Shows how many customers have devices registered, platform breakdown, engagement metrics, etc.
 */
export const getNotificationStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security: Verify user owns this store
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const storeObjectId = new mongoose.Types.ObjectId(storeId);

    // Get customers with active devices
    const customers = await Customer.find({
      storeId,
      'deviceTokens.active': true,
    }).select('deviceTokens notificationPreferences');

    // Calculate statistics
    let totalActiveDevices = 0;
    let iosDevices = 0;
    let androidDevices = 0;
    let pushEnabledCustomers = 0;

    customers.forEach((customer: any) => {
      const activeTokens = customer.deviceTokens.filter((dt: any) => dt.active);
      totalActiveDevices += activeTokens.length;

      activeTokens.forEach((token: any) => {
        if (token.platform === 'ios') iosDevices++;
        if (token.platform === 'android') androidDevices++;
      });

      if (customer.notificationPreferences?.pushEnabled) {
        pushEnabledCustomers++;
      }
    });

    // Get engagement statistics from NotificationLog
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      notificationStats,
      last30DaysStats,
      last7DaysStats,
    ] = await Promise.all([
      // All-time notification stats
      NotificationLog.aggregate([
        { $match: { storeId: storeObjectId, status: { $in: ['sent', 'partial'] } } },
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            totalTargeted: { $sum: '$targetCount' },
            totalDelivered: { $sum: '$successCount' },
            totalOpened: { $sum: '$openedCount' },
            totalClicked: { $sum: '$clickedCount' },
          },
        },
      ]),
      // Last 30 days stats
      NotificationLog.aggregate([
        {
          $match: {
            storeId: storeObjectId,
            status: { $in: ['sent', 'partial'] },
            sentAt: { $gte: last30Days },
          },
        },
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            totalTargeted: { $sum: '$targetCount' },
            totalDelivered: { $sum: '$successCount' },
            totalOpened: { $sum: '$openedCount' },
            totalClicked: { $sum: '$clickedCount' },
          },
        },
      ]),
      // Last 7 days stats
      NotificationLog.aggregate([
        {
          $match: {
            storeId: storeObjectId,
            status: { $in: ['sent', 'partial'] },
            sentAt: { $gte: last7Days },
          },
        },
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            totalTargeted: { $sum: '$targetCount' },
            totalDelivered: { $sum: '$successCount' },
            totalOpened: { $sum: '$openedCount' },
            totalClicked: { $sum: '$clickedCount' },
          },
        },
      ]),
    ]);

    // Calculate rates helper
    const calculateRates = (stats: any) => {
      const data = stats[0] || {
        totalNotifications: 0,
        totalTargeted: 0,
        totalDelivered: 0,
        totalOpened: 0,
        totalClicked: 0,
      };
      return {
        totalNotifications: data.totalNotifications,
        totalTargeted: data.totalTargeted,
        totalDelivered: data.totalDelivered,
        totalOpened: data.totalOpened,
        totalClicked: data.totalClicked,
        deliveryRate: data.totalTargeted > 0
          ? Math.round((data.totalDelivered / data.totalTargeted) * 100)
          : 0,
        openRate: data.totalDelivered > 0
          ? Math.round((data.totalOpened / data.totalDelivered) * 100)
          : 0,
        clickRate: data.totalOpened > 0
          ? Math.round((data.totalClicked / data.totalOpened) * 100)
          : 0,
      };
    };

    res.json({
      status: 'success',
      data: {
        totalCustomersWithDevices: customers.length,
        totalActiveDevices,
        platformBreakdown: {
          ios: iosDevices,
          android: androidDevices,
        },
        pushEnabledCustomers,
        firebaseEnabled: FirebaseNotificationService.isInitialized(),
        topic: `store_${storeId}`,
        // Engagement metrics
        engagement: {
          allTime: calculateRates(notificationStats),
          last30Days: calculateRates(last30DaysStats),
          last7Days: calculateRates(last7DaysStats),
        },
      },
    });
  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification statistics',
    });
  }
};

/**
 * Get customers eligible for notifications
 * GET /api/v1/notifications/stores/:storeId/recipients
 *
 * Returns list of customers who can receive notifications
 */
export const getNotificationRecipients = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [customers, total] = await Promise.all([
      Customer.find({
        storeId,
        'deviceTokens.active': true,
      })
        .select('name email deviceTokens notificationPreferences')
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Customer.countDocuments({
        storeId,
        'deviceTokens.active': true,
      }),
    ]);

    // Format customer data
    const formattedCustomers = customers.map((customer: any) => ({
      id: customer._id,
      name: customer.name || 'Guest',
      email: customer.email,
      deviceCount: customer.deviceTokens.filter((dt: any) => dt.active).length,
      platforms: [
        ...new Set(
          customer.deviceTokens
            .filter((dt: any) => dt.active)
            .map((dt: any) => dt.platform)
        ),
      ],
      pushEnabled: customer.notificationPreferences?.pushEnabled ?? true,
    }));

    res.json({
      status: 'success',
      data: {
        customers: formattedCustomers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get notification recipients error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification recipients',
    });
  }
};

/**
 * Get available customer segments for targeting
 * GET /api/v1/notifications/stores/:storeId/segments
 *
 * Returns list of segments with customer counts
 */
export const getAvailableSegments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const segments = await SegmentationService.getAvailableSegmentsWithCounts(storeId);

    res.json({
      status: 'success',
      data: {
        segments,
      },
    });
  } catch (error) {
    console.error('Get available segments error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch available segments',
    });
  }
};

/**
 * Get notification history for a store
 * GET /api/v1/notifications/stores/:storeId/history
 *
 * Returns paginated list of all notifications sent by the store
 */
export const getNotificationHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;
    const {
      page = '1',
      limit = '20',
      status,
      segment,
      startDate,
      endDate,
    } = req.query;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Build query
    const query: any = { storeId: new mongoose.Types.ObjectId(storeId) };

    // Apply filters
    if (status) {
      query.status = status;
    }
    if (segment) {
      query.segment = segment;
    }
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, total] = await Promise.all([
      NotificationLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NotificationLog.countDocuments(query),
    ]);

    res.json({
      status: 'success',
      data: {
        notifications: notifications.map((n: any) => ({
          id: n._id.toString(),
          title: n.title,
          body: n.body,
          segment: n.segment,
          status: n.status,
          targetCount: n.targetCount,
          successCount: n.successCount,
          failureCount: n.failureCount,
          deliveryRate:
            n.targetCount > 0
              ? Math.round((n.successCount / n.targetCount) * 100)
              : 0,
          // Engagement metrics
          openedCount: n.openedCount || 0,
          clickedCount: n.clickedCount || 0,
          openRate:
            n.successCount > 0
              ? Math.round(((n.openedCount || 0) / n.successCount) * 100)
              : 0,
          clickRate:
            (n.openedCount || 0) > 0
              ? Math.round(((n.clickedCount || 0) / (n.openedCount || 1)) * 100)
              : 0,
          sentAt: n.sentAt,
          scheduledFor: n.scheduledFor,
          sentByEmail: n.sentByEmail,
          createdAt: n.createdAt,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification history',
    });
  }
};

/**
 * Get single notification detail
 * GET /api/v1/notifications/stores/:storeId/history/:notificationId
 *
 * Returns full details of a specific notification including failed tokens
 */
export const getNotificationDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, notificationId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    const notification = await NotificationLog.findOne({
      _id: new mongoose.Types.ObjectId(notificationId),
      storeId: new mongoose.Types.ObjectId(storeId),
    }).lean();

    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        id: (notification as any)._id.toString(),
        title: notification.title,
        body: notification.body,
        data: notification.data,
        imageUrl: notification.imageUrl,
        segment: notification.segment,
        status: notification.status,
        targetCount: notification.targetCount,
        successCount: notification.successCount,
        failureCount: notification.failureCount,
        deliveryRate:
          notification.targetCount > 0
            ? Math.round(
                (notification.successCount / notification.targetCount) * 100
              )
            : 0,
        // Engagement metrics
        openedCount: notification.openedCount || 0,
        clickedCount: notification.clickedCount || 0,
        openRate:
          notification.successCount > 0
            ? Math.round(((notification.openedCount || 0) / notification.successCount) * 100)
            : 0,
        clickRate:
          (notification.openedCount || 0) > 0
            ? Math.round(((notification.clickedCount || 0) / (notification.openedCount || 1)) * 100)
            : 0,
        failedTokens: notification.failedTokens,
        sentAt: notification.sentAt,
        scheduledFor: notification.scheduledFor,
        sentBy: notification.sentBy,
        sentByEmail: notification.sentByEmail,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get notification detail error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notification detail',
    });
  }
};

/**
 * Get push notification system diagnostic
 * GET /api/v1/notifications/stores/:storeId/diagnostic
 *
 * Returns comprehensive diagnostic information about the push notification system
 */
export const getNotificationDiagnostic = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    console.log('🔍 [DIAGNOSTIC] Running push notification diagnostic for store:', storeId);

    // Check Firebase status
    let firebaseStatus = 'unknown';
    let firebaseProjectId = 'unknown';
    try {
      const isInit = FirebaseNotificationService.isInitialized();
      firebaseStatus = isInit ? 'initialized' : 'not_initialized';

      // Try to get project ID from service account
      const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountRaw) {
        try {
          const serviceAccount = JSON.parse(serviceAccountRaw);
          firebaseProjectId = serviceAccount.project_id || 'not_found_in_json';
        } catch {
          firebaseProjectId = 'invalid_json';
        }
      } else {
        firebaseProjectId = 'env_var_missing';
      }
    } catch (error: any) {
      firebaseStatus = `error: ${error.message}`;
    }

    // Get customers with device tokens
    const storeObjectId = new mongoose.Types.ObjectId(storeId);

    const customersWithTokens = await Customer.countDocuments({
      storeId: storeObjectId,
      'deviceTokens.0': { $exists: true },
    });

    const customersWithActiveTokens = await Customer.countDocuments({
      storeId: storeObjectId,
      'deviceTokens.active': true,
    });

    // Get total tokens and breakdown
    const tokenAggregation = await Customer.aggregate([
      { $match: { storeId: storeObjectId } },
      { $unwind: { path: '$deviceTokens', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: 1 },
          activeTokens: {
            $sum: { $cond: ['$deviceTokens.active', 1, 0] },
          },
          iosTokens: {
            $sum: {
              $cond: [
                { $and: ['$deviceTokens.active', { $eq: ['$deviceTokens.platform', 'ios'] }] },
                1,
                0,
              ],
            },
          },
          androidTokens: {
            $sum: {
              $cond: [
                { $and: ['$deviceTokens.active', { $eq: ['$deviceTokens.platform', 'android'] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const tokenStats = tokenAggregation[0] || {
      totalTokens: 0,
      activeTokens: 0,
      iosTokens: 0,
      androidTokens: 0,
    };

    // Get sample tokens to check for Expo vs FCM
    const sampleCustomers = await Customer.find({
      storeId: storeObjectId,
      'deviceTokens.active': true,
    })
      .select('email deviceTokens')
      .limit(10)
      .lean();

    let expoTokenCount = 0;
    let fcmTokenCount = 0;
    const sampleTokens: Array<{ email: string; token: string; type: string; platform: string }> = [];

    sampleCustomers.forEach((customer: any) => {
      customer.deviceTokens
        .filter((dt: any) => dt.active)
        .forEach((dt: any) => {
          const isExpo = dt.token.startsWith('ExponentPushToken');
          if (isExpo) expoTokenCount++;
          else fcmTokenCount++;

          if (sampleTokens.length < 5) {
            sampleTokens.push({
              email: customer.email,
              token: dt.token.substring(0, 40) + '...',
              type: isExpo ? 'EXPO' : 'NATIVE_FCM',
              platform: dt.platform,
            });
          }
        });
    });

    // Get recent notification history
    const recentNotifications = await NotificationLog.find({ storeId: storeObjectId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status targetCount successCount failureCount createdAt')
      .lean();

    // Identify issues
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (firebaseStatus !== 'initialized') {
      issues.push('Firebase Admin SDK is not initialized');
      recommendations.push('Check FIREBASE_SERVICE_ACCOUNT environment variable');
    }

    if (expoTokenCount > 0) {
      issues.push(`Found ${expoTokenCount} Expo tokens that WILL NOT work with Firebase Admin SDK`);
      recommendations.push('Mobile app must use native FCM tokens (react-native-firebase), not Expo push tokens');
    }

    if (tokenStats.activeTokens === 0) {
      issues.push('No active device tokens found for this store');
      recommendations.push('Ensure mobile app is calling the device-token registration endpoint');
    }

    if (recentNotifications.length > 0) {
      const allFailed = recentNotifications.every((n: any) => n.failureCount > 0 && n.successCount === 0);
      if (allFailed) {
        issues.push('All recent notifications have failed completely');
        recommendations.push('Check Firebase credentials and token format');
      }
    }

    console.log('🔍 [DIAGNOSTIC] Results:');
    console.log('   Firebase Status:', firebaseStatus);
    console.log('   Total Tokens:', tokenStats.totalTokens);
    console.log('   Active Tokens:', tokenStats.activeTokens);
    console.log('   Expo Tokens:', expoTokenCount);
    console.log('   FCM Tokens:', fcmTokenCount);
    console.log('   Issues Found:', issues.length);

    res.json({
      status: 'success',
      data: {
        firebase: {
          status: firebaseStatus,
          projectId: firebaseProjectId,
          hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        },
        tokens: {
          customersWithTokens,
          customersWithActiveTokens,
          totalTokens: tokenStats.totalTokens,
          activeTokens: tokenStats.activeTokens,
          platformBreakdown: {
            ios: tokenStats.iosTokens,
            android: tokenStats.androidTokens,
          },
          tokenTypeBreakdown: {
            expo: expoTokenCount,
            nativeFcm: fcmTokenCount,
            warning: expoTokenCount > 0 ? 'Expo tokens will NOT work with Firebase Admin SDK!' : null,
          },
          sampleTokens,
        },
        recentNotifications: recentNotifications.map((n: any) => ({
          title: n.title,
          status: n.status,
          targetCount: n.targetCount,
          successCount: n.successCount,
          failureCount: n.failureCount,
          deliveryRate: n.targetCount > 0 ? Math.round((n.successCount / n.targetCount) * 100) : 0,
          createdAt: n.createdAt,
        })),
        issues,
        recommendations,
        environment: {
          nodeEnv: process.env.NODE_ENV || 'not_set',
        },
      },
    });
  } catch (error) {
    console.error('Get notification diagnostic error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to run diagnostic',
    });
  }
};

/**
 * Get all scheduled notifications for a store
 * GET /api/v1/notifications/stores/:storeId/scheduled
 */
export const getScheduledNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const notifications = await NotificationLog.find({
      storeId: new mongoose.Types.ObjectId(storeId),
      status: 'scheduled',
      scheduledFor: { $gte: new Date() },
    })
      .sort({ scheduledFor: 1 })
      .lean();

    res.json({
      status: 'success',
      data: {
        notifications: notifications.map((n: any) => ({
          id: n._id.toString(),
          title: n.title,
          body: n.body,
          segment: n.segment,
          imageUrl: n.imageUrl,
          data: n.data,
          scheduledFor: n.scheduledFor,
          createdAt: n.createdAt,
          sentByEmail: n.sentByEmail,
        })),
        count: notifications.length,
      },
    });
  } catch (error) {
    console.error('Get scheduled notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch scheduled notifications',
    });
  }
};

/**
 * Cancel a scheduled notification
 * POST /api/v1/notifications/stores/:storeId/scheduled/:notificationId/cancel
 */
export const cancelScheduledNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, notificationId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    const notification = await NotificationLog.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        storeId: new mongoose.Types.ObjectId(storeId),
        status: 'scheduled',
      },
      {
        status: 'cancelled',
      },
      { new: true }
    );

    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Scheduled notification not found or already sent/cancelled',
      });
      return;
    }

    console.log(`❌ [PUSH] Scheduled notification cancelled: ${notificationId}`);

    res.json({
      status: 'success',
      message: 'Scheduled notification cancelled',
      data: {
        notificationId: notification._id.toString(),
        title: notification.title,
        previousScheduledFor: notification.scheduledFor,
      },
    });
  } catch (error) {
    console.error('Cancel scheduled notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel scheduled notification',
    });
  }
};

/**
 * Send a scheduled notification immediately
 * POST /api/v1/notifications/stores/:storeId/scheduled/:notificationId/send-now
 */
export const sendScheduledNow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, notificationId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    const notification = await NotificationLog.findOne({
      _id: new mongoose.Types.ObjectId(notificationId),
      storeId: new mongoose.Types.ObjectId(storeId),
      status: 'scheduled',
    });

    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Scheduled notification not found or already sent/cancelled',
      });
      return;
    }

    console.log(`🚀 [PUSH] Sending scheduled notification immediately: ${notificationId}`);

    // Update status to sending
    notification.status = 'sending';
    notification.scheduledFor = undefined;
    await notification.save();

    // Get device tokens for the segment
    const deviceTokens = await SegmentationService.getSegmentDeviceTokens(
      storeId,
      notification.segment
    );

    notification.targetCount = deviceTokens.length;

    if (deviceTokens.length === 0) {
      notification.status = 'sent';
      notification.sentAt = new Date();
      await notification.save();

      res.json({
        status: 'success',
        message: 'No customers match the selected segment',
        data: {
          notificationId: notification._id.toString(),
          segment: notification.segment,
          targetCount: 0,
          successCount: 0,
          failureCount: 0,
          timestamp: new Date(),
        },
      });
      return;
    }

    // Send to devices
    const result = await FirebaseNotificationService.sendToDevices(deviceTokens, {
      title: notification.title,
      body: notification.body,
      imageUrl: notification.imageUrl,
      data: {
        type: 'store_announcement',
        segment: notification.segment,
        notificationId: notification._id.toString(),
        ...(notification.data || {}),
      },
    });

    // Update notification log with results
    notification.successCount = result.successCount;
    notification.failureCount = result.failureCount;
    notification.failedTokens = result.failedTokens;
    notification.sentAt = new Date();

    // Determine final status
    if (result.failureCount === 0) {
      notification.status = 'sent';
    } else if (result.successCount === 0) {
      notification.status = 'failed';
    } else {
      notification.status = 'partial';
    }

    await notification.save();

    // Cleanup invalid tokens
    if (result.invalidTokens.length > 0) {
      await FirebaseNotificationService.removeInvalidTokens(result.invalidTokens);
    }

    console.log(`🚀 [PUSH] Scheduled notification sent: ${notificationId} (${notification.status})`);

    res.json({
      status: 'success',
      message: `Notification sent to ${result.successCount} devices`,
      data: {
        notificationId: notification._id.toString(),
        segment: notification.segment,
        targetCount: deviceTokens.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        deliveryRate:
          deviceTokens.length > 0
            ? Math.round((result.successCount / deviceTokens.length) * 100)
            : 0,
        invalidTokensRemoved: result.invalidTokens.length,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Send scheduled now error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send scheduled notification',
    });
  }
};

/**
 * Update a scheduled notification
 * PATCH /api/v1/notifications/stores/:storeId/scheduled/:notificationId
 */
export const updateScheduledNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, notificationId } = req.params;
    const { title, body, segment, imageUrl, data, scheduledFor } = req.body;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    // Build update object
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
    if (data !== undefined) updateData.data = data;

    if (segment !== undefined) {
      if (!SegmentationService.isValidSegment(segment)) {
        res.status(400).json({
          status: 'error',
          message: `Invalid segment. Available segments: ${AVAILABLE_SEGMENTS.map((s) => s.id).join(', ')}`,
        });
        return;
      }
      updateData.segment = segment;
    }

    if (scheduledFor !== undefined) {
      const scheduleDate = new Date(scheduledFor);

      if (isNaN(scheduleDate.getTime())) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid scheduledFor date format. Use ISO 8601 format.',
        });
        return;
      }

      if (scheduleDate <= new Date()) {
        res.status(400).json({
          status: 'error',
          message: 'Scheduled time must be in the future',
        });
        return;
      }

      updateData.scheduledFor = scheduleDate;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'No fields to update',
      });
      return;
    }

    const notification = await NotificationLog.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(notificationId),
        storeId: new mongoose.Types.ObjectId(storeId),
        status: 'scheduled',
      },
      updateData,
      { new: true }
    );

    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Scheduled notification not found or already sent/cancelled',
      });
      return;
    }

    console.log(`📝 [PUSH] Scheduled notification updated: ${notificationId}`);

    res.json({
      status: 'success',
      message: 'Scheduled notification updated',
      data: {
        id: notification._id.toString(),
        title: notification.title,
        body: notification.body,
        segment: notification.segment,
        imageUrl: notification.imageUrl,
        data: notification.data,
        scheduledFor: notification.scheduledFor,
        updatedAt: notification.updatedAt,
      },
    });
  } catch (error) {
    console.error('Update scheduled notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update scheduled notification',
    });
  }
};

// =============================================================================
// NOTIFICATION TEMPLATES
// =============================================================================

/**
 * Get all templates for a store
 * GET /api/v1/notifications/stores/:storeId/templates
 */
export const getTemplates = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const templates = await NotificationTemplate.find({
      storeId: new mongoose.Types.ObjectId(storeId),
      isActive: true,
    })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      status: 'success',
      data: {
        templates: templates.map((t: any) => ({
          id: t._id.toString(),
          name: t.name,
          title: t.title,
          body: t.body,
          image: t.image,
          segment: t.segment,
          data: t.data,
          deepLink: t.deepLink,
          usageCount: t.usageCount,
          lastUsedAt: t.lastUsedAt,
          isActive: t.isActive,
          createdByEmail: t.createdByEmail,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
        total: templates.length,
      },
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch templates',
    });
  }
};

/**
 * Get a single template by ID
 * GET /api/v1/notifications/stores/:storeId/templates/:templateId
 */
export const getTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, templateId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid template ID',
      });
      return;
    }

    const template = await NotificationTemplate.findOne({
      _id: new mongoose.Types.ObjectId(templateId),
      storeId: new mongoose.Types.ObjectId(storeId),
    }).lean();

    if (!template) {
      res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        id: (template as any)._id.toString(),
        name: template.name,
        title: template.title,
        body: template.body,
        image: template.image,
        segment: template.segment,
        data: template.data,
        deepLink: template.deepLink,
        usageCount: template.usageCount,
        lastUsedAt: template.lastUsedAt,
        isActive: template.isActive,
        createdByEmail: template.createdByEmail,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch template',
    });
  }
};

/**
 * Create a new template
 * POST /api/v1/notifications/stores/:storeId/templates
 */
export const createTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { name, title, body, image, segment = 'all', data, deepLink } = req.body;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validation
    if (!name || !title || !body) {
      res.status(400).json({
        status: 'error',
        message: 'Name, title, and body are required',
      });
      return;
    }

    // Check for duplicate name
    const existing = await NotificationTemplate.findOne({
      storeId: new mongoose.Types.ObjectId(storeId),
      name: name.trim(),
      isActive: true,
    });

    if (existing) {
      res.status(400).json({
        status: 'error',
        message: 'A template with this name already exists',
      });
      return;
    }

    const template = await NotificationTemplate.create({
      storeId: new mongoose.Types.ObjectId(storeId),
      name: name.trim(),
      title,
      body,
      image,
      segment,
      data,
      deepLink,
      createdBy: (req as any).user?._id,
      createdByEmail: (req as any).user?.email,
    });

    console.log(`📝 [TEMPLATE] Created: "${name}" for store ${storeId}`);

    res.status(201).json({
      status: 'success',
      data: {
        id: template._id.toString(),
        name: template.name,
        title: template.title,
        body: template.body,
        image: template.image,
        segment: template.segment,
        data: template.data,
        deepLink: template.deepLink,
        usageCount: template.usageCount,
        lastUsedAt: template.lastUsedAt,
        isActive: template.isActive,
        createdByEmail: template.createdByEmail,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Create template error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      res.status(400).json({
        status: 'error',
        message: 'A template with this name already exists',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to create template',
    });
  }
};

/**
 * Update a template
 * PATCH /api/v1/notifications/stores/:storeId/templates/:templateId
 */
export const updateTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, templateId } = req.params;
    const { name, title, body, image, segment, data, deepLink, isActive } = req.body;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid template ID',
      });
      return;
    }

    // Build update object
    const updateData: any = {};

    if (name !== undefined) {
      // Check for duplicate name
      const existing = await NotificationTemplate.findOne({
        storeId: new mongoose.Types.ObjectId(storeId),
        name: name.trim(),
        _id: { $ne: new mongoose.Types.ObjectId(templateId) },
        isActive: true,
      });

      if (existing) {
        res.status(400).json({
          status: 'error',
          message: 'A template with this name already exists',
        });
        return;
      }

      updateData.name = name.trim();
    }

    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (image !== undefined) updateData.image = image;
    if (segment !== undefined) updateData.segment = segment;
    if (data !== undefined) updateData.data = data;
    if (deepLink !== undefined) updateData.deepLink = deepLink;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'No fields to update',
      });
      return;
    }

    const template = await NotificationTemplate.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(templateId),
        storeId: new mongoose.Types.ObjectId(storeId),
      },
      { $set: updateData },
      { new: true }
    );

    if (!template) {
      res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
      return;
    }

    console.log(`📝 [TEMPLATE] Updated: "${template.name}" (${templateId})`);

    res.json({
      status: 'success',
      data: {
        id: template._id.toString(),
        name: template.name,
        title: template.title,
        body: template.body,
        image: template.image,
        segment: template.segment,
        data: template.data,
        deepLink: template.deepLink,
        usageCount: template.usageCount,
        lastUsedAt: template.lastUsedAt,
        isActive: template.isActive,
        createdByEmail: template.createdByEmail,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('Update template error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      res.status(400).json({
        status: 'error',
        message: 'A template with this name already exists',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to update template',
    });
  }
};

/**
 * Delete a template (soft delete)
 * DELETE /api/v1/notifications/stores/:storeId/templates/:templateId
 */
export const deleteTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, templateId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid template ID',
      });
      return;
    }

    const template = await NotificationTemplate.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(templateId),
        storeId: new mongoose.Types.ObjectId(storeId),
      },
      { isActive: false },
      { new: true }
    );

    if (!template) {
      res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
      return;
    }

    console.log(`📝 [TEMPLATE] Deleted: "${template.name}" (${templateId})`);

    res.json({
      status: 'success',
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete template',
    });
  }
};

/**
 * Record template usage (called when template is used to send notification)
 * POST /api/v1/notifications/stores/:storeId/templates/:templateId/use
 */
export const recordTemplateUsage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, templateId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid template ID',
      });
      return;
    }

    const result = await NotificationTemplate.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(templateId),
        storeId: new mongoose.Types.ObjectId(storeId),
      },
      {
        $inc: { usageCount: 1 },
        $set: { lastUsedAt: new Date() },
      }
    );

    if (!result) {
      res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Template usage recorded',
    });
  } catch (error) {
    console.error('Record template usage error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record template usage',
    });
  }
};

/**
 * Duplicate a template
 * POST /api/v1/notifications/stores/:storeId/templates/:templateId/duplicate
 */
export const duplicateTemplate = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, templateId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid template ID',
      });
      return;
    }

    const original = await NotificationTemplate.findOne({
      _id: new mongoose.Types.ObjectId(templateId),
      storeId: new mongoose.Types.ObjectId(storeId),
    });

    if (!original) {
      res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
      return;
    }

    // Generate unique name
    let newName = `${original.name} (Copy)`;
    let counter = 1;
    while (
      await NotificationTemplate.findOne({
        storeId: new mongoose.Types.ObjectId(storeId),
        name: newName,
        isActive: true,
      })
    ) {
      counter++;
      newName = `${original.name} (Copy ${counter})`;
    }

    const duplicate = await NotificationTemplate.create({
      storeId: new mongoose.Types.ObjectId(storeId),
      name: newName,
      title: original.title,
      body: original.body,
      image: original.image,
      segment: original.segment,
      data: original.data,
      deepLink: original.deepLink,
      createdBy: (req as any).user?._id,
      createdByEmail: (req as any).user?.email,
    });

    console.log(`📝 [TEMPLATE] Duplicated: "${original.name}" -> "${newName}"`);

    res.status(201).json({
      status: 'success',
      data: {
        id: duplicate._id.toString(),
        name: duplicate.name,
        title: duplicate.title,
        body: duplicate.body,
        image: duplicate.image,
        segment: duplicate.segment,
        data: duplicate.data,
        deepLink: duplicate.deepLink,
        usageCount: duplicate.usageCount,
        lastUsedAt: duplicate.lastUsedAt,
        isActive: duplicate.isActive,
        createdByEmail: duplicate.createdByEmail,
        createdAt: duplicate.createdAt,
        updatedAt: duplicate.updatedAt,
      },
    });
  } catch (error) {
    console.error('Duplicate template error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to duplicate template',
    });
  }
};

// =============================================================================
// NOTIFICATION ENGAGEMENT TRACKING
// =============================================================================

/**
 * Unified notification tracking endpoint
 * POST /api/v1/notifications/track
 *
 * Handles all notification events: delivered, opened, clicked
 * This is the primary endpoint for mobile app notification tracking
 */
export const trackNotificationEvent = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { notificationId, eventType, timestamp, deviceId, metadata } = req.body;

    // Validation
    if (!notificationId) {
      res.status(400).json({
        success: false,
        message: 'notificationId is required',
      });
      return;
    }

    if (!eventType) {
      res.status(400).json({
        success: false,
        message: 'eventType is required',
      });
      return;
    }

    // Validate eventType
    const validEventTypes = ['delivered', 'opened', 'clicked'];
    const normalizedEventType = eventType.toLowerCase();
    if (!validEventTypes.includes(normalizedEventType)) {
      res.status(400).json({
        success: false,
        message: `Invalid eventType. Valid values: ${validEventTypes.join(', ')}`,
      });
      return;
    }

    // Map eventType to engagement type
    const typeMap: Record<string, 'delivered' | 'open' | 'click'> = {
      'delivered': 'delivered',
      'opened': 'open',
      'clicked': 'click',
    };
    const engagementType = typeMap[normalizedEventType];

    // Map eventType to count field
    const countFieldMap: Record<string, string> = {
      'delivered': 'deliveredCount',
      'opened': 'openedCount',
      'clicked': 'clickedCount',
    };
    const countField = countFieldMap[normalizedEventType];

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid notification ID',
      });
      return;
    }

    // Find the notification
    const notification = await NotificationLog.findById(notificationId);
    if (!notification) {
      // Silently accept tracking for unknown notifications
      // This can happen if notification was deleted or ID is from a different system
      console.log(`[Track] Notification ${notificationId} not found, accepting event silently`);
      res.json({
        success: true,
        message: 'Event tracked successfully',
      });
      return;
    }

    // Create engagement record (with duplicate prevention)
    try {
      await NotificationEngagement.create({
        notificationId: notification._id,
        storeId: notification.storeId,
        customerId: customerId ? new mongoose.Types.ObjectId(customerId) : undefined,
        type: engagementType,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        deviceInfo: {
          deviceId,
        },
        metadata: metadata || {},
      });

      // Increment count on notification log
      await NotificationLog.findByIdAndUpdate(notificationId, {
        $inc: { [countField]: 1 },
      });

      console.log(`[Track] ${normalizedEventType} event recorded for notification ${notificationId}`);
    } catch (error: any) {
      // Handle duplicate key error (customer already tracked this event)
      if (error.code === 11000) {
        console.log(`[Track] Duplicate ${normalizedEventType} event ignored for notification ${notificationId}`);
        // Still return success - duplicate is not an error from client perspective
        res.json({
          success: true,
          message: 'Event tracked successfully',
        });
        return;
      }
      throw error;
    }

    res.json({
      success: true,
      message: 'Event tracked successfully',
    });
  } catch (error) {
    console.error('Track notification event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track event',
    });
  }
};

/**
 * Track notification open event
 * POST /api/v1/notifications/track-open
 *
 * Called by mobile app when user opens/views a notification
 * @deprecated Use POST /api/v1/notifications/track with eventType: "opened" instead
 */
export const trackNotificationOpen = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { notificationId, openedAt, platform, deviceId } = req.body;

    // Validation
    if (!notificationId) {
      res.status(400).json({
        status: 'error',
        message: 'notificationId is required',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    // Find the notification
    const notification = await NotificationLog.findById(notificationId);
    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
      return;
    }

    // Create engagement record (will fail silently on duplicate due to unique index)
    try {
      await NotificationEngagement.create({
        notificationId: new mongoose.Types.ObjectId(notificationId),
        storeId: notification.storeId,
        customerId: new mongoose.Types.ObjectId(customerId),
        type: 'open',
        timestamp: openedAt ? new Date(openedAt) : new Date(),
        deviceInfo: {
          platform,
          deviceId,
        },
      });

      // Increment open counter on NotificationLog
      await NotificationLog.findByIdAndUpdate(notificationId, {
        $inc: { openedCount: 1 },
      });

      console.log(`📬 [ENGAGEMENT] Open tracked: notification=${notificationId}, customer=${customerId}`);
    } catch (error: any) {
      // Duplicate key error means customer already opened this notification
      if (error.code === 11000) {
        console.log(`📬 [ENGAGEMENT] Duplicate open ignored: notification=${notificationId}, customer=${customerId}`);
      } else {
        throw error;
      }
    }

    res.json({
      status: 'success',
      message: 'Open event tracked',
    });
  } catch (error) {
    console.error('Track notification open error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to track open event',
    });
  }
};

/**
 * Track notification click event
 * POST /api/v1/notifications/track-click
 *
 * Called by mobile app when user clicks/interacts with a notification
 */
export const trackNotificationClick = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const customerId = req.customer?.id;
    const { notificationId, clickedAt, clickTarget, platform, deviceId } = req.body;

    // Validation
    if (!notificationId) {
      res.status(400).json({
        status: 'error',
        message: 'notificationId is required',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    // Find the notification
    const notification = await NotificationLog.findById(notificationId);
    if (!notification) {
      res.status(404).json({
        status: 'error',
        message: 'Notification not found',
      });
      return;
    }

    // Create engagement record (will fail silently on duplicate due to unique index)
    try {
      await NotificationEngagement.create({
        notificationId: new mongoose.Types.ObjectId(notificationId),
        storeId: notification.storeId,
        customerId: new mongoose.Types.ObjectId(customerId),
        type: 'click',
        timestamp: clickedAt ? new Date(clickedAt) : new Date(),
        clickTarget,
        deviceInfo: {
          platform,
          deviceId,
        },
      });

      // Increment click counter on NotificationLog
      await NotificationLog.findByIdAndUpdate(notificationId, {
        $inc: { clickedCount: 1 },
      });

      console.log(`📬 [ENGAGEMENT] Click tracked: notification=${notificationId}, customer=${customerId}, target=${clickTarget || 'N/A'}`);
    } catch (error: any) {
      // Duplicate key error means customer already clicked this notification
      if (error.code === 11000) {
        console.log(`📬 [ENGAGEMENT] Duplicate click ignored: notification=${notificationId}, customer=${customerId}`);
      } else {
        throw error;
      }
    }

    res.json({
      status: 'success',
      message: 'Click event tracked',
    });
  } catch (error) {
    console.error('Track notification click error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to track click event',
    });
  }
};

/**
 * Get engagement details for a specific notification (Admin)
 * GET /api/v1/notifications/stores/:storeId/history/:notificationId/engagement
 */
export const getNotificationEngagement = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, notificationId } = req.params;
    const { page = '1', limit = '50' } = req.query;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid notification ID',
      });
      return;
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Get engagement events with customer details
    const [engagements, total, openCount, clickCount] = await Promise.all([
      NotificationEngagement.find({
        notificationId: new mongoose.Types.ObjectId(notificationId),
      })
        .populate('customerId', 'name email')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NotificationEngagement.countDocuments({
        notificationId: new mongoose.Types.ObjectId(notificationId),
      }),
      NotificationEngagement.countDocuments({
        notificationId: new mongoose.Types.ObjectId(notificationId),
        type: 'open',
      }),
      NotificationEngagement.countDocuments({
        notificationId: new mongoose.Types.ObjectId(notificationId),
        type: 'click',
      }),
    ]);

    res.json({
      status: 'success',
      data: {
        summary: {
          totalEngagements: total,
          opens: openCount,
          clicks: clickCount,
        },
        engagements: engagements.map((e: any) => ({
          id: e._id.toString(),
          type: e.type,
          timestamp: e.timestamp,
          customer: {
            id: e.customerId?._id?.toString() || e.customerId?.toString(),
            name: e.customerId?.name || 'Unknown',
            email: e.customerId?.email || 'Unknown',
          },
          deviceInfo: e.deviceInfo,
          clickTarget: e.clickTarget,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get notification engagement error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch engagement data',
    });
  }
};
