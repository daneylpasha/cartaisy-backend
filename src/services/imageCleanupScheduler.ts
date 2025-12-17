import * as cron from 'node-cron';
import { ImageUsage } from '../models/ImageUsage';
import { cloudinaryService } from './cloudinaryService';

class ImageCleanupScheduler {
  private isRunning = false;

  start() {
    if (this.isRunning) {
      console.log('🖼️ [CLEANUP] Already running');
      return;
    }

    // Run daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      await this.cleanupImages();
    });

    this.isRunning = true;
    console.log('🖼️ [CLEANUP] Scheduler started - runs daily at 3 AM');
  }

  async cleanupImages() {
    console.log('🖼️ [CLEANUP] Starting image cleanup...');

    try {
      // 1. Delete unused images older than 7 days
      await this.deleteUnusedImages();

      // 2. Delete notification images older than 90 days
      await this.deleteOldNotificationImages();

      console.log('🖼️ [CLEANUP] Cleanup complete');
    } catch (error) {
      console.error('🖼️ [CLEANUP] Error:', error);
    }
  }

  private async deleteUnusedImages() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const usages = await ImageUsage.find({
      'images.usedIn': 'unused',
      'images.createdAt': { $lt: sevenDaysAgo }
    });

    let totalDeleted = 0;

    for (const usage of usages) {
      const unusedOldImages = usage.images.filter(
        img => img.usedIn === 'unused' && img.createdAt < sevenDaysAgo
      );

      if (unusedOldImages.length === 0) continue;

      const publicIds = unusedOldImages.map(img => img.publicId);

      // Delete from Cloudinary
      await cloudinaryService.deleteImages(publicIds);

      // Remove from database
      const deletedSize = unusedOldImages.reduce((sum, img) => sum + img.size, 0);

      usage.images = usage.images.filter(
        img => !(img.usedIn === 'unused' && img.createdAt < sevenDaysAgo)
      );
      usage.imageCount = usage.images.length;
      usage.totalSize -= deletedSize;
      await usage.save();

      totalDeleted += unusedOldImages.length;
    }

    console.log(`🖼️ [CLEANUP] Deleted ${totalDeleted} unused images (>7 days old)`);
  }

  private async deleteOldNotificationImages() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const usages = await ImageUsage.find({
      'images.usedIn': 'notification',
      'images.createdAt': { $lt: ninetyDaysAgo }
    });

    let totalDeleted = 0;

    for (const usage of usages) {
      const oldNotificationImages = usage.images.filter(
        img => img.usedIn === 'notification' && img.createdAt < ninetyDaysAgo
      );

      if (oldNotificationImages.length === 0) continue;

      const publicIds = oldNotificationImages.map(img => img.publicId);

      // Delete from Cloudinary
      await cloudinaryService.deleteImages(publicIds);

      // Remove from database
      const deletedSize = oldNotificationImages.reduce((sum, img) => sum + img.size, 0);

      usage.images = usage.images.filter(
        img => !(img.usedIn === 'notification' && img.createdAt < ninetyDaysAgo)
      );
      usage.imageCount = usage.images.length;
      usage.totalSize -= deletedSize;
      await usage.save();

      totalDeleted += oldNotificationImages.length;
    }

    console.log(`🖼️ [CLEANUP] Deleted ${totalDeleted} old notification images (>90 days)`);
  }

  /**
   * Manually trigger cleanup (for testing or admin use)
   */
  async runNow() {
    await this.cleanupImages();
  }
}

export const imageCleanupScheduler = new ImageCleanupScheduler();
