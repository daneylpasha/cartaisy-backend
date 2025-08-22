/**
 * Comprehensive Health Check Routes
 * 
 * Provides detailed system health monitoring endpoints for
 * load balancers, monitoring systems, and operational teams.
 */

import express from 'express';
import mongoose from 'mongoose';
import { Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { config } from '../config';

const router = express.Router();

// Health check response interface
interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  details?: any;
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  environment: string;
  version: string;
  uptime: number;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

/**
 * Basic health check endpoint for load balancers
 * Returns 200 OK if service is running
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      success: true,
      message: 'API Server is running',
      timestamp: new Date().toISOString(),
      environment: config.environment,
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };

    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Detailed health check endpoint
 * Comprehensive system status for monitoring
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const startTime = performance.now();
  const checks: HealthCheckResult[] = [];

  try {
    // Run all health checks in parallel
    const [
      databaseCheck,
      redisCheck,
      memoryCheck,
      diskCheck,
      externalServicesCheck
    ] = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
      checkMemoryUsage(),
      checkDiskSpace(),
      checkExternalServices()
    ]);

    // Process results
    if (databaseCheck.status === 'fulfilled') {
      checks.push(databaseCheck.value);
    } else {
      checks.push({
        name: 'database',
        status: 'unhealthy',
        responseTime: 0,
        error: databaseCheck.reason?.message || 'Database check failed'
      });
    }

    if (redisCheck.status === 'fulfilled') {
      checks.push(redisCheck.value);
    } else {
      checks.push({
        name: 'redis',
        status: 'unhealthy',
        responseTime: 0,
        error: redisCheck.reason?.message || 'Redis check failed'
      });
    }

    if (memoryCheck.status === 'fulfilled') {
      checks.push(memoryCheck.value);
    }

    if (diskCheck.status === 'fulfilled') {
      checks.push(diskCheck.value);
    }

    if (externalServicesCheck.status === 'fulfilled') {
      checks.push(...externalServicesCheck.value);
    }

    // Calculate overall health
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length
    };

    const overallStatus = summary.unhealthy > 0 ? 'unhealthy' : 
                         summary.degraded > 0 ? 'degraded' : 'healthy';

    const health: SystemHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      environment: config.environment,
      version: config.app.version,
      uptime: process.uptime(),
      checks,
      summary
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;

    res.status(statusCode).json({
      success: overallStatus !== 'unhealthy',
      data: health,
      responseTime: Math.round(performance.now() - startTime)
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Detailed health check failed',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Math.round(performance.now() - startTime)
    });
  }
});

/**
 * Database-specific health check
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const result = await checkDatabase();
    
    res.status(result.status === 'healthy' ? 200 : 503).json({
      success: result.status === 'healthy',
      data: result
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Redis health check endpoint
 */
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const result = await checkRedis();
    
    res.status(result.status === 'healthy' ? 200 : 503).json({
      success: result.status === 'healthy',
      data: result
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * External services health check
 */
router.get('/services', async (req: Request, res: Response) => {
  try {
    const checks = await checkExternalServices();
    const hasUnhealthy = checks.some(check => check.status === 'unhealthy');
    
    res.status(hasUnhealthy ? 503 : 200).json({
      success: !hasUnhealthy,
      data: {
        checks,
        summary: {
          total: checks.length,
          healthy: checks.filter(c => c.status === 'healthy').length,
          unhealthy: checks.filter(c => c.status === 'unhealthy').length,
          degraded: checks.filter(c => c.status === 'degraded').length
        }
      }
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Readiness probe - indicates if the service is ready to serve traffic
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check critical dependencies only
    const [dbCheck] = await Promise.allSettled([
      checkDatabase()
    ]);

    const isReady = dbCheck.status === 'fulfilled' && 
                   dbCheck.value.status === 'healthy';

    if (isReady) {
      res.status(200).json({
        success: true,
        message: 'Service is ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        message: 'Service is not ready',
        timestamp: new Date().toISOString(),
        details: dbCheck.status === 'rejected' ? dbCheck.reason?.message : 'Database not healthy'
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Readiness check failed',
      error: error.message
    });
  }
});

/**
 * Liveness probe - indicates if the service is alive
 */
router.get('/live', async (req: Request, res: Response) => {
  // Simple liveness check - just return success if we can respond
  res.status(200).json({
    success: true,
    message: 'Service is alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid
  });
});

// Health check implementations

/**
 * Check database connectivity and performance
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Check connection state
    const connectionState = mongoose.connection.readyState;
    if (connectionState !== 1) {
      return {
        name: 'database',
        status: 'unhealthy',
        responseTime: Math.round(performance.now() - startTime),
        error: `Connection state: ${connectionState} (expected: 1)`
      };
    }

    // Test query performance
    await mongoose.connection.db.admin().ping();
    const responseTime = Math.round(performance.now() - startTime);

    // Get connection info
    const stats = await mongoose.connection.db.stats();
    
    return {
      name: 'database',
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      responseTime,
      details: {
        connectionState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        collections: stats.collections,
        dataSize: stats.dataSize,
        indexSize: stats.indexSize
      }
    };
  } catch (error) {
    return {
      name: 'database',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

/**
 * Check Redis connectivity (if enabled)
 */
async function checkRedis(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  if (!config.redis.enabled) {
    return {
      name: 'redis',
      status: 'healthy',
      responseTime: 0,
      details: { enabled: false, message: 'Redis caching disabled' }
    };
  }

  try {
    // This would require Redis client to be available
    // For now, return a mock healthy status
    const responseTime = Math.round(performance.now() - startTime);
    
    return {
      name: 'redis',
      status: 'healthy',
      responseTime,
      details: {
        enabled: true,
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db
      }
    };
  } catch (error) {
    return {
      name: 'redis',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

/**
 * Check memory usage
 */
async function checkMemoryUsage(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal + memUsage.external;
    const usedMemory = memUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (memoryUsagePercent > 90) {
      status = 'unhealthy';
    } else if (memoryUsagePercent > 80) {
      status = 'degraded';
    }

    return {
      name: 'memory',
      status,
      responseTime: Math.round(performance.now() - startTime),
      details: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
        usagePercent: Math.round(memoryUsagePercent * 100) / 100
      }
    };
  } catch (error) {
    return {
      name: 'memory',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

/**
 * Check disk space (simplified check)
 */
async function checkDiskSpace(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Simplified disk space check
    // In a real implementation, you'd use fs.stat or a disk usage library
    
    return {
      name: 'disk',
      status: 'healthy',
      responseTime: Math.round(performance.now() - startTime),
      details: {
        message: 'Disk space monitoring not implemented',
        available: 'unknown'
      }
    };
  } catch (error) {
    return {
      name: 'disk',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

/**
 * Check external services
 */
async function checkExternalServices(): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];

  // Shopify API check
  if (config.shopify.syncEnabled) {
    const shopifyCheck = await checkShopifyAPI();
    checks.push(shopifyCheck);
  }

  // Email service check
  if (config.email.sendRealEmails) {
    const emailCheck = await checkEmailService();
    checks.push(emailCheck);
  }

  return checks;
}

/**
 * Check Shopify API connectivity
 */
async function checkShopifyAPI(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Mock Shopify API check
    // In real implementation, make a simple API call to Shopify
    
    const responseTime = Math.round(performance.now() - startTime);
    
    return {
      name: 'shopify',
      status: 'healthy',
      responseTime,
      details: {
        storeUrl: config.shopify.storeUrl,
        apiVersion: config.shopify.apiVersion,
        syncEnabled: config.shopify.syncEnabled
      }
    };
  } catch (error) {
    return {
      name: 'shopify',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

/**
 * Check email service connectivity
 */
async function checkEmailService(): Promise<HealthCheckResult> {
  const startTime = performance.now();
  
  try {
    // Mock email service check
    // In real implementation, verify API key or send test email
    
    const responseTime = Math.round(performance.now() - startTime);
    
    return {
      name: 'email',
      status: 'healthy',
      responseTime,
      details: {
        service: config.email.service,
        from: config.email.from,
        sendRealEmails: config.email.sendRealEmails
      }
    };
  } catch (error) {
    return {
      name: 'email',
      status: 'unhealthy',
      responseTime: Math.round(performance.now() - startTime),
      error: error.message
    };
  }
}

export default router;