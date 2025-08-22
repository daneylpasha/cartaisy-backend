declare class BackgroundJobManager {
    private jobs;
    private isInitialized;
    /**
     * Initialize all background jobs
     */
    initialize(): void;
    /**
     * Schedule a new background job
     */
    private scheduleJob;
    /**
     * Execute a job with error handling and statistics tracking
     */
    private executeJob;
    /**
     * Update product analytics and engagement metrics
     */
    private updateProductAnalytics;
    /**
     * Check and alert for low stock products
     */
    private checkLowStockAlerts;
    /**
     * Perform weekly data cleanup tasks
     */
    private performDataCleanup;
    /**
     * Perform system health check
     */
    private performHealthCheck;
    /**
     * Get expected interval for a job in milliseconds
     */
    private getExpectedInterval;
    /**
     * Get status of all background jobs
     */
    getJobsStatus(): any;
    /**
     * Start a specific job manually
     */
    runJobManually(jobName: string): Promise<void>;
    /**
     * Stop a specific job
     */
    stopJob(jobName: string): void;
    /**
     * Start a specific job
     */
    startJob(jobName: string): void;
    /**
     * Stop all background jobs
     */
    shutdown(): void;
    /**
     * Log current job status
     */
    private logJobsStatus;
}
declare const jobManager: BackgroundJobManager;
export { jobManager as BackgroundJobManager };
export declare const initializeBackgroundJobs: () => void;
export declare const getBackgroundJobsStatus: () => any;
export declare const runBackgroundJobManually: (jobName: string) => Promise<void>;
export declare const shutdownBackgroundJobs: () => void;
//# sourceMappingURL=backgroundJobService.d.ts.map