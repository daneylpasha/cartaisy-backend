import { Request, Response, NextFunction } from 'express';
import { AuditLog } from '../models/AuditLog';

/**
 * Sensitive fields that should not be logged
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
];

/**
 * Sanitize request body to remove sensitive fields
 */
const sanitizeBody = (body: any): any => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sanitized: any = Array.isArray(body) ? [] : {};

  for (const key of Object.keys(body)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof body[key] === 'object' && body[key] !== null) {
      sanitized[key] = sanitizeBody(body[key]);
    } else {
      sanitized[key] = body[key];
    }
  }

  return sanitized;
};

/**
 * Paths that should not be logged (health checks, static files, etc.)
 */
const EXCLUDED_PATHS = ['/health', '/api/health', '/favicon.ico', '/robots.txt', '/api-docs'];

/**
 * Log all API access for security monitoring and compliance
 */
export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  // Skip excluded paths
  if (EXCLUDED_PATHS.some((path) => req.path.startsWith(path))) {
    next();
    return;
  }

  // Skip OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    next();
    return;
  }

  // Capture original json method
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Flag to ensure we only log once
  let logged = false;

  const logRequest = (statusCode: number) => {
    if (logged) return;
    logged = true;

    const duration = Date.now() - startTime;

    // Log async (don't block response)
    setImmediate(() => {
      const storeId = req.storeId?.toString() || req.headers['x-store-id'] as string || 'unknown';
      const userId = req.userId || req.user?._id?.toString() || null;

      // Determine if we should log request body (only for write operations)
      let requestBody = null;
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
        requestBody = sanitizeBody(req.body);
      }

      AuditLog.create({
        storeId,
        userId,
        action: `${req.method} ${req.path}`,
        endpoint: req.path,
        method: req.method,
        ip: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'],
        statusCode,
        duration,
        requestBody,
        responseStatus: statusCode >= 400 ? 'error' : 'success',
        timestamp: new Date(),
      }).catch((err) => {
        console.error('Audit log error:', err);
      });
    });
  };

  // Override json method to capture response
  res.json = function (body: any) {
    logRequest(res.statusCode);
    return originalJson(body);
  };

  // Override send method for non-JSON responses
  res.send = function (body: any) {
    logRequest(res.statusCode);
    return originalSend(body);
  };

  // Handle cases where response ends without json/send
  res.on('finish', () => {
    logRequest(res.statusCode);
  });

  next();
};

export default auditLogger;
