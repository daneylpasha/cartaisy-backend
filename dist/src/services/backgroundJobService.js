"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shutdownBackgroundJobs = exports.runBackgroundJobManually = exports.getBackgroundJobsStatus = exports.initializeBackgroundJobs = exports.BackgroundJobManager = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const syncService_1 = require("./syncService");
const inventoryService_1 = require("./inventoryService");
const Product_1 = __importDefault(require("../models/Product"));
const Order_1 = __importDefault(require("../models/Order"));
class BackgroundJobManager {
    constructor() {
        this.jobs = {};
        this.isInitialized = false;
    }
    /**
     * Initialize all background jobs
     */
    initialize() {
        if (this.isInitialized) {
            console.log('🔄 Background jobs already initialized');
            return;
        }
        console.log('🚀 Initializing background job system...');
        // Every 4 hours - Incremental sync
        this.scheduleJob('incremental-sync', '0 */4 * * *', async () => {
            await (0, syncService_1.scheduledSync)('incremental');
        });
        // Every day at 2 AM - Full sync
        this.scheduleJob('full-sync', '0 2 * * *', async () => {
            await (0, syncService_1.scheduledSync)('full');
        });
        // Every 30 minutes - Inventory sync
        this.scheduleJob('inventory-sync', '*/30 * * * *', async () => {
            console.log('🔄 Running scheduled inventory sync...');
            await (0, inventoryService_1.updateInventoryLevels)();
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
    scheduleJob(name, schedule, task) {
        const jobTask = node_cron_1.default.schedule(schedule, async () => {
            await this.executeJob(name, task);
        }, {
            scheduled: false,
            timezone: 'UTC'
        });
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
    async executeJob(name, task) {
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
            job.stats.averageDuration = Math.round((job.stats.averageDuration * (job.stats.runCount - 1) + duration) / job.stats.runCount);
            console.log(`✅ Completed job: ${name} in ${duration}ms`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            job.stats.errorCount++;
            job.stats.lastError = error.message;
            job.stats.lastRun = new Date();
            console.error(`❌ Job ${name} failed after ${duration}ms:`, error);
            // Don't let job failures crash the application
        }
        finally {
            job.isRunning = false;
        }
    }
    /**
     * Update product analytics and engagement metrics
     */
    async updateProductAnalytics() {
        try {
            // Update view counts and engagement metrics
            const products = await Product_1.default.find({ status: 'active' }).limit(100);
            for (const product of products) {
                // Calculate engagement score based on views, favorites, etc.
                const engagementScore = Math.min(100, (product.analytics.viewCount * 0.1) +
                    (product.analytics.favoriteCount * 2) +
                    (product.reviews.averageRating * 10));
                await Product_1.default.findByIdAndUpdate(product._id, {
                    'analytics.engagementScore': Math.round(engagementScore),
                    'analytics.lastCalculated': new Date()
                });
            }
            console.log(`📊 Updated analytics for ${products.length} products`);
        }
        catch (error) {
            console.error('Error updating product analytics:', error);
            throw error;
        }
    }
    /**
     * Check and alert for low stock products
     */
    async checkLowStockAlerts() {
        try {
            const lowStockProducts = await (0, inventoryService_1.getLowStockProducts)();
            if (lowStockProducts.length > 0) {
                console.log(`⚠️ Found ${lowStockProducts.length} products with low stock:`);
                for (const product of lowStockProducts.slice(0, 5)) { // Log first 5
                    console.log(`  - ${product.title}: ${product.inventoryTracking.totalQuantity} units`);
                }
                // Here you could implement email alerts, Slack notifications, etc.
                // await sendLowStockAlert(lowStockProducts);
            }
            else {
                console.log('✅ All products have adequate stock levels');
            }
        }
        catch (error) {
            console.error('Error checking low stock alerts:', error);
            throw error;
        }
    }
    /**
     * Perform weekly data cleanup tasks
     */
    async performDataCleanup() {
        try {
            const cleanupTasks = [];
            // Clean up old search history (older than 90 days)
            cleanupTasks.push(Promise.resolve().then(() => __importStar(require('../models/SearchHistory'))).then(SearchHistory => SearchHistory.default.deleteMany({
                createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
            })));
            // Clean up old product views (older than 30 days)
            cleanupTasks.push(Promise.resolve().then(() => __importStar(require('../models/ProductView'))).then(ProductView => ProductView.default.deleteMany({
                viewedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            })));
            // Clean up expired inventory reservations
            // This is handled in memory by the inventory service
            // Clean up old order tracking history (keep only last 6 months)
            cleanupTasks.push(Order_1.default.updateMany({}, {
                $pull: {
                    'mobileStatus.history': {
                        timestamp: { $lt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
                    }
                }
            }));
            const results = await Promise.allSettled(cleanupTasks);
            const completed = results.filter(r => r.status === 'fulfilled').length;
            console.log(`🧹 Data cleanup completed: ${completed}/${results.length} tasks successful`);
        }
        catch (error) {
            console.error('Error during data cleanup:', error);
            throw error;
        }
    }
    /**
     * Perform system health check
     */
    async performHealthCheck() {
        try {
            // Check database connectivity
            const dbCheck = await Product_1.default.findOne().lean().timeout(5000);
            // Check if critical jobs are running properly
            const criticalJobs = ['incremental-sync', 'inventory-sync', 'order-processing'];
            const jobIssues = criticalJobs.filter(jobName => {
                const job = this.jobs[jobName];
                if (!job)
                    return true;
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
        }
        catch (error) {
            console.error('❤️‍🩹 Health check failed:', error);
            // Don't throw - health checks shouldn't crash the system
        }
    }
    /**
     * Get expected interval for a job in milliseconds
     */
    getExpectedInterval(jobName) {
        const intervals = {
            'incremental-sync': 4 * 60 * 60 * 1000, // 4 hours
            'full-sync': 24 * 60 * 60 * 1000, // 24 hours
            'inventory-sync': 30 * 60 * 1000, // 30 minutes
            'order-processing': 15 * 60 * 1000, // 15 minutes
            'analytics-update': 60 * 60 * 1000, // 1 hour
            'low-stock-alerts': 24 * 60 * 60 * 1000, // 24 hours
            'data-cleanup': 7 * 24 * 60 * 60 * 1000, // 7 days
            'health-check': 5 * 60 * 1000 // 5 minutes
        };
        return intervals[jobName] || 60 * 60 * 1000; // Default 1 hour
    }
    /**
     * Get status of all background jobs
     */
    getJobsStatus() {
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
    async runJobManually(jobName) {
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
        const taskMap = {
            'incremental-sync': () => (0, syncService_1.scheduledSync)('incremental'),
            'full-sync': () => (0, syncService_1.scheduledSync)('full'),
            'inventory-sync': () => (0, inventoryService_1.updateInventoryLevels)(),
            'order-processing': () => processOrderQueue(),
            'analytics-update': () => this.updateProductAnalytics(),
            'low-stock-alerts': () => this.checkLowStockAlerts(),
            'data-cleanup': () => this.performDataCleanup(),
            'health-check': () => this.performHealthCheck()
        };
        const task = taskMap[jobName];
        if (task) {
            await this.executeJob(jobName, task);
        }
        else {
            throw new Error(`No task implementation found for job: ${jobName}`);
        }
    }
    /**
     * Stop a specific job
     */
    stopJob(jobName) {
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
    startJob(jobName) {
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
    shutdown() {
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
    logJobsStatus() {
        const status = this.getJobsStatus();
        console.log(`📊 Background Jobs Status:`);
        console.log(`  Total: ${status.totalJobs}`);
        console.log(`  Running: ${status.runningJobs}`);
        console.log(`  Initialized: ${status.isInitialized}`);
    }
}
// Export singleton instance
const jobManager = new BackgroundJobManager();
exports.BackgroundJobManager = jobManager;
// Convenience exports
const initializeBackgroundJobs = () => jobManager.initialize();
exports.initializeBackgroundJobs = initializeBackgroundJobs;
const getBackgroundJobsStatus = () => jobManager.getJobsStatus();
exports.getBackgroundJobsStatus = getBackgroundJobsStatus;
const runBackgroundJobManually = (jobName) => jobManager.runJobManually(jobName);
exports.runBackgroundJobManually = runBackgroundJobManually;
const shutdownBackgroundJobs = () => jobManager.shutdown();
exports.shutdownBackgroundJobs = shutdownBackgroundJobs;
//# sourceMappingURL=backgroundJobService.js.map