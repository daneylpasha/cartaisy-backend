/**
 * Security Configuration
 *
 * Centralized security settings for the application.
 */

export const securityConfig = {
  // Rate limiting configuration
  rateLimit: {
    // General API rate limit
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),

    // Strict rate limit (for sensitive endpoints)
    strictWindowMs: parseInt(process.env.STRICT_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    strictMaxRequests: parseInt(process.env.STRICT_RATE_LIMIT_MAX_REQUESTS || '100', 10),

    // Login rate limit (for authentication endpoints)
    loginWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    loginMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS || '10', 10),
  },

  // Helmet security headers configuration
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    crossOriginEmbedderPolicy: false, // Required for mobile apps
    crossOriginResourcePolicy: { policy: 'cross-origin' as const },
  },

  // Audit log configuration
  auditLog: {
    // Retention period in days
    retentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10),
    // Retention in seconds (for MongoDB TTL index)
    retentionSeconds: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10) * 24 * 60 * 60,

    // Paths to exclude from logging
    excludedPaths: ['/health', '/api/health', '/favicon.ico', '/robots.txt', '/api-docs'],

    // Methods to log request body for
    logBodyMethods: ['POST', 'PUT', 'PATCH'],

    // Sensitive fields to redact from logs
    sensitiveFields: [
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
    ],
  },

  // CORS configuration
  cors: {
    // Allowed origins (comma-separated in env)
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Store-ID', 'X-Request-ID'],
  },

  // NoSQL injection protection
  mongoSanitize: {
    // Character to replace $ and . with
    replaceWith: '_',

    // Suspicious patterns to detect
    suspiciousPatterns: [
      '$where',
      '$regex',
      '$ne',
      '$gt',
      '$lt',
      '$or',
      '$and',
      '$nin',
      '$in',
      '$exists',
    ],
  },

  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
};

export default securityConfig;
