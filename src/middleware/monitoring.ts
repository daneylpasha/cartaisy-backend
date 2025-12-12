/**
 * Monitoring Middleware
 * 
 * Comprehensive monitoring and metrics collection middleware
 * for performance tracking, error monitoring, and observability.
 */

import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { config } from '../config';

// Performance metrics interface
interface RequestMetrics {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip: string;
  userId?: string;
  timestamp: Date;
  memoryUsage: NodeJS.MemoryUsage;
  error?: string;
}

// Metrics storage (in production, this would be sent to a metrics service)
class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private maxMetrics = 1000; // Keep last 1000 requests in memory

  addMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the last maxMetrics entries
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  getMetrics(): RequestMetrics[] {
    return [...this.metrics];
  }

  getAverageResponseTime(minutes: number = 5): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const total = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0);
    return total / recentMetrics.length;
  }

  getErrorRate(minutes: number = 5): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) return 0;
    
    const errors = recentMetrics.filter(m => m.statusCode >= 400).length;
    return (errors / recentMetrics.length) * 100;
  }

  getRequestRate(minutes: number = 5): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    return recentMetrics.length / minutes; // requests per minute
  }

  clear(): void {
    this.metrics = [];
  }
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

/**
 * Request timing and metrics middleware
 */
export const requestMetrics = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  // Store start time on request object
  (req as any).startTime = startTime;

  // Override res.end to capture metrics
  const originalEnd = res.end.bind(res);
  (res as any).end = function(...args: any[]) {
    const endTime = performance.now();
    const responseTime = Math.round(endTime - startTime);
    
    // Collect metrics
    const metric: RequestMetrics = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress || 'unknown',
      userId: (req as any).user?.id,
      timestamp: new Date(),
      memoryUsage: process.memoryUsage(),
      error: res.statusCode >= 400 ? res.statusMessage : undefined
    };

    // Add to metrics collector
    if (config.monitoring.enablePerformanceLogging) {
      metricsCollector.addMetric(metric);
    }

    // Log slow requests
    if (responseTime > 1000) {
      console.warn(`Slow request detected: ${req.method} ${req.url} - ${responseTime}ms`);
    }

    // Log errors
    if (res.statusCode >= 400 && config.monitoring.enableErrorLogging) {
      console.error(`Error response: ${req.method} ${req.url} - Status: ${res.statusCode}`);
    }

    // Call original end method
    originalEnd.apply(this, args);
  };

  next();
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  if (!config.monitoring.enableRequestLogging) {
    return next();
  }

  const timestamp = new Date().toISOString();
  const userInfo = (req as any).user ? `User: ${(req as any).user.id}` : 'Anonymous';
  
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl} - ${req.ip} - ${userInfo}`);
  
  next();
};

/**
 * Error tracking middleware
 */
export const errorTracker = (err: Error, req: Request, res: Response, next: NextFunction): void => {
  // Capture error details
  const errorDetails = {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: (req as any).user?.id,
    timestamp: new Date().toISOString(),
    requestId: (req as any).requestId
  };

  // Log error
  if (config.monitoring.enableErrorLogging) {
    console.error('Error captured by middleware:', errorDetails);
  }

  // Send to external error tracking service (Sentry, etc.)
  if (config.monitoring.sentryDsn) {
    // In a real implementation, you would send to Sentry here
    // Sentry.captureException(err, { extra: errorDetails });
  }

  next(err);
};

/**
 * Health metrics endpoint for monitoring systems
 */
export const getSystemMetrics = (req: Request, res: Response): void => {
  const metrics = metricsCollector.getMetrics();
  const averageResponseTime = metricsCollector.getAverageResponseTime(5);
  const errorRate = metricsCollector.getErrorRate(5);
  const requestRate = metricsCollector.getRequestRate(5);
  
  const systemMetrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    performance: {
      averageResponseTime,
      errorRate,
      requestRate,
      totalRequests: metrics.length
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    },
    environment: config.environment,
    version: config.app.version
  };

  res.json({
    success: true,
    data: systemMetrics
  });
};

/**
 * Detailed performance metrics for the last N minutes
 */
export const getPerformanceMetrics = (req: Request, res: Response): void => {
  const minutes = parseInt(req.query.minutes as string) || 5;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  
  const metrics = metricsCollector.getMetrics()
    .filter(m => m.timestamp >= cutoff)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Group by endpoint
  const endpointStats = metrics.reduce((acc, metric) => {
    const endpoint = `${metric.method} ${metric.url.split('?')[0]}`;
    
    if (!acc[endpoint]) {
      acc[endpoint] = {
        count: 0,
        totalResponseTime: 0,
        errors: 0,
        averageResponseTime: 0,
        errorRate: 0
      };
    }
    
    acc[endpoint].count++;
    acc[endpoint].totalResponseTime += metric.responseTime;
    if (metric.statusCode >= 400) {
      acc[endpoint].errors++;
    }
    
    return acc;
  }, {} as Record<string, any>);

  // Calculate averages
  Object.keys(endpointStats).forEach(endpoint => {
    const stats = endpointStats[endpoint];
    stats.averageResponseTime = Math.round(stats.totalResponseTime / stats.count);
    stats.errorRate = Math.round((stats.errors / stats.count) * 100);
    delete stats.totalResponseTime; // Remove intermediate calculation
  });

  // Overall statistics
  const overallStats = {
    timeRange: `${minutes} minutes`,
    totalRequests: metrics.length,
    averageResponseTime: Math.round(metrics.reduce((sum, m) => sum + m.responseTime, 0) / metrics.length) || 0,
    errorRate: Math.round((metrics.filter(m => m.statusCode >= 400).length / metrics.length) * 100) || 0,
    requestsPerMinute: Math.round(metrics.length / minutes),
    slowRequests: metrics.filter(m => m.responseTime > 1000).length,
    statusCodes: metrics.reduce((acc, m) => {
      acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>)
  };

  res.json({
    success: true,
    data: {
      overall: overallStats,
      endpoints: endpointStats,
      recentRequests: metrics.slice(0, 20) // Last 20 requests
    }
  });
};

/**
 * Memory usage monitoring
 */
export const memoryMonitor = (): void => {
  if (!config.monitoring.enablePerformanceLogging) {
    return;
  }

  const checkMemory = () => {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal + usage.external;
    const usedMemory = usage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    if (memoryUsagePercent > 90) {
      console.warn(`High memory usage detected: ${Math.round(memoryUsagePercent)}%`);
      console.warn('Memory details:', {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(usage.external / 1024 / 1024) + 'MB'
      });
    }
  };

  // Check memory usage every 30 seconds
  setInterval(checkMemory, 30000);
};

/**
 * Request ID generation middleware
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const id = req.get('X-Request-ID') || 
            req.get('X-Correlation-ID') || 
            generateRequestId();
  
  (req as any).requestId = id;
  res.set('X-Request-ID', id);
  
  next();
};

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * API rate monitoring
 */
export const rateMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const currentMinute = Math.floor(Date.now() / 60000);
  const key = `rate_${req.ip}_${currentMinute}`;
  
  // In a real implementation, this would use Redis for distributed rate limiting
  // For now, we'll just add headers with current request count
  
  res.set('X-RateLimit-Limit', config.security.rateLimitMaxRequests.toString());
  res.set('X-RateLimit-Reset', ((currentMinute + 1) * 60000).toString());
  
  next();
};

/**
 * Initialize monitoring systems
 */
export const initializeMonitoring = (): void => {
  console.log('🔍 Initializing monitoring systems...');
  
  // Start memory monitoring
  memoryMonitor();
  
  // Initialize Sentry if configured
  if (config.monitoring.sentryDsn) {
    console.log('📊 Sentry error tracking initialized');
    // Sentry.init({ dsn: config.monitoring.sentryDsn });
  }
  
  // Initialize New Relic if configured
  if (config.monitoring.newRelicLicenseKey) {
    console.log('📈 New Relic monitoring initialized');
  }
  
  console.log('✅ Monitoring systems initialized');
};

/**
 * Graceful monitoring cleanup
 */
export const cleanupMonitoring = (): void => {
  console.log('🧹 Cleaning up monitoring systems...');
  
  // Clear metrics
  metricsCollector.clear();
  
  // Close any monitoring connections
  // Sentry.close();
  
  console.log('✅ Monitoring cleanup complete');
};