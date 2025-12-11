import { Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { AuthenticatedRequest } from '../types';

/**
 * Get security alerts for a store (Admin only)
 */
export const getSecurityAlerts = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    // Failed access attempts (401/403)
    const failedAttempts = await AuditLog.countDocuments({
      storeId,
      statusCode: { $in: [401, 403] },
      timestamp: { $gte: last24Hours },
    });

    // High volume IPs (> 500 requests/hour)
    const highVolumeIPs = await AuditLog.aggregate([
      {
        $match: {
          storeId,
          timestamp: { $gte: lastHour },
        },
      },
      {
        $group: {
          _id: '$ip',
          count: { $sum: 1 },
        },
      },
      {
        $match: {
          count: { $gt: 500 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Recent failed attempts
    const recentFailures = await AuditLog.find({
      storeId,
      statusCode: { $in: [401, 403] },
      timestamp: { $gte: last24Hours },
    })
      .sort({ timestamp: -1 })
      .limit(10)
      .select('ip endpoint timestamp statusCode method userAgent')
      .lean();

    // Error rate (5xx errors)
    const serverErrors = await AuditLog.countDocuments({
      storeId,
      statusCode: { $gte: 500 },
      timestamp: { $gte: lastHour },
    });

    // Total requests in last hour (for context)
    const totalRequestsLastHour = await AuditLog.countDocuments({
      storeId,
      timestamp: { $gte: lastHour },
    });

    // Top endpoints with errors
    const errorEndpoints = await AuditLog.aggregate([
      {
        $match: {
          storeId,
          statusCode: { $gte: 400 },
          timestamp: { $gte: last24Hours },
        },
      },
      {
        $group: {
          _id: '$endpoint',
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 5,
      },
    ]);

    res.json({
      status: 'success',
      data: {
        summary: {
          failedAttempts24h: failedAttempts,
          serverErrors1h: serverErrors,
          totalRequests1h: totalRequestsLastHour,
          errorRate1h: totalRequestsLastHour > 0
            ? ((serverErrors / totalRequestsLastHour) * 100).toFixed(2) + '%'
            : '0%',
        },
        suspiciousIPs: highVolumeIPs.map((ip) => ({
          ip: ip._id,
          requestCount: ip.count,
        })),
        recentFailures,
        errorEndpoints: errorEndpoints.map((ep) => ({
          endpoint: ep._id,
          errorCount: ep.count,
          avgDuration: Math.round(ep.avgDuration),
        })),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Security alerts error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch security alerts',
    });
  }
};

/**
 * Get audit log for a store (Admin only)
 */
export const getAuditLog = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      statusCode,
      userId,
      endpoint,
      method,
      ip,
    } = req.query as {
      page?: number;
      limit?: number;
      startDate?: string;
      endDate?: string;
      statusCode?: string;
      userId?: string;
      endpoint?: string;
      method?: string;
      ip?: string;
    };

    const query: any = { storeId };

    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    // Status code filter
    if (statusCode) {
      query.statusCode = parseInt(statusCode, 10);
    }

    // User filter
    if (userId) {
      query.userId = userId;
    }

    // Endpoint filter (partial match)
    if (endpoint) {
      query.endpoint = { $regex: endpoint, $options: 'i' };
    }

    // Method filter
    if (method) {
      query.method = method.toUpperCase();
    }

    // IP filter
    if (ip) {
      query.ip = ip;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      status: 'success',
      data: {
        logs,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch audit log',
    });
  }
};

/**
 * Get request statistics for a store (Admin only)
 */
export const getRequestStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params as { storeId: string };
    const { hours = 24 } = req.query as { hours?: number };

    const since = new Date(Date.now() - Number(hours) * 60 * 60 * 1000);

    // Requests by hour
    const requestsByHour = await AuditLog.aggregate([
      {
        $match: {
          storeId,
          timestamp: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' },
          },
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
          errors: {
            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] },
          },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Top endpoints
    const topEndpoints = await AuditLog.aggregate([
      {
        $match: {
          storeId,
          timestamp: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$endpoint',
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Status code distribution
    const statusDistribution = await AuditLog.aggregate([
      {
        $match: {
          storeId,
          timestamp: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $concat: [
              { $toString: { $multiply: [{ $floor: { $divide: ['$statusCode', 100] } }, 100] } },
              '-',
              { $toString: { $add: [{ $multiply: [{ $floor: { $divide: ['$statusCode', 100] } }, 100] }, 99] } },
            ],
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    res.json({
      status: 'success',
      data: {
        period: `Last ${hours} hours`,
        requestsByHour: requestsByHour.map((h) => ({
          hour: h._id,
          requests: h.count,
          avgDuration: Math.round(h.avgDuration),
          errors: h.errors,
        })),
        topEndpoints: topEndpoints.map((ep) => ({
          endpoint: ep._id,
          requests: ep.count,
          avgDuration: Math.round(ep.avgDuration),
        })),
        statusDistribution: statusDistribution.map((s) => ({
          range: s._id,
          count: s.count,
        })),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Request stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch request statistics',
    });
  }
};
