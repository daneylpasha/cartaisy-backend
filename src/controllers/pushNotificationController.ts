import { Request, Response } from 'express';
import Customer from '../models/Customer';
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
 */
export const broadcastStoreNotification = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { title, body, imageUrl, data, segment } = req.body;

    // Validation
    if (!title || !body) {
      res.status(400).json({
        status: 'error',
        message: 'Title and body are required',
      });
      return;
    }

    // Security: Verify user owns this store
    const userStoreId = req.storeId?.toString();
    if (userStoreId !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'You can only send notifications to your own store',
      });
      return;
    }

    // Validate segment if provided
    const segmentId = segment || 'all';
    if (!SegmentationService.isValidSegment(segmentId)) {
      res.status(400).json({
        status: 'error',
        message: `Invalid segment. Available segments: ${AVAILABLE_SEGMENTS.map((s) => s.id).join(', ')}`,
      });
      return;
    }

    // Get device tokens for the segment
    const deviceTokens = await SegmentationService.getSegmentDeviceTokens(
      storeId,
      segmentId
    );

    console.log(`📢 Broadcasting notification to store: ${storeId}`);
    console.log(`   Segment: ${segmentId}`);
    console.log(`   Recipients: ${deviceTokens.length} device tokens`);

    if (deviceTokens.length === 0) {
      res.json({
        status: 'success',
        message: 'No customers match the selected segment',
        data: {
          segment: segmentId,
          recipientCount: 0,
          timestamp: new Date(),
        },
      });
      return;
    }

    // Send to devices
    const result = await FirebaseNotificationService.sendToDevices(deviceTokens, {
      title,
      body,
      imageUrl,
      data: {
        type: 'store_announcement',
        segment: segmentId,
        ...data,
      },
    });

    // Cleanup invalid tokens
    if (result.invalidTokens.length > 0) {
      await FirebaseNotificationService.removeInvalidTokens(result.invalidTokens);
    }

    res.json({
      status: 'success',
      message: 'Notification broadcast successfully',
      data: {
        segment: segmentId,
        successCount: result.success,
        failureCount: result.failure,
        invalidTokensRemoved: result.invalidTokens.length,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
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
    const { customerId, title, body, imageUrl } = req.body;

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
      imageUrl,
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
        successCount: result.success,
        failureCount: result.failure,
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
 * Shows how many customers have devices registered, platform breakdown, etc.
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
