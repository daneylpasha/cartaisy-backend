/**
 * Metrics and Monitoring Routes
 * 
 * Endpoints for accessing system metrics, performance data,
 * and monitoring information for operational dashboards.
 */

import express from 'express';
import { Request, Response } from 'express';
import { 
  getSystemMetrics, 
  getPerformanceMetrics, 
  metricsCollector 
} from '../middleware/monitoring';
import { authenticate } from '../middleware/auth';
import { config } from '../config';

const router = express.Router();

// Apply authentication to all metrics routes
router.use(authenticate);

/**
 * GET /api/metrics/system - System-wide metrics
 */
router.get('/system', getSystemMetrics);

/**
 * GET /api/metrics/performance - Performance metrics
 */
router.get('/performance', getPerformanceMetrics);

/**
 * GET /api/metrics/requests - Recent request details
 */
router.get('/requests', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const allMetrics = metricsCollector.getMetrics();
  const total = allMetrics.length;
  const requests = allMetrics
    .slice(offset, offset + limit)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  res.json({
    success: true,
    data: {
      requests,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    }
  });
});

/**
 * GET /api/metrics/errors - Error metrics and recent errors
 */
router.get('/errors', (req: Request, res: Response) => {
  const minutes = parseInt(req.query.minutes as string) || 60;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  
  const allMetrics = metricsCollector.getMetrics();
  const errorMetrics = allMetrics
    .filter(m => m.timestamp >= cutoff && m.statusCode >= 400)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Group errors by status code
  const errorsByStatus = errorMetrics.reduce((acc, metric) => {
    const status = metric.statusCode.toString();
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(metric);
    return acc;
  }, {} as Record<string, any[]>);

  // Error rate calculation
  const totalRequests = allMetrics.filter(m => m.timestamp >= cutoff).length;
  const errorRate = totalRequests > 0 ? (errorMetrics.length / totalRequests) * 100 : 0;

  res.json({
    success: true,
    data: {
      timeRange: `${minutes} minutes`,
      errorRate: Math.round(errorRate * 100) / 100,
      totalErrors: errorMetrics.length,
      totalRequests,
      errorsByStatus,
      recentErrors: errorMetrics.slice(0, 20)
    }
  });
});

/**
 * GET /api/metrics/endpoints - Endpoint-specific metrics
 */
router.get('/endpoints', (req: Request, res: Response) => {
  const minutes = parseInt(req.query.minutes as string) || 30;
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  
  const metrics = metricsCollector.getMetrics()
    .filter(m => m.timestamp >= cutoff);

  // Group by endpoint
  const endpointMetrics = metrics.reduce((acc, metric) => {
    // Normalize URL (remove query params and IDs)
    const normalizedUrl = metric.url
      .split('?')[0] // Remove query params
      .replace(/\/[0-9a-f]{24}/g, '/:id') // Replace MongoDB IDs
      .replace(/\/\d+/g, '/:id'); // Replace numeric IDs
    
    const endpoint = `${metric.method} ${normalizedUrl}`;
    
    if (!acc[endpoint]) {
      acc[endpoint] = {
        endpoint,
        count: 0,
        totalResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        errors: 0,
        statusCodes: {},
        averageResponseTime: 0,
        errorRate: 0
      };
    }
    
    const endpointData = acc[endpoint];
    endpointData.count++;
    endpointData.totalResponseTime += metric.responseTime;
    endpointData.minResponseTime = Math.min(endpointData.minResponseTime, metric.responseTime);
    endpointData.maxResponseTime = Math.max(endpointData.maxResponseTime, metric.responseTime);
    
    if (metric.statusCode >= 400) {
      endpointData.errors++;
    }
    
    // Track status codes
    const statusCode = metric.statusCode.toString();
    endpointData.statusCodes[statusCode] = (endpointData.statusCodes[statusCode] || 0) + 1;
    
    return acc;
  }, {} as Record<string, any>);

  // Calculate averages and rates
  Object.values(endpointMetrics).forEach((data: any) => {
    data.averageResponseTime = Math.round(data.totalResponseTime / data.count);
    data.errorRate = Math.round((data.errors / data.count) * 100);
    data.requestsPerMinute = Math.round((data.count / minutes) * 100) / 100;
    
    // Clean up intermediate calculations
    delete data.totalResponseTime;
    
    // Handle infinity case for min response time
    if (data.minResponseTime === Infinity) {
      data.minResponseTime = 0;
    }
  });

  // Sort by request count
  const sortedEndpoints = Object.values(endpointMetrics)
    .sort((a: any, b: any) => b.count - a.count);

  res.json({
    success: true,
    data: {
      timeRange: `${minutes} minutes`,
      endpoints: sortedEndpoints,
      summary: {
        totalEndpoints: sortedEndpoints.length,
        totalRequests: metrics.length,
        averageRequestsPerEndpoint: Math.round(metrics.length / sortedEndpoints.length) || 0
      }
    }
  });
});

/**
 * GET /api/metrics/database - Database performance metrics
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const mongoose = require('mongoose');
    
    // Get database statistics
    const dbStats = await mongoose.connection.db.stats();
    const adminStats = await mongoose.connection.db.admin().serverStatus();
    
    const databaseMetrics = {
      connectionState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      collections: dbStats.collections,
      objects: dbStats.objects,
      dataSize: {
        bytes: dbStats.dataSize,
        mb: Math.round(dbStats.dataSize / 1024 / 1024 * 100) / 100
      },
      storageSize: {
        bytes: dbStats.storageSize,
        mb: Math.round(dbStats.storageSize / 1024 / 1024 * 100) / 100
      },
      indexSize: {
        bytes: dbStats.indexSize,
        mb: Math.round(dbStats.indexSize / 1024 / 1024 * 100) / 100
      },
      avgObjSize: Math.round(dbStats.avgObjSize),
      connections: {
        current: adminStats.connections?.current || 0,
        available: adminStats.connections?.available || 0,
        totalCreated: adminStats.connections?.totalCreated || 0
      },
      uptime: adminStats.uptime,
      version: adminStats.version
    };

    res.json({
      success: true,
      data: databaseMetrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch database metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/realtime - Real-time metrics (last 5 minutes)
 */
router.get('/realtime', (req: Request, res: Response) => {
  const metrics = metricsCollector.getMetrics();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
  
  const realtimeMetrics = metrics.filter(m => m.timestamp >= cutoff);
  
  // Calculate real-time statistics
  const stats = {
    timestamp: new Date().toISOString(),
    timeRange: '5 minutes',
    totalRequests: realtimeMetrics.length,
    requestsPerMinute: Math.round(realtimeMetrics.length / 5),
    averageResponseTime: realtimeMetrics.length > 0 
      ? Math.round(realtimeMetrics.reduce((sum, m) => sum + m.responseTime, 0) / realtimeMetrics.length)
      : 0,
    errorRate: realtimeMetrics.length > 0
      ? Math.round((realtimeMetrics.filter(m => m.statusCode >= 400).length / realtimeMetrics.length) * 100)
      : 0,
    statusCodeDistribution: realtimeMetrics.reduce((acc, m) => {
      const code = m.statusCode.toString();
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    slowRequests: realtimeMetrics.filter(m => m.responseTime > 1000).length,
    topEndpoints: Object.entries(
      realtimeMetrics.reduce((acc, m) => {
        const endpoint = `${m.method} ${m.url.split('?')[0]}`;
        acc[endpoint] = (acc[endpoint] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    )
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([endpoint, count]) => ({ endpoint, count })),
    memoryUsage: process.memoryUsage(),
    cpuUsage: process.cpuUsage()
  };

  res.json({
    success: true,
    data: stats
  });
});

/**
 * POST /api/metrics/clear - Clear metrics (admin only)
 */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    // Check if user has admin role
    const user = (req as any).user;
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    metricsCollector.clear();
    
    res.json({
      success: true,
      message: 'Metrics cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/export - Export metrics data
 */
router.get('/export', (req: Request, res: Response) => {
  const format = req.query.format as string || 'json';
  const minutes = parseInt(req.query.minutes as string) || 60;
  
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  const metrics = metricsCollector.getMetrics()
    .filter(m => m.timestamp >= cutoff);

  if (format === 'csv') {
    // Export as CSV
    const csvHeaders = 'timestamp,method,url,statusCode,responseTime,ip,userId\n';
    const csvData = metrics.map(m => 
      `${m.timestamp.toISOString()},${m.method},${m.url},${m.statusCode},${m.responseTime},${m.ip},${m.userId || ''}`
    ).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="metrics-${Date.now()}.csv"`);
    res.send(csvHeaders + csvData);
  } else {
    // Export as JSON
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="metrics-${Date.now()}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      timeRange: `${minutes} minutes`,
      totalRecords: metrics.length,
      data: metrics
    });
  }
});

export default router;