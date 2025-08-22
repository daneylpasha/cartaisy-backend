/**
 * Cartaisy Backend - Deployment Configuration Management
 * 
 * This module provides comprehensive configuration management for different
 * deployment environments with validation, security, and best practices.
 */

import { config } from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// Load environment variables based on NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = `.env.${NODE_ENV}`;

// Try to load environment-specific file first, then fallback to .env
if (fs.existsSync(envFile)) {
  config({ path: envFile });
} else {
  config();
}

// Environment validation schemas
const DatabaseConfigSchema = z.object({
  uri: z.string().url('MongoDB URI must be a valid URL'),
  maxPoolSize: z.number().min(1).max(100).default(50),
  minPoolSize: z.number().min(1).max(20).default(5),
  maxIdleTimeMS: z.number().positive().default(30000),
  serverSelectionTimeoutMS: z.number().positive().default(5000),
  retryWrites: z.boolean().default(true),
  authSource: z.string().default('admin'),
  ssl: z.boolean().default(true),
  debug: z.boolean().default(false)
});

const RedisConfigSchema = z.object({
  url: z.string().optional(),
  host: z.string().default('localhost'),
  port: z.number().min(1).max(65535).default(6379),
  password: z.string().optional(),
  db: z.number().min(0).max(15).default(0),
  maxRetries: z.number().min(1).max(10).default(3),
  retryDelayOnFailure: z.number().positive().default(100),
  connectTimeout: z.number().positive().default(10000),
  tls: z.boolean().default(false),
  enabled: z.boolean().default(false)
});

const JWTConfigSchema = z.object({
  secret: z.string().min(32, 'JWT secret must be at least 32 characters'),
  expiresIn: z.string().default('1h'),
  refreshExpiresIn: z.string().default('7d'),
  issuer: z.string().default('cartaisy-api'),
  audience: z.string().default('cartaisy-clients'),
  algorithm: z.enum(['HS256', 'HS384', 'HS512']).default('HS256')
});

const EmailConfigSchema = z.object({
  service: z.enum(['sendgrid', 'mailgun', 'smtp']).default('sendgrid'),
  apiKey: z.string().optional(),
  from: z.string().email().default('noreply@cartaisy.com'),
  fromName: z.string().default('Cartaisy'),
  sendRealEmails: z.boolean().default(true),
  templates: z.object({
    welcome: z.string().optional(),
    passwordReset: z.string().optional(),
    orderConfirmation: z.string().optional(),
    orderShipped: z.string().optional(),
    orderDelivered: z.string().optional()
  }).default({})
});

const ShopifyConfigSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  accessToken: z.string().optional(),
  storeUrl: z.string().optional(),
  webhookSecret: z.string().optional(),
  apiVersion: z.string().default('2023-10'),
  syncEnabled: z.boolean().default(false),
  syncInterval: z.number().positive().default(60),
  retryAttempts: z.number().min(1).max(10).default(3),
  timeout: z.number().positive().default(30000)
});

const SecurityConfigSchema = z.object({
  corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
  trustProxy: z.number().min(0).max(10).default(0),
  bcryptRounds: z.number().min(8).max(20).default(12),
  sessionSecret: z.string().min(32, 'Session secret must be at least 32 characters'),
  rateLimitWindowMs: z.number().positive().default(900000),
  rateLimitMaxRequests: z.number().positive().default(100),
  rateLimitEnabled: z.boolean().default(true),
  helmetEnabled: z.boolean().default(true),
  csrfEnabled: z.boolean().default(true)
});

const FileStorageConfigSchema = z.object({
  provider: z.enum(['local', 'aws-s3', 'cloudflare-r2']).default('local'),
  localPath: z.string().default('./uploads'),
  maxSize: z.number().positive().default(10485760), // 10MB
  allowedTypes: z.array(z.string()).default(['image/jpeg', 'image/png', 'image/webp']),
  aws: z.object({
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    region: z.string().default('us-east-1'),
    bucket: z.string().optional()
  }).default({}),
  cdnUrl: z.string().optional()
});

const MonitoringConfigSchema = z.object({
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  enableRequestLogging: z.boolean().default(false),
  enableErrorLogging: z.boolean().default(true),
  enablePerformanceLogging: z.boolean().default(false),
  sentryDsn: z.string().optional(),
  sentryEnvironment: z.string().default(NODE_ENV),
  sentryRelease: z.string().optional(),
  newRelicLicenseKey: z.string().optional(),
  enableHealthChecks: z.boolean().default(true),
  healthCheckInterval: z.number().positive().default(60000)
});

const PaymentConfigSchema = z.object({
  stripe: z.object({
    secretKey: z.string().optional(),
    publishableKey: z.string().optional(),
    webhookSecret: z.string().optional(),
    apiVersion: z.string().default('2023-10-16')
  }).default({}),
  paypal: z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    mode: z.enum(['sandbox', 'live']).default('sandbox')
  }).default({})
});

const BackgroundJobsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['memory', 'redis', 'bull']).default('memory'),
  concurrency: z.number().min(1).max(20).default(5),
  maxAttempts: z.number().min(1).max(10).default(3),
  retryDelay: z.number().positive().default(5000),
  timeout: z.number().positive().default(300000)
});

const FeatureFlagsSchema = z.object({
  userRegistration: z.boolean().default(true),
  guestCheckout: z.boolean().default(true),
  productReviews: z.boolean().default(true),
  wishlist: z.boolean().default(true),
  multiCurrency: z.boolean().default(false),
  inventoryTracking: z.boolean().default(true),
  orderNotifications: z.boolean().default(true),
  analyticsEnabled: z.boolean().default(false),
  pushNotifications: z.boolean().default(false),
  adminDebugMode: z.boolean().default(false)
});

// Main configuration schema
const ConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  app: z.object({
    name: z.string().default('Cartaisy Backend'),
    version: z.string().default('1.0.0'),
    port: z.number().min(1000).max(65535).default(3000),
    baseUrl: z.string().url(),
    frontendUrl: z.string().url().optional()
  }),
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  jwt: JWTConfigSchema,
  email: EmailConfigSchema,
  shopify: ShopifyConfigSchema,
  security: SecurityConfigSchema,
  fileStorage: FileStorageConfigSchema,
  monitoring: MonitoringConfigSchema,
  payments: PaymentConfigSchema,
  backgroundJobs: BackgroundJobsConfigSchema,
  features: FeatureFlagsSchema
});

// Type inference from schema
export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Configuration factory that creates validated configuration objects
 */
class ConfigurationManager {
  private config: AppConfig | null = null;
  private validationErrors: string[] = [];

  /**
   * Load and validate configuration from environment variables
   */
  public loadConfiguration(): AppConfig {
    if (this.config) {
      return this.config;
    }

    try {
      const rawConfig = this.buildRawConfig();
      const result = ConfigSchema.safeParse(rawConfig);

      if (!result.success) {
        this.validationErrors = result.error.errors.map(
          err => `${err.path.join('.')}: ${err.message}`
        );
        throw new Error(`Configuration validation failed:\n${this.validationErrors.join('\n')}`);
      }

      this.config = result.data;
      this.validateEnvironmentSpecificRequirements();
      
      return this.config;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Get configuration with runtime validation
   */
  public getConfig(): AppConfig {
    if (!this.config) {
      return this.loadConfiguration();
    }
    return this.config;
  }

  /**
   * Validate that required secrets are present for production
   */
  private validateEnvironmentSpecificRequirements(): void {
    if (!this.config) return;

    const env = this.config.environment;
    const errors: string[] = [];

    if (env === 'production') {
      // Production-specific validations
      if (this.config.jwt.secret.length < 64) {
        errors.push('Production JWT secret must be at least 64 characters');
      }

      if (!this.config.security.corsOrigins.every(origin => origin.startsWith('https://'))) {
        errors.push('Production CORS origins must use HTTPS');
      }

      if (this.config.monitoring.logLevel === 'debug') {
        errors.push('Production should not use debug log level');
      }

      if (this.config.features.adminDebugMode) {
        errors.push('Admin debug mode must be disabled in production');
      }

      if (this.config.database.debug) {
        errors.push('Database debug mode must be disabled in production');
      }
    }

    if (env === 'staging') {
      // Staging-specific validations
      if (this.config.email.sendRealEmails && !this.config.email.apiKey) {
        errors.push('Staging environment with real emails requires email API key');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Build raw configuration object from environment variables
   */
  private buildRawConfig(): any {
    return {
      environment: NODE_ENV,
      app: {
        name: process.env.APP_NAME || 'Cartaisy Backend',
        version: process.env.APP_VERSION || '1.0.0',
        port: this.parseNumber(process.env.PORT, 3000),
        baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        frontendUrl: process.env.FRONTEND_URL
      },
      database: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy_development',
        maxPoolSize: this.parseNumber(process.env.MONGODB_MAX_POOL_SIZE, 50),
        minPoolSize: this.parseNumber(process.env.MONGODB_MIN_POOL_SIZE, 5),
        maxIdleTimeMS: this.parseNumber(process.env.MONGODB_MAX_IDLE_TIME_MS, 30000),
        serverSelectionTimeoutMS: this.parseNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 5000),
        retryWrites: this.parseBoolean(process.env.MONGODB_RETRY_WRITES, true),
        authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
        ssl: this.parseBoolean(process.env.MONGODB_SSL, NODE_ENV === 'production'),
        debug: this.parseBoolean(process.env.MONGODB_DEBUG, false)
      },
      redis: {
        url: process.env.REDIS_URL,
        host: process.env.REDIS_HOST || 'localhost',
        port: this.parseNumber(process.env.REDIS_PORT, 6379),
        password: process.env.REDIS_PASSWORD,
        db: this.parseNumber(process.env.REDIS_DB, 0),
        maxRetries: this.parseNumber(process.env.REDIS_MAX_RETRIES, 3),
        retryDelayOnFailure: this.parseNumber(process.env.REDIS_RETRY_DELAY_ON_FAILURE, 100),
        connectTimeout: this.parseNumber(process.env.REDIS_CONNECT_TIMEOUT, 10000),
        tls: this.parseBoolean(process.env.REDIS_TLS, false),
        enabled: this.parseBoolean(process.env.ENABLE_REDIS_CACHE, false)
      },
      jwt: {
        secret: process.env.JWT_SECRET || 'development-secret-please-change',
        expiresIn: process.env.JWT_EXPIRES_IN || '1h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        issuer: process.env.JWT_ISSUER || 'cartaisy-api',
        audience: process.env.JWT_AUDIENCE || 'cartaisy-clients',
        algorithm: process.env.JWT_ALGORITHM || 'HS256'
      },
      email: {
        service: process.env.EMAIL_SERVICE || 'sendgrid',
        apiKey: process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY,
        from: process.env.EMAIL_FROM || 'noreply@cartaisy.com',
        fromName: process.env.EMAIL_FROM_NAME || 'Cartaisy',
        sendRealEmails: this.parseBoolean(process.env.EMAIL_SEND_REAL_EMAILS, NODE_ENV !== 'development'),
        templates: {
          welcome: process.env.EMAIL_TEMPLATE_WELCOME || process.env.SENDGRID_TEMPLATE_WELCOME,
          passwordReset: process.env.EMAIL_TEMPLATE_PASSWORD_RESET || process.env.SENDGRID_TEMPLATE_PASSWORD_RESET,
          orderConfirmation: process.env.EMAIL_TEMPLATE_ORDER_CONFIRMATION || process.env.SENDGRID_TEMPLATE_ORDER_CONFIRMATION,
          orderShipped: process.env.EMAIL_TEMPLATE_ORDER_SHIPPED,
          orderDelivered: process.env.EMAIL_TEMPLATE_ORDER_DELIVERED
        }
      },
      shopify: {
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecret: process.env.SHOPIFY_API_SECRET,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
        storeUrl: process.env.SHOPIFY_STORE_URL,
        webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
        apiVersion: process.env.SHOPIFY_API_VERSION || '2023-10',
        syncEnabled: this.parseBoolean(process.env.ENABLE_SHOPIFY_SYNC, false),
        syncInterval: this.parseNumber(process.env.SHOPIFY_SYNC_INTERVAL, 60),
        retryAttempts: this.parseNumber(process.env.SHOPIFY_RETRY_ATTEMPTS, 3),
        timeout: this.parseNumber(process.env.SHOPIFY_TIMEOUT, 30000)
      },
      security: {
        corsOrigins: this.parseStringArray(process.env.CORS_ORIGINS, ['http://localhost:3000']),
        trustProxy: this.parseNumber(process.env.RATE_LIMIT_TRUST_PROXY, 0),
        bcryptRounds: this.parseNumber(process.env.BCRYPT_ROUNDS, NODE_ENV === 'production' ? 12 : 10),
        sessionSecret: process.env.SESSION_SECRET || 'development-session-secret',
        rateLimitWindowMs: this.parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 900000),
        rateLimitMaxRequests: this.parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
        rateLimitEnabled: this.parseBoolean(process.env.RATE_LIMIT_ENABLED, true),
        helmetEnabled: this.parseBoolean(process.env.ENABLE_SECURITY_HEADERS, true),
        csrfEnabled: this.parseBoolean(process.env.ENABLE_CSRF_PROTECTION, NODE_ENV !== 'development')
      },
      fileStorage: {
        provider: process.env.FILE_STORAGE_PROVIDER || 'local',
        localPath: process.env.FILE_STORAGE_PATH || './uploads',
        maxSize: this.parseNumber(process.env.FILE_STORAGE_MAX_SIZE, 10485760),
        allowedTypes: this.parseStringArray(process.env.FILE_ALLOWED_TYPES, ['image/jpeg', 'image/png', 'image/webp']),
        aws: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1',
          bucket: process.env.AWS_S3_BUCKET
        },
        cdnUrl: process.env.CDN_URL
      },
      monitoring: {
        logLevel: process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'warn' : 'info'),
        enableRequestLogging: this.parseBoolean(process.env.ENABLE_REQUEST_LOGGING, NODE_ENV !== 'production'),
        enableErrorLogging: this.parseBoolean(process.env.ENABLE_ERROR_LOGGING, true),
        enablePerformanceLogging: this.parseBoolean(process.env.ENABLE_PERFORMANCE_LOGGING, false),
        sentryDsn: process.env.SENTRY_DSN,
        sentryEnvironment: process.env.SENTRY_ENVIRONMENT || NODE_ENV,
        sentryRelease: process.env.SENTRY_RELEASE,
        newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY,
        enableHealthChecks: this.parseBoolean(process.env.ENABLE_HEALTH_CHECKS, true),
        healthCheckInterval: this.parseNumber(process.env.HEALTH_CHECK_INTERVAL, 60000)
      },
      payments: {
        stripe: {
          secretKey: process.env.STRIPE_SECRET_KEY,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
          webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16'
        },
        paypal: {
          clientId: process.env.PAYPAL_CLIENT_ID,
          clientSecret: process.env.PAYPAL_CLIENT_SECRET,
          mode: process.env.PAYPAL_MODE || 'sandbox'
        }
      },
      backgroundJobs: {
        enabled: this.parseBoolean(process.env.ENABLE_BACKGROUND_JOBS, true),
        provider: process.env.JOB_QUEUE_PROVIDER || 'memory',
        concurrency: this.parseNumber(process.env.JOB_CONCURRENCY, 5),
        maxAttempts: this.parseNumber(process.env.JOB_MAX_ATTEMPTS, 3),
        retryDelay: this.parseNumber(process.env.JOB_RETRY_DELAY, 5000),
        timeout: this.parseNumber(process.env.JOB_TIMEOUT, 300000)
      },
      features: {
        userRegistration: this.parseBoolean(process.env.ENABLE_USER_REGISTRATION, true),
        guestCheckout: this.parseBoolean(process.env.ENABLE_GUEST_CHECKOUT, true),
        productReviews: this.parseBoolean(process.env.ENABLE_PRODUCT_REVIEWS, true),
        wishlist: this.parseBoolean(process.env.ENABLE_WISHLIST, true),
        multiCurrency: this.parseBoolean(process.env.ENABLE_MULTI_CURRENCY, false),
        inventoryTracking: this.parseBoolean(process.env.ENABLE_INVENTORY_TRACKING, true),
        orderNotifications: this.parseBoolean(process.env.ENABLE_ORDER_NOTIFICATIONS, true),
        analyticsEnabled: this.parseBoolean(process.env.ENABLE_ANALYTICS, false),
        pushNotifications: this.parseBoolean(process.env.ENABLE_PUSH_NOTIFICATIONS, false),
        adminDebugMode: this.parseBoolean(process.env.ENABLE_ADMIN_DEBUG_MODE, false)
      }
    };
  }

  /**
   * Helper method to parse numbers with fallback
   */
  private parseNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  /**
   * Helper method to parse booleans with fallback
   */
  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) return fallback;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Helper method to parse string arrays from comma-separated values
   */
  private parseStringArray(value: string | undefined, fallback: string[]): string[] {
    if (!value) return fallback;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  /**
   * Get validation errors if any occurred during configuration loading
   */
  public getValidationErrors(): string[] {
    return this.validationErrors;
  }

  /**
   * Check if a feature is enabled
   */
  public isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
    const config = this.getConfig();
    return config.features[feature];
  }

  /**
   * Get database connection options for Mongoose
   */
  public getDatabaseOptions(): any {
    const config = this.getConfig();
    const db = config.database;

    return {
      maxPoolSize: db.maxPoolSize,
      minPoolSize: db.minPoolSize,
      maxIdleTimeMS: db.maxIdleTimeMS,
      serverSelectionTimeoutMS: db.serverSelectionTimeoutMS,
      bufferMaxEntries: 0,
      bufferCommands: false,
      authSource: db.authSource,
      retryWrites: db.retryWrites,
      ssl: db.ssl
    };
  }

  /**
   * Get Redis connection options
   */
  public getRedisOptions(): any {
    const config = this.getConfig();
    const redis = config.redis;

    if (redis.url) {
      return {
        url: redis.url,
        retryDelayOnFailure: redis.retryDelayOnFailure,
        maxRetriesPerRequest: redis.maxRetries,
        connectTimeout: redis.connectTimeout,
        ...(redis.tls && { tls: {} })
      };
    }

    return {
      host: redis.host,
      port: redis.port,
      password: redis.password,
      db: redis.db,
      retryDelayOnFailure: redis.retryDelayOnFailure,
      maxRetriesPerRequest: redis.maxRetries,
      connectTimeout: redis.connectTimeout,
      ...(redis.tls && { tls: {} })
    };
  }

  /**
   * Print configuration summary (safe for logging)
   */
  public printConfigSummary(): void {
    const config = this.getConfig();
    
    console.log('\n🔧 Configuration Summary:');
    console.log('==========================');
    console.log(`Environment: ${config.environment}`);
    console.log(`App Name: ${config.app.name} v${config.app.version}`);
    console.log(`Port: ${config.app.port}`);
    console.log(`Base URL: ${config.app.baseUrl}`);
    console.log(`Database: ${config.database.uri.replace(/\/\/.*@/, '//*****@')}`);
    console.log(`Redis: ${config.redis.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`Shopify Sync: ${config.shopify.syncEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`Email Service: ${config.email.service}`);
    console.log(`Log Level: ${config.monitoring.logLevel}`);
    console.log(`Background Jobs: ${config.backgroundJobs.enabled ? 'Enabled' : 'Disabled'}`);
    console.log('==========================\n');
  }
}

// Export singleton instance
export const configManager = new ConfigurationManager();

// Export the configuration object
export const config = configManager.getConfig();

// Export types
export { AppConfig };

// Export specific config sections for convenience
export const {
  app: appConfig,
  database: databaseConfig,
  redis: redisConfig,
  jwt: jwtConfig,
  email: emailConfig,
  shopify: shopifyConfig,
  security: securityConfig,
  fileStorage: fileStorageConfig,
  monitoring: monitoringConfig,
  payments: paymentsConfig,
  backgroundJobs: backgroundJobsConfig,
  features: featureFlags
} = config;