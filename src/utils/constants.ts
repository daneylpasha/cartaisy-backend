import { tenantConfig, derivedConfig } from '../config/tenant';

/**
 * Commonly used tenant values
 * These constants are derived from the tenant configuration
 * and provide easy access to frequently used values
 */

// ============ COMPANY INFORMATION ============
export const COMPANY_NAME = tenantConfig.store.name;
export const SUPPORT_EMAIL = tenantConfig.email.replyTo;
export const ADMIN_EMAIL = tenantConfig.api.adminEmail;
export const STORE_URL = derivedConfig.storeUrl;

// ============ CURRENCY & FORMATTING ============
export const DEFAULT_CURRENCY = tenantConfig.store.currency;
export const CURRENCY_SYMBOL = tenantConfig.business.currencySymbol;
export const formatCurrency = derivedConfig.formatCurrency;

// ============ APP INFORMATION ============
export const APP_NAME = tenantConfig.app.name;
export const APP_VERSION = tenantConfig.app.version;
export const DEEP_LINK_SCHEME = tenantConfig.app.deepLinkScheme;

// ============ BUSINESS RULES ============
export const MINIMUM_ORDER_VALUE = tenantConfig.business.minimumOrderValue;
export const DEFAULT_SHIPPING_RATE = tenantConfig.business.defaultShippingRate;
export const FREE_SHIPPING_THRESHOLD = tenantConfig.business.freeShippingThreshold;
export const TAX_RATE = tenantConfig.business.taxRate;

// ============ ENVIRONMENT ============
export const IS_PRODUCTION = derivedConfig.isProduction;
export const IS_DEVELOPMENT = derivedConfig.isDevelopment;
export const NODE_ENV = tenantConfig.api.nodeEnv;

// ============ API INFORMATION ============
export const API_VERSION = tenantConfig.api.version;
export const API_BASE_URL = tenantConfig.api.baseUrl;
export const FRONTEND_URL = tenantConfig.api.frontendUrl;

// ============ EMAIL CONSTANTS ============
export const EMAIL_FROM = {
  name: tenantConfig.email.fromName,
  address: tenantConfig.email.fromAddress
};

export const EMAIL_SIGNATURE = derivedConfig.emailSignature;

// ============ FEATURE FLAGS ============
export const FEATURES = {
  LOYALTY_PROGRAM: tenantConfig.business.enableLoyaltyProgram,
  REVIEWS: tenantConfig.business.enableReviews,
  WISHLIST: tenantConfig.business.enableWishlist,
  GUEST_CHECKOUT: tenantConfig.business.enableGuestCheckout,
  SMS_NOTIFICATIONS: tenantConfig.sms.enableSmsNotifications,
  SOCIAL_LOGIN: tenantConfig.security.enableSocialLogin,
  TWO_FACTOR: tenantConfig.security.enableTwoFactor,
  PUSH_NOTIFICATIONS: tenantConfig.app.enablePushNotifications,
  BLOG: tenantConfig.features.enableBlog,
  CHAT: tenantConfig.features.enableChat,
  SUBSCRIPTIONS: tenantConfig.features.enableSubscriptions,
  AFFILIATES: tenantConfig.features.enableAffiliates,
  MULTI_LANGUAGE: tenantConfig.features.enableMultiLanguage,
  ADVANCED_SEARCH: tenantConfig.features.enableAdvancedSearch,
  INVENTORY_TRACKING: tenantConfig.features.enableInventoryTracking,
  BACKORDERS: tenantConfig.features.enableBackorders
};

// ============ SECURITY CONSTANTS ============
export const PASSWORD_MIN_LENGTH = tenantConfig.security.passwordMinLength;
export const JWT_EXPIRES_IN = tenantConfig.security.jwtExpiresIn;
export const SESSION_TIMEOUT = tenantConfig.security.sessionTimeout;

// ============ RATE LIMITING ============
export const RATE_LIMIT = {
  WINDOW_MS: tenantConfig.security.rateLimitWindowMs,
  MAX_REQUESTS: tenantConfig.security.rateLimitMaxRequests
};

// ============ FILE UPLOAD LIMITS ============
export const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: tenantConfig.storage.maxFileSize,
  ALLOWED_TYPES: tenantConfig.storage.allowedFileTypes.split(','),
  UPLOAD_PATH: tenantConfig.storage.uploadPath
};

// ============ SHOPIFY CONSTANTS ============
export const SHOPIFY = {
  STORE_URL: tenantConfig.shopify.storeUrl,
  API_VERSION: tenantConfig.shopify.apiVersion,
  SCOPES: tenantConfig.shopify.scopes.split(',')
};

// ============ PAGINATION DEFAULTS ============
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100
};

// ============ ERROR MESSAGES ============
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation failed',
  SERVER_ERROR: 'Internal server error',
  RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_DISABLED: 'Your account has been deactivated',
  ORDER_MINIMUM_NOT_MET: `Minimum order value is ${formatCurrency(MINIMUM_ORDER_VALUE)}`
};

// ============ SUCCESS MESSAGES ============
export const SUCCESS_MESSAGES = {
  REGISTRATION_SUCCESS: 'Registration successful',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  PASSWORD_RESET_REQUEST: 'Password reset email sent',
  PASSWORD_RESET_SUCCESS: 'Password reset successful',
  PROFILE_UPDATED: 'Profile updated successfully',
  EMAIL_VERIFIED: 'Email verified successfully',
  ORDER_PLACED: 'Order placed successfully',
  PAYMENT_SUCCESS: 'Payment processed successfully'
};

// ============ NOTIFICATION TYPES ============
export const NOTIFICATION_TYPES = {
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_SHIPPED: 'order_shipped',
  ORDER_DELIVERED: 'order_delivered',
  PAYMENT_RECEIVED: 'payment_received',
  ACCOUNT_CREATED: 'account_created',
  PASSWORD_RESET: 'password_reset',
  PROMOTIONAL: 'promotional',
  REMINDER: 'reminder'
};

// ============ ORDER STATUSES ============
export const ORDER_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

// ============ PAYMENT STATUSES ============
export const PAYMENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

// ============ USER ROLES ============
export const USER_ROLES = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

// ============ REGEX PATTERNS ============
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/,
  URL: /^https?:\/\/.+/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
};

// ============ HTTP STATUS CODES ============
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// ============ UTILITY FUNCTIONS ============

/**
 * Build deep link URL for mobile app
 * @param path - Path to navigate to in the app
 * @returns Deep link URL
 */
export const buildDeepLink = (path: string): string => {
  return derivedConfig.buildDeepLink(path);
};

/**
 * Get full API endpoint URL
 * @param endpoint - API endpoint path
 * @returns Full URL to the endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = derivedConfig.apiUrl;
  return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
};

/**
 * Check if a feature is enabled
 * @param featureName - Name of the feature to check
 * @returns Boolean indicating if feature is enabled
 */
export const isFeatureEnabled = (featureName: keyof typeof FEATURES): boolean => {
  return FEATURES[featureName];
};

/**
 * Get store branding information
 * @returns Store branding object
 */
export const getStoreBranding = () => ({
  name: COMPANY_NAME,
  logo: tenantConfig.store.logoUrl,
  primaryColor: tenantConfig.store.primaryColor,
  currency: DEFAULT_CURRENCY,
  currencySymbol: CURRENCY_SYMBOL
});

export default {
  COMPANY_NAME,
  SUPPORT_EMAIL,
  DEFAULT_CURRENCY,
  APP_NAME,
  FEATURES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  buildDeepLink,
  getApiUrl,
  isFeatureEnabled,
  getStoreBranding
};