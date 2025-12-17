import * as cron from 'node-cron';
import mongoose from 'mongoose';
import NotificationLog from '../models/NotificationLog';
import { FirebaseNotificationService } from './firebaseNotificationService';
import { SegmentationService } from './segmentationService';

/**
 * Notification Scheduler Service
 *
 * Runs every minute to check for scheduled notifications that are due
 * and sends them via Firebase Cloud Messaging.
 */
class NotificationScheduler {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('📅 [SCHEDULER] Already running');
      return;
    }

    // Run every minute
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.processScheduledNotifications();
    });

    this.isRunning = true;
    console.log('📅 [SCHEDULER] Started - checking every minute for scheduled notifications');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('📅 [SCHEDULER] Stopped');
  }

  /**
   * Check if the scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Process all due scheduled notifications
   */
  async processScheduledNotifications(): Promise<void> {
    const now = new Date();

    try {
      // Find all scheduled notifications that are due
      const dueNotifications = await NotificationLog.find({
        status: 'scheduled',
        scheduledFor: { $lte: now },
      });

      if (dueNotifications.length === 0) {
        return; // Nothing to process
      }

      console.log(`📅 [SCHEDULER] Found ${dueNotifications.length} due notification(s)`);

      for (const notification of dueNotifications) {
        await this.sendScheduledNotification(notification);
      }
    } catch (error) {
      console.error('📅 [SCHEDULER] Error processing scheduled notifications:', error);
    }
  }

  /**
   * Send a single scheduled notification
   */
  private async sendScheduledNotification(notification: any): Promise<void> {
    const notificationId = notification._id.toString();
    const storeId = notification.storeId.toString();

    console.log(`📅 [SCHEDULER] Processing notification: ${notificationId}`);
    console.log(`📅 [SCHEDULER] Store: ${storeId}, Segment: ${notification.segment}`);

    try {
      // Update status to sending
      notification.status = 'sending';
      await notification.save();

      // Get tokens based on segment
      const deviceTokens = await SegmentationService.getSegmentDeviceTokens(
        storeId,
        notification.segment
      );

      notification.targetCount = deviceTokens.length;

      console.log(`📅 [SCHEDULER] Found ${deviceTokens.length} device token(s)`);

      if (deviceTokens.length === 0) {
        notification.status = 'sent';
        notification.sentAt = new Date();
        notification.scheduledFor = undefined;
        await notification.save();
        console.log(`📅 [SCHEDULER] No tokens for notification: ${notificationId}`);
        return;
      }

      // Send via Firebase
      const result = await FirebaseNotificationService.sendToDevices(deviceTokens, {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl,
        data: {
          type: 'store_announcement',
          segment: notification.segment,
          notificationId: notification._id.toString(),
          scheduled: 'true',
          ...(notification.data || {}),
        },
      });

      // Update notification with results
      notification.successCount = result.successCount;
      notification.failureCount = result.failureCount;
      notification.failedTokens = result.failedTokens;
      notification.sentAt = new Date();
      notification.scheduledFor = undefined;

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

      console.log(`📅 [SCHEDULER] Notification sent: ${notificationId}`);
      console.log(`📅 [SCHEDULER] Success: ${result.successCount}, Failed: ${result.failureCount}`);
    } catch (error: any) {
      console.error(`📅 [SCHEDULER] Failed to send notification ${notificationId}:`, error);

      notification.status = 'failed';
      notification.failedTokens = [
        {
          token: 'all',
          error: error.message || 'Unknown error',
          errorCode: 'scheduler/exception',
        },
      ];
      notification.sentAt = new Date();
      notification.scheduledFor = undefined;
      await notification.save();
    }
  }

  /**
   * Manually trigger processing (useful for testing)
   */
  async triggerProcessing(): Promise<{ processed: number }> {
    console.log('📅 [SCHEDULER] Manual trigger initiated');

    const before = await NotificationLog.countDocuments({
      status: 'scheduled',
      scheduledFor: { $lte: new Date() },
    });

    await this.processScheduledNotifications();

    const after = await NotificationLog.countDocuments({
      status: 'scheduled',
      scheduledFor: { $lte: new Date() },
    });

    return { processed: before - after };
  }

  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    pendingCount: number;
    nextDue: Date | null;
  }> {
    const pendingCount = await NotificationLog.countDocuments({
      status: 'scheduled',
    });

    const nextDue = await NotificationLog.findOne({
      status: 'scheduled',
      scheduledFor: { $gte: new Date() },
    })
      .sort({ scheduledFor: 1 })
      .select('scheduledFor')
      .lean();

    return {
      isRunning: this.isRunning,
      pendingCount,
      nextDue: nextDue?.scheduledFor || null,
    };
  }
}

// Export singleton instance
export const notificationScheduler = new NotificationScheduler();
