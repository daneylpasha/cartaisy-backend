import cron from 'node-cron';
import { scheduledSync } from './syncService';
import { updateInventoryLevels, getLowStockProducts } from './inventoryService';
import Product from '../models/Product';
import Order from '../models/Order';
import { ApiError } from '../utils/errors';

// Placeholder for order queue processing
const processOrderQueue = async (): Promise<void> => {
  // Process pending orders
  const pendingOrders = await Order.find({
    status: 'pending',
    createdAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) } // Older than 5 minutes
  }).limit(10);

  for (const order of pendingOrders) {
    try {
      // Basic order processing logic
      console.log(`Processing order: ${order.orderNumber}`);
    } catch (error) {
      console.error(`Error processing order ${order.orderNumber}:`, error);
    }
  }
};

interface IJobStats {
  lastRun: Date;
  runCount: number;
  successCount: number;
  errorCount: number;
  averageDuration: number;
  lastError?: string;
}

interface IJobRegistry {
  [jobName: string]: {
    task: ReturnType<typeof cron.schedule> | null;
    stats: IJobStats;
    isRunning: boolean;
  };
}

class BackgroundJobManager {
  private jobs: IJobRegistry = {};
  private isInitialized = false;

  /**
   * Initialize all background jobs
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log('🔄 Background jobs already initialized');
      return;
    }

    console.log('🚀 Initializing background job system...');

    // Every 4 hours - Incremental sync
    this.scheduleJob('incremental-sync', '0 */4 * * *', async () => {
      await scheduledSync('incremental');
    });

    // Every day at 2 AM - Full sync
    this.scheduleJob('full-sync', '0 2 * * *', async () => {
      await scheduledSync('full');
    });

    // Every 30 minutes - Inventory sync
    this.scheduleJob('inventory-sync', '*/30 * * * *', async () => {
      console.log('🔄 Running scheduled inventory sync...');
      await updateInventoryLevels();
    });

    // Every 15 minutes - Process order queue
    this.scheduleJob('order-processing', '*/15 * * * *', async () => {
      console.log('📦 Processing order queue...');
      await processOrderQueue();
    });

    // Every hour - Analytics update
    this.scheduleJob('analytics-update', '0 * * * *', async () => {
      console.log('📊 Updating product analytics...');
      await this.updateProductAnalytics();
    });

    // Every day at 8 AM - Low stock alerts
    this.scheduleJob('low-stock-alerts', '0 8 * * *', async () => {
      console.log('⚠️ Checking for low stock products...');
      await this.checkLowStockAlerts();
    });

    // Every week on Sunday at 3 AM - Data cleanup
    this.scheduleJob('data-cleanup', '0 3 * * 0', async () => {
      console.log('🧹 Running weekly data cleanup...');
      await this.performDataCleanup();
    });

    // Every 5 minutes - Health check and maintenance
    this.scheduleJob('health-check', '*/5 * * * *', async () => {
      await this.performHealthCheck();
    });

    this.isInitialized = true;
    console.log('✅ Background job system initialized successfully');
    this.logJobsStatus();
  }

  /**
   * Schedule a new background job
   */
  private scheduleJob(name: string, schedule: string, task: () => Promise<void>): void {
    const jobTask = cron.schedule(schedule, async () => {
      await this.executeJob(name, task);
    }, {
      scheduled: false,
      timezone: 'UTC'
    } as any);

    this.jobs[name] = {
      task: jobTask,
      stats: {
        lastRun: new Date(0),
        runCount: 0,
        successCount: 0,
        errorCount: 0,
        averageDuration: 0
      },
      isRunning: false
    };

    jobTask.start();
    console.log(`📅 Scheduled job: ${name} with cron: ${schedule}`);
  }

  /**
   * Execute a job with error handling and statistics tracking
   */
  private async executeJob(name: string, task: () => Promise<void>): Promise<void> {
    const job = this.jobs[name];
    if (!job || job.isRunning) {
      console.log(`⏳ Job ${name} is already running, skipping...`);
      return;
    }

    const startTime = Date.now();
    job.isRunning = true;
    job.stats.runCount++;

    try {
      console.log(`🚀 Starting background job: ${name}`);
      await task();
      
      const duration = Date.now() - startTime;
      job.stats.successCount++;
      job.stats.lastRun = new Date();
      job.stats.averageDuration = Math.round(
        (job.stats.averageDuration * (job.stats.runCount - 1) + duration) / job.stats.runCount
      );
      
      console.log(`✅ Completed job: ${name} in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      job.stats.errorCount++;
      job.stats.lastError = error.message;
      job.stats.lastRun = new Date();
      
      console.error(`❌ Job ${name} failed after ${duration}ms:`, error);
      
      // Don't let job failures crash the application
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Update product analytics and engagement metrics
   */
  private async updateProductAnalytics(): Promise<void> {
    try {
      // Update view counts and engagement metrics
      const products = await Product.find({ status: 'active' }).limit(100);
      
      for (const product of products) {
        // Calculate engagement score based on views, favorites, etc.
        const engagementScore = Math.min(100, 
          (product.analytics.viewCount * 0.1) +
          (product.analytics.favoriteCount * 2) +
          (product.reviews.averageRating * 10)
        );

        await Product.findByIdAndUpdate(product._id, {
          'analytics.engagementScore': Math.round(engagementScore),
          'analytics.lastCalculated': new Date()
        });
      }

      console.log(`📊 Updated analytics for ${products.length} products`);
    } catch (error) {
      console.error('Error updating product analytics:', error);
      throw error;
    }
  }

  /**
   * Check and alert for low stock products
   */
  private async checkLowStockAlerts(): Promise<void> {
    try {
      const lowStockProducts = await getLowStockProducts();
      
      if (lowStockProducts.length > 0) {
        console.log(`⚠️ Found ${lowStockProducts.length} products with low stock:`);
        
        for (const product of lowStockProducts.slice(0, 5)) { // Log first 5
          console.log(`  - ${product.title}: ${product.inventoryTracking.totalQuantity} units`);
        }

        // Here you could implement email alerts, Slack notifications, etc.
        // await sendLowStockAlert(lowStockProducts);
      } else {
        console.log('✅ All products have adequate stock levels');
      }
    } catch (error) {
      console.error('Error checking low stock alerts:', error);
      throw error;
    }
  }

  /**
   * Perform weekly data cleanup tasks
   */
  private async performDataCleanup(): Promise<void> {
    try {
      const cleanupTasks = [];

      // Clean up old search history (older than 90 days)
      cleanupTasks.push(
        import('../models/SearchHistory').then(SearchHistory => 
          SearchHistory.default.deleteMany({
            createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          })
        )
      );

      // Clean up old product views (older than 30 days)
      cleanupTasks.push(
        import('../models/ProductView').then(ProductView =>
          ProductView.default.deleteMany({
            viewedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          })
        )
      );

      // Clean up expired inventory reservations
      // This is handled in memory by the inventory service

      // Clean up old order tracking history (keep only last 6 months)
      cleanupTasks.push(
        Order.updateMany(
          {},
          {
            $pull: {
              'mobileStatus.history': {
                timestamp: { $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
              }
            }
          }
        )
      );

      const results = await Promise.allSettled(cleanupTasks);
      const completed = results.filter(r => r.status === 'fulfilled').length;
      
      console.log(`🧹 Data cleanup completed: ${completed}/${results.length} tasks successful`);
    } catch (error) {
      console.error('Error during data cleanup:', error);
      throw error;
    }
  }

  /**
   * Perform system health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check database connectivity
      const dbCheck = await Product.findOne().lean().maxTimeMS(5000);
      
      // Check if critical jobs are running properly
      const criticalJobs = ['incremental-sync', 'inventory-sync', 'order-processing'];
      const jobIssues = criticalJobs.filter(jobName => {
        const job = this.jobs[jobName];
        if (!job) return true;
        
        const timeSinceLastRun = Date.now() - job.stats.lastRun.getTime();
        const expectedInterval = this.getExpectedInterval(jobName);
        
        return timeSinceLastRun > expectedInterval * 2; // Alert if overdue by 2x
      });

      if (jobIssues.length > 0) {
        console.warn(`⚠️ Health check issues detected in jobs: ${jobIssues.join(', ')}`);
      }

      // Log health status every hour (12 health checks)
      if (this.jobs['health-check'].stats.runCount % 12 === 0) {
        console.log('💚 System health check passed');
      }
    } catch (error) {
      console.error('❤️‍🩹 Health check failed:', error);
      // Don't throw - health checks shouldn't crash the system
    }
  }

  /**
   * Get expected interval for a job in milliseconds
   */
  private getExpectedInterval(jobName: string): number {
    const intervals: { [key: string]: number } = {
      'incremental-sync': 4 * 60 * 60 * 1000,  // 4 hours
      'full-sync': 24 * 60 * 60 * 1000,        // 24 hours
      'inventory-sync': 30 * 60 * 1000,         // 30 minutes
      'order-processing': 15 * 60 * 1000,       // 15 minutes
      'analytics-update': 60 * 60 * 1000,       // 1 hour
      'low-stock-alerts': 24 * 60 * 60 * 1000,  // 24 hours
      'data-cleanup': 7 * 24 * 60 * 60 * 1000,  // 7 days
      'health-check': 5 * 60 * 1000             // 5 minutes
    };

    return intervals[jobName] || 60 * 60 * 1000; // Default 1 hour
  }

  /**
   * Get status of all background jobs
   */
  public getJobsStatus(): any {
    const status = Object.entries(this.jobs).map(([name, job]) => ({
      name,
      isRunning: job.isRunning,
      isScheduled: job.task !== null,
      stats: {
        ...job.stats,
        successRate: job.stats.runCount > 0 ? 
          Math.round((job.stats.successCount / job.stats.runCount) * 100) : 0,
        timeSinceLastRun: Date.now() - job.stats.lastRun.getTime()
      }
    }));

    return {
      isInitialized: this.isInitialized,
      totalJobs: Object.keys(this.jobs).length,
      runningJobs: Object.values(this.jobs).filter(job => job.isRunning).length,
      jobs: status
    };
  }

  /**
   * Start a specific job manually
   */
  public async runJobManually(jobName: string): Promise<void> {
    const job = this.jobs[jobName];
    if (!job) {
      throw new Error(`Job ${jobName} not found`);
    }

    if (job.isRunning) {
      throw new Error(`Job ${jobName} is already running`);
    }

    console.log(`🏃 Manually running job: ${jobName}`);
    
    // Get the job's task function - this is a simplified approach
    // In a real implementation, you'd store the task functions
    const taskMap: { [key: string]: () => Promise<void> } = {
      'incremental-sync': () => scheduledSync('incremental'),
      'full-sync': () => scheduledSync('full'),
      'inventory-sync': () => updateInventoryLevels(),
      'order-processing': () => processOrderQueue(),
      'analytics-update': () => this.updateProductAnalytics(),
      'low-stock-alerts': () => this.checkLowStockAlerts(),
      'data-cleanup': () => this.performDataCleanup(),
      'health-check': () => this.performHealthCheck()
    };

    const task = taskMap[jobName];
    if (task) {
      await this.executeJob(jobName, task);
    } else {
      throw new Error(`No task implementation found for job: ${jobName}`);
    }
  }

  /**
   * Stop a specific job
   */
  public stopJob(jobName: string): void {
    const job = this.jobs[jobName];
    if (!job || !job.task) {
      throw new Error(`Job ${jobName} not found or not scheduled`);
    }

    job.task.stop();
    console.log(`🛑 Stopped job: ${jobName}`);
  }

  /**
   * Start a specific job
   */
  public startJob(jobName: string): void {
    const job = this.jobs[jobName];
    if (!job || !job.task) {
      throw new Error(`Job ${jobName} not found or not scheduled`);
    }

    job.task.start();
    console.log(`▶️ Started job: ${jobName}`);
  }

  /**
   * Stop all background jobs
   */
  public shutdown(): void {
    console.log('🛑 Shutting down background job system...');
    
    Object.entries(this.jobs).forEach(([name, job]) => {
      if (job.task) {
        job.task.stop();
        console.log(`🛑 Stopped job: ${name}`);
      }
    });

    this.isInitialized = false;
    console.log('✅ Background job system shut down');
  }

  /**
   * Log current job status
   */
  private logJobsStatus(): void {
    const status = this.getJobsStatus();
    console.log(`📊 Background Jobs Status:`);
    console.log(`  Total: ${status.totalJobs}`);
    console.log(`  Running: ${status.runningJobs}`);
    console.log(`  Initialized: ${status.isInitialized}`);
  }
}

// Export singleton instance
const jobManager = new BackgroundJobManager();

export { jobManager as BackgroundJobManager };

// Convenience exports
export const initializeBackgroundJobs = () => jobManager.initialize();
export const getBackgroundJobsStatus = () => jobManager.getJobsStatus();
export const runBackgroundJobManually = (jobName: string) => jobManager.runJobManually(jobName);
export const shutdownBackgroundJobs = () => jobManager.shutdown();