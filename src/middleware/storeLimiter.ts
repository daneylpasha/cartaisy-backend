import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Helper to normalize IP addresses (handles IPv6 -> IPv4 mapping)
 */
const normalizeIp = (ip: string | undefined): string => {
  if (!ip) return 'unknown';
  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
};

/**
 * Rate limiting per store to prevent abuse
 * Limits: 1000 requests per 15 minutes per store+IP combination
 */
export const storeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window per store
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false },

  // Generate key based on storeId + IP
  keyGenerator: (req: Request): string => {
    const storeId = req.storeId?.toString() || req.headers['x-store-id'] as string || 'unknown';
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
    return `${storeId}:${ip}`;
  },

  // Custom handler for rate limit exceeded
  handler: (req: Request, res: Response) => {
    console.warn(`🚨 RATE LIMIT EXCEEDED`);
    console.warn(`  Store: ${req.storeId || req.headers['x-store-id']}`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Endpoint: ${req.path}`);
    console.warn(`  Method: ${req.method}`);

    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
    });
  },

  // Skip rate limiting for certain endpoints
  skip: (req: Request): boolean => {
    // Don't rate limit health check
    return req.path === '/health' || req.path === '/' || req.path.startsWith('/api-docs');
  },
});

/**
 * Stricter rate limiting for sensitive endpoints (auth, checkout)
 * Limits: 100 requests per 15 minutes
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Only 100 requests per 15 min
  validate: { xForwardedForHeader: false, ip: false },

  keyGenerator: (req: Request): string => {
    const storeId = req.storeId?.toString() || req.headers['x-store-id'] as string || 'unknown';
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
    return `strict:${storeId}:${ip}`;
  },

  handler: (req: Request, res: Response) => {
    console.warn(`🚨 STRICT RATE LIMIT EXCEEDED`);
    console.warn(`  Store: ${req.storeId || req.headers['x-store-id']}`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Endpoint: ${req.path}`);
    console.warn(`  Method: ${req.method}`);

    res.status(429).json({
      status: 'error',
      message: 'Rate limit exceeded for this action. Please try again later.',
      retryAfter: '15 minutes',
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Very strict rate limiting for login attempts
 * Limits: 10 attempts per 15 minutes per IP
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 login attempts per 15 min
  validate: { xForwardedForHeader: false, ip: false },

  keyGenerator: (req: Request): string => {
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
    return `login:${ip}`;
  },

  handler: (req: Request, res: Response) => {
    console.warn(`🚨 LOGIN RATE LIMIT EXCEEDED`);
    console.warn(`  IP: ${req.ip}`);
    console.warn(`  Endpoint: ${req.path}`);

    res.status(429).json({
      status: 'error',
      message: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes',
    });
  },

  standardHeaders: true,
  legacyHeaders: false,
});

export default storeLimiter;
