import * as cron from 'node-cron';
import mongoose from 'mongoose';
import { processAbandonedCartsForStore } from './abandonedCartService';

/**
 * Abandoned Cart Scheduler
 *
 * Runs every 15 minutes to check for abandoned carts across all stores
 * and sends notifications to customers who have left items in their cart.
 */

interface ProcessingStats {
  storeId: string;
  storeName: string;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

class AbandonedCartScheduler {
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;
  private lastRunAt: Date | null = null;
  private lastRunStats: ProcessingStats[] = [];

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('🛒 [ABANDONED] Scheduler already running');
      return;
    }

    // Run every 15 minutes
    this.cronJob = cron.schedule('*/15 * * * *', async () => {
      await this.processAllStores();
    });

    this.isRunning = true;
    console.log('🛒 [ABANDONED] Scheduler started - checking every 15 minutes');
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
    console.log('🛒 [ABANDONED] Scheduler stopped');
  }

  /**
   * Check if the scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Process abandoned carts for all active stores
   */
  async processAllStores(): Promise<void> {
    const startTime = Date.now();
    console.log('🛒 [ABANDONED] Starting abandoned cart processing...');

    try {
      const Store = mongoose.model('Store');

      // Get all active stores with abandoned cart notifications enabled
      const stores = await Store.find({
        isActive: true,
        'abandonedCartSettings.enabled': { $ne: false },
      })
        .select('_id name abandonedCartSettings')
        .lean();

      if (stores.length === 0) {
        console.log('🛒 [ABANDONED] No stores with abandoned cart notifications enabled');
        return;
      }

      console.log(`🛒 [ABANDONED] Processing ${stores.length} store(s)...`);

      const stats: ProcessingStats[] = [];

      for (const store of stores) {
        try {
          const result = await processAbandonedCartsForStore(store._id.toString());

          stats.push({
            storeId: store._id.toString(),
            storeName: store.name,
            ...result,
          });

          if (result.sent > 0 || result.failed > 0) {
            console.log(
              `🛒 [ABANDONED] ${store.name}: Processed ${result.processed}, ` +
                `Sent ${result.sent}, Failed ${result.failed}, Skipped ${result.skipped}`
            );
          }
        } catch (error) {
          console.error(`🛒 [ABANDONED] Error processing store ${store.name}:`, error);
          stats.push({
            storeId: store._id.toString(),
            storeName: store.name,
            processed: 0,
            sent: 0,
            failed: 0,
            skipped: 0,
          });
        }
      }

      this.lastRunAt = new Date();
      this.lastRunStats = stats;

      const duration = Date.now() - startTime;
      const totalSent = stats.reduce((sum, s) => sum + s.sent, 0);
      const totalFailed = stats.reduce((sum, s) => sum + s.failed, 0);

      console.log(
        `🛒 [ABANDONED] Completed in ${duration}ms - ` +
          `Total sent: ${totalSent}, Total failed: ${totalFailed}`
      );
    } catch (error) {
      console.error('🛒 [ABANDONED] Error in processAllStores:', error);
    }
  }

  /**
   * Manually trigger processing (useful for testing)
   */
  async triggerProcessing(): Promise<{
    stats: ProcessingStats[];
    duration: number;
  }> {
    const startTime = Date.now();
    console.log('🛒 [ABANDONED] Manual trigger initiated');

    await this.processAllStores();

    return {
      stats: this.lastRunStats,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    lastRunAt: Date | null;
    lastRunStats: ProcessingStats[];
    nextRunIn: number | null;
  } {
    let nextRunIn: number | null = null;

    if (this.isRunning && this.lastRunAt) {
      // Next run is 15 minutes after last run
      const nextRunTime = new Date(this.lastRunAt.getTime() + 15 * 60 * 1000);
      nextRunIn = Math.max(0, nextRunTime.getTime() - Date.now());
    }

    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      lastRunStats: this.lastRunStats,
      nextRunIn,
    };
  }

  /**
   * Process a single store (for admin manual trigger)
   */
  async processStore(storeId: string): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    console.log(`🛒 [ABANDONED] Processing store ${storeId} (manual trigger)`);
    return await processAbandonedCartsForStore(storeId);
  }
}

// Export singleton instance
export const abandonedCartScheduler = new AbandonedCartScheduler();
