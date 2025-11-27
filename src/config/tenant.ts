import dotenv from 'dotenv';

// Load environment variables - override existing env vars with .env file values
dotenv.config({ override: true });

/**
 * Converts string environment variable to boolean
 * @param value - Environment variable value
 * @param defaultValue - Default boolean value
 * @returns Boolean value
 */
const toBool = (value: string | undefined, defaultValue: boolean = false): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

/**
 * Converts string environment variable to number
 * @param value - Environment variable value
 * @param defaultValue - Default number value
 * @returns Number value
 */
const toNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Converts string environment variable to float
 * @param value - Environment variable value
 * @param defaultValue - Default float value
 * @returns Float value
 */
const toFloat = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Comprehensive tenant configuration object
 * All settings are configurable through environment variables
 */
export const tenantConfig = {
  // ============ STORE INFORMATION ============
  store: {
    name: process.env.STORE_NAME || 'Cartaisy Store',
    domain: process.env.STORE_DOMAIN || 'example.myshopify.com',
    logoUrl: process.env.STORE_LOGO_URL || 'https://via.placeholder.com/200x80',
    primaryColor: process.env.STORE_PRIMARY_COLOR || '#4CAF50',
    currency: process.env.STORE_CURRENCY || 'USD',
    timezone: process.env.STORE_TIMEZONE || 'America/New_York',
    country: process.env.STORE_COUNTRY || 'US',
    description: process.env.STORE_DESCRIPTION || 'Your premier shopping destination'
  },

  // ============ API CONFIGURATION ============
  api: {
    baseUrl: process.env.API_BASE_URL || (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : 'http://localhost:3000'),
    version: process.env.API_VERSION || 'v1',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    adminEmail: process.env.ADMIN_EMAIL || 'admin@cartaisy.com',
    port: toNumber(process.env.PORT, 3000),
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // ============ SHOPIFY INTEGRATION ============
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL || '',
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN || '',
    storefrontAccessToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || '',
    scopes: process.env.SHOPIFY_SCOPES || 'read_products,read_orders,read_customers,write_products,write_orders,write_inventory',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
    webhookUrl: process.env.SHOPIFY_WEBHOOK_URL || '',
    enableSync: toBool(process.env.SHOPIFY_ENABLE_SYNC, true),
    syncInterval: toNumber(process.env.SHOPIFY_SYNC_INTERVAL, 4), // hours
    maxRetries: toNumber(process.env.SHOPIFY_MAX_RETRIES, 3),
    rateLimitDelay: toNumber(process.env.SHOPIFY_RATE_LIMIT_DELAY, 1000) // ms
  },

  // ============ EMAIL CONFIGURATION ============
  email: {
    fromName: process.env.EMAIL_FROM_NAME || 'Cartaisy Team',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@cartaisy.com',
    replyTo: process.env.EMAIL_REPLY_TO || 'support@cartaisy.com',
    serviceType: process.env.EMAIL_SERVICE_TYPE || 'smtp',
    serviceApiKey: process.env.EMAIL_SERVICE_API_KEY || '',
    smtp: {
      host: process.env.EMAIL_SMTP_HOST || 'smtp.ethereal.email',
      port: toNumber(process.env.EMAIL_SMTP_PORT, 587),
      user: process.env.EMAIL_SMTP_USER || '',
      pass: process.env.EMAIL_SMTP_PASS || '',
      secure: toBool(process.env.EMAIL_SMTP_SECURE, false)
    }
  },

  // ============ APP CUSTOMIZATION ============
  app: {
    name: process.env.APP_NAME || 'Cartaisy',
    bundleId: process.env.APP_BUNDLE_ID || 'com.cartaisy.app',
    deepLinkScheme: process.env.APP_DEEP_LINK_SCHEME || 'cartaisy',
    version: process.env.APP_VERSION || '1.0.0',
    pushNotificationKey: process.env.PUSH_NOTIFICATION_KEY || '',
    analyticsTrackingId: process.env.ANALYTICS_TRACKING_ID || '',
    enablePushNotifications: toBool(process.env.ENABLE_PUSH_NOTIFICATIONS, true)
  },

  // ============ SECURITY & FEATURES ============
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-replace-with-random-string-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    rateLimitWindowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000), // 15 minutes
    rateLimitMaxRequests: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    enableSocialLogin: toBool(process.env.ENABLE_SOCIAL_LOGIN, false),
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    facebookAppId: process.env.FACEBOOK_APP_ID || '',
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET || '',
    enableTwoFactor: toBool(process.env.ENABLE_TWO_FACTOR, false),
    passwordMinLength: toNumber(process.env.PASSWORD_MIN_LENGTH, 6),
    sessionTimeout: toNumber(process.env.SESSION_TIMEOUT, 24 * 60 * 60 * 1000) // 24 hours
  },

  // ============ SMS & NOTIFICATIONS ============
  sms: {
    enableSmsNotifications: toBool(process.env.ENABLE_SMS_NOTIFICATIONS, false),
    serviceProvider: process.env.SMS_SERVICE_PROVIDER || 'twilio',
    serviceApiKey: process.env.SMS_SERVICE_API_KEY || '',
    serviceApiSecret: process.env.SMS_SERVICE_API_SECRET || '',
    fromNumber: process.env.SMS_FROM_NUMBER || ''
  },

  // ============ BUSINESS SETTINGS ============
  business: {
    enableLoyaltyProgram: toBool(process.env.ENABLE_LOYALTY_PROGRAM, false),
    loyaltyPointsRatio: toFloat(process.env.LOYALTY_POINTS_RATIO, 1.0), // 1 point per $1
    defaultShippingRate: toFloat(process.env.DEFAULT_SHIPPING_RATE, 5.99),
    freeShippingThreshold: toFloat(process.env.FREE_SHIPPING_THRESHOLD, 50.00),
    taxRate: toFloat(process.env.TAX_RATE, 0.08), // 8%
    minimumOrderValue: toFloat(process.env.MINIMUM_ORDER_VALUE, 10.00),
    currencySymbol: process.env.CURRENCY_SYMBOL || '$',
    enableReviews: toBool(process.env.ENABLE_REVIEWS, true),
    enableWishlist: toBool(process.env.ENABLE_WISHLIST, true),
    enableGuestCheckout: toBool(process.env.ENABLE_GUEST_CHECKOUT, true)
  },

  // ============ DATABASE CONFIGURATION ============
  database: {
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy',
    connectionTimeout: toNumber(process.env.DB_CONNECTION_TIMEOUT, 30000),
    maxPoolSize: toNumber(process.env.DB_MAX_POOL_SIZE, 10),
    minPoolSize: toNumber(process.env.DB_MIN_POOL_SIZE, 1)
  },

  // ============ REDIS CONFIGURATION (for sessions/caching) ============
  redis: {
    enabled: toBool(process.env.REDIS_ENABLED, false),
    host: process.env.REDIS_HOST || 'localhost',
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || '',
    database: toNumber(process.env.REDIS_DATABASE, 0),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'cartaisy:'
  },

  // ============ FILE STORAGE ============
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // local, aws, gcp, azure
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    maxFileSize: toNumber(process.env.MAX_FILE_SIZE, 10 * 1024 * 1024), // 10MB
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES || 'jpg,jpeg,png,gif,pdf',
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET || ''
    }
  },

  // ============ PAYMENT PROCESSING ============
  payments: {
    defaultProvider: process.env.PAYMENT_DEFAULT_PROVIDER || 'stripe',
    enableMultipleProviders: toBool(process.env.ENABLE_MULTIPLE_PAYMENT_PROVIDERS, false),
    stripe: {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      sandbox: toBool(process.env.PAYPAL_SANDBOX, true)
    }
  },

  // ============ ANALYTICS & MONITORING ============
  analytics: {
    enableAnalytics: toBool(process.env.ENABLE_ANALYTICS, true),
    googleAnalyticsId: process.env.GOOGLE_ANALYTICS_ID || '',
    facebookPixelId: process.env.FACEBOOK_PIXEL_ID || '',
    hotjarId: process.env.HOTJAR_ID || '',
    enableErrorTracking: toBool(process.env.ENABLE_ERROR_TRACKING, true),
    sentryDsn: process.env.SENTRY_DSN || ''
  },

  // ============ FEATURE FLAGS ============
  features: {
    enableBlog: toBool(process.env.ENABLE_BLOG, false),
    enableChat: toBool(process.env.ENABLE_CHAT, false),
    enableSubscriptions: toBool(process.env.ENABLE_SUBSCRIPTIONS, false),
    enableAffiliates: toBool(process.env.ENABLE_AFFILIATES, false),
    enableMultiLanguage: toBool(process.env.ENABLE_MULTI_LANGUAGE, false),
    enableAdvancedSearch: toBool(process.env.ENABLE_ADVANCED_SEARCH, false),
    enableInventoryTracking: toBool(process.env.ENABLE_INVENTORY_TRACKING, true),
    enableBackorders: toBool(process.env.ENABLE_BACKORDERS, false),
    enableShopifySync: toBool(process.env.ENABLE_SHOPIFY_SYNC, true),
    enableProductEnhancement: toBool(process.env.ENABLE_PRODUCT_ENHANCEMENT, true),
    enableBackgroundJobs: toBool(process.env.ENABLE_BACKGROUND_JOBS, true)
  },

  // ============ BACKGROUND JOBS ============
  jobs: {
    enableScheduledSync: toBool(process.env.ENABLE_SCHEDULED_SYNC, true),
    fullSyncCron: process.env.FULL_SYNC_CRON || '0 2 * * *', // Daily at 2 AM
    incrementalSyncCron: process.env.INCREMENTAL_SYNC_CRON || '0 */4 * * *', // Every 4 hours
    inventorySyncCron: process.env.INVENTORY_SYNC_CRON || '*/30 * * * *', // Every 30 minutes
    orderProcessingCron: process.env.ORDER_PROCESSING_CRON || '*/15 * * * *', // Every 15 minutes
    analyticsUpdateCron: process.env.ANALYTICS_UPDATE_CRON || '0 * * * *', // Hourly
    lowStockAlertsCron: process.env.LOW_STOCK_ALERTS_CRON || '0 8 * * *', // Daily at 8 AM
    dataCleanupCron: process.env.DATA_CLEANUP_CRON || '0 3 * * 0', // Weekly on Sunday at 3 AM
    healthCheckCron: process.env.HEALTH_CHECK_CRON || '*/5 * * * *' // Every 5 minutes
  }
};

// ============ DERIVED CONFIGURATIONS ============
export const derivedConfig = {
  // Full store URL with protocol
  storeUrl: `https://${tenantConfig.store.domain}`,
  
  // API endpoints
  apiUrl: `${tenantConfig.api.baseUrl}/api/${tenantConfig.api.version}`,
  
  // Email signature
  emailSignature: `${tenantConfig.store.name} Team`,
  
  // Currency formatting
  formatCurrency: (amount: number): string => {
    return `${tenantConfig.business.currencySymbol}${amount.toFixed(2)}`;
  },
  
  // Deep link URL builder
  buildDeepLink: (path: string): string => {
    return `${tenantConfig.app.deepLinkScheme}://${path}`;
  },
  
  // Is production environment
  isProduction: tenantConfig.api.nodeEnv === 'production',
  
  // Is development environment
  isDevelopment: tenantConfig.api.nodeEnv === 'development'
};

// Export individual config sections for easier imports
export const storeConfig = tenantConfig.store;
export const apiConfig = tenantConfig.api;
export const shopifyConfig = tenantConfig.shopify;
export const emailConfig = tenantConfig.email;
export const appConfig = tenantConfig.app;
export const securityConfig = tenantConfig.security;
export const businessConfig = tenantConfig.business;
export const databaseConfig = tenantConfig.database;

// Export default
export default tenantConfig;