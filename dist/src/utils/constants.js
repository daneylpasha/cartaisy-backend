"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreBranding = exports.isFeatureEnabled = exports.getApiUrl = exports.buildDeepLink = exports.HTTP_STATUS = exports.REGEX_PATTERNS = exports.USER_ROLES = exports.PAYMENT_STATUSES = exports.ORDER_STATUSES = exports.NOTIFICATION_TYPES = exports.SUCCESS_MESSAGES = exports.ERROR_MESSAGES = exports.PAGINATION = exports.SHOPIFY = exports.UPLOAD_LIMITS = exports.RATE_LIMIT = exports.SESSION_TIMEOUT = exports.JWT_EXPIRES_IN = exports.PASSWORD_MIN_LENGTH = exports.FEATURES = exports.EMAIL_SIGNATURE = exports.EMAIL_FROM = exports.FRONTEND_URL = exports.API_BASE_URL = exports.API_VERSION = exports.NODE_ENV = exports.IS_DEVELOPMENT = exports.IS_PRODUCTION = exports.TAX_RATE = exports.FREE_SHIPPING_THRESHOLD = exports.DEFAULT_SHIPPING_RATE = exports.MINIMUM_ORDER_VALUE = exports.DEEP_LINK_SCHEME = exports.APP_VERSION = exports.APP_NAME = exports.formatCurrency = exports.CURRENCY_SYMBOL = exports.DEFAULT_CURRENCY = exports.STORE_URL = exports.ADMIN_EMAIL = exports.SUPPORT_EMAIL = exports.COMPANY_NAME = void 0;
const tenant_1 = require("../config/tenant");
/**
 * Commonly used tenant values
 * These constants are derived from the tenant configuration
 * and provide easy access to frequently used values
 */
// ============ COMPANY INFORMATION ============
exports.COMPANY_NAME = tenant_1.tenantConfig.store.name;
exports.SUPPORT_EMAIL = tenant_1.tenantConfig.email.replyTo;
exports.ADMIN_EMAIL = tenant_1.tenantConfig.api.adminEmail;
exports.STORE_URL = tenant_1.derivedConfig.storeUrl;
// ============ CURRENCY & FORMATTING ============
exports.DEFAULT_CURRENCY = tenant_1.tenantConfig.store.currency;
exports.CURRENCY_SYMBOL = tenant_1.tenantConfig.business.currencySymbol;
exports.formatCurrency = tenant_1.derivedConfig.formatCurrency;
// ============ APP INFORMATION ============
exports.APP_NAME = tenant_1.tenantConfig.app.name;
exports.APP_VERSION = tenant_1.tenantConfig.app.version;
exports.DEEP_LINK_SCHEME = tenant_1.tenantConfig.app.deepLinkScheme;
// ============ BUSINESS RULES ============
exports.MINIMUM_ORDER_VALUE = tenant_1.tenantConfig.business.minimumOrderValue;
exports.DEFAULT_SHIPPING_RATE = tenant_1.tenantConfig.business.defaultShippingRate;
exports.FREE_SHIPPING_THRESHOLD = tenant_1.tenantConfig.business.freeShippingThreshold;
exports.TAX_RATE = tenant_1.tenantConfig.business.taxRate;
// ============ ENVIRONMENT ============
exports.IS_PRODUCTION = tenant_1.derivedConfig.isProduction;
exports.IS_DEVELOPMENT = tenant_1.derivedConfig.isDevelopment;
exports.NODE_ENV = tenant_1.tenantConfig.api.nodeEnv;
// ============ API INFORMATION ============
exports.API_VERSION = tenant_1.tenantConfig.api.version;
exports.API_BASE_URL = tenant_1.tenantConfig.api.baseUrl;
exports.FRONTEND_URL = tenant_1.tenantConfig.api.frontendUrl;
// ============ EMAIL CONSTANTS ============
exports.EMAIL_FROM = {
    name: tenant_1.tenantConfig.email.fromName,
    address: tenant_1.tenantConfig.email.fromAddress
};
exports.EMAIL_SIGNATURE = tenant_1.derivedConfig.emailSignature;
// ============ FEATURE FLAGS ============
exports.FEATURES = {
    LOYALTY_PROGRAM: tenant_1.tenantConfig.business.enableLoyaltyProgram,
    REVIEWS: tenant_1.tenantConfig.business.enableReviews,
    WISHLIST: tenant_1.tenantConfig.business.enableWishlist,
    GUEST_CHECKOUT: tenant_1.tenantConfig.business.enableGuestCheckout,
    SMS_NOTIFICATIONS: tenant_1.tenantConfig.sms.enableSmsNotifications,
    SOCIAL_LOGIN: tenant_1.tenantConfig.security.enableSocialLogin,
    TWO_FACTOR: tenant_1.tenantConfig.security.enableTwoFactor,
    PUSH_NOTIFICATIONS: tenant_1.tenantConfig.app.enablePushNotifications,
    BLOG: tenant_1.tenantConfig.features.enableBlog,
    CHAT: tenant_1.tenantConfig.features.enableChat,
    SUBSCRIPTIONS: tenant_1.tenantConfig.features.enableSubscriptions,
    AFFILIATES: tenant_1.tenantConfig.features.enableAffiliates,
    MULTI_LANGUAGE: tenant_1.tenantConfig.features.enableMultiLanguage,
    ADVANCED_SEARCH: tenant_1.tenantConfig.features.enableAdvancedSearch,
    INVENTORY_TRACKING: tenant_1.tenantConfig.features.enableInventoryTracking,
    BACKORDERS: tenant_1.tenantConfig.features.enableBackorders
};
// ============ SECURITY CONSTANTS ============
exports.PASSWORD_MIN_LENGTH = tenant_1.tenantConfig.security.passwordMinLength;
exports.JWT_EXPIRES_IN = tenant_1.tenantConfig.security.jwtExpiresIn;
exports.SESSION_TIMEOUT = tenant_1.tenantConfig.security.sessionTimeout;
// ============ RATE LIMITING ============
exports.RATE_LIMIT = {
    WINDOW_MS: tenant_1.tenantConfig.security.rateLimitWindowMs,
    MAX_REQUESTS: tenant_1.tenantConfig.security.rateLimitMaxRequests
};
// ============ FILE UPLOAD LIMITS ============
exports.UPLOAD_LIMITS = {
    MAX_FILE_SIZE: tenant_1.tenantConfig.storage.maxFileSize,
    ALLOWED_TYPES: tenant_1.tenantConfig.storage.allowedFileTypes.split(','),
    UPLOAD_PATH: tenant_1.tenantConfig.storage.uploadPath
};
// ============ SHOPIFY CONSTANTS ============
exports.SHOPIFY = {
    STORE_URL: tenant_1.tenantConfig.shopify.storeUrl,
    API_VERSION: tenant_1.tenantConfig.shopify.apiVersion,
    SCOPES: tenant_1.tenantConfig.shopify.scopes.split(',')
};
// ============ PAGINATION DEFAULTS ============
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};
// ============ ERROR MESSAGES ============
exports.ERROR_MESSAGES = {
    UNAUTHORIZED: 'Authentication required',
    FORBIDDEN: 'You do not have permission to perform this action',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation failed',
    SERVER_ERROR: 'Internal server error',
    RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later',
    EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
    INVALID_CREDENTIALS: 'Invalid email or password',
    ACCOUNT_DISABLED: 'Your account has been deactivated',
    ORDER_MINIMUM_NOT_MET: `Minimum order value is ${(0, exports.formatCurrency)(exports.MINIMUM_ORDER_VALUE)}`
};
// ============ SUCCESS MESSAGES ============
exports.SUCCESS_MESSAGES = {
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
exports.NOTIFICATION_TYPES = {
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
exports.ORDER_STATUSES = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
};
// ============ PAYMENT STATUSES ============
exports.PAYMENT_STATUSES = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUNDED: 'refunded'
};
// ============ USER ROLES ============
exports.USER_ROLES = {
    CUSTOMER: 'customer',
    STAFF: 'staff',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin'
};
// ============ REGEX PATTERNS ============
exports.REGEX_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PHONE: /^\+?[\d\s\-\(\)]+$/,
    PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/,
    URL: /^https?:\/\/.+/,
    HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
};
// ============ HTTP STATUS CODES ============
exports.HTTP_STATUS = {
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
const buildDeepLink = (path) => {
    return tenant_1.derivedConfig.buildDeepLink(path);
};
exports.buildDeepLink = buildDeepLink;
/**
 * Get full API endpoint URL
 * @param endpoint - API endpoint path
 * @returns Full URL to the endpoint
 */
const getApiUrl = (endpoint) => {
    const baseUrl = tenant_1.derivedConfig.apiUrl;
    return `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
};
exports.getApiUrl = getApiUrl;
/**
 * Check if a feature is enabled
 * @param featureName - Name of the feature to check
 * @returns Boolean indicating if feature is enabled
 */
const isFeatureEnabled = (featureName) => {
    return exports.FEATURES[featureName];
};
exports.isFeatureEnabled = isFeatureEnabled;
/**
 * Get store branding information
 * @returns Store branding object
 */
const getStoreBranding = () => ({
    name: exports.COMPANY_NAME,
    logo: tenant_1.tenantConfig.store.logoUrl,
    primaryColor: tenant_1.tenantConfig.store.primaryColor,
    currency: exports.DEFAULT_CURRENCY,
    currencySymbol: exports.CURRENCY_SYMBOL
});
exports.getStoreBranding = getStoreBranding;
exports.default = {
    COMPANY_NAME: exports.COMPANY_NAME,
    SUPPORT_EMAIL: exports.SUPPORT_EMAIL,
    DEFAULT_CURRENCY: exports.DEFAULT_CURRENCY,
    APP_NAME: exports.APP_NAME,
    FEATURES: exports.FEATURES,
    ERROR_MESSAGES: exports.ERROR_MESSAGES,
    SUCCESS_MESSAGES: exports.SUCCESS_MESSAGES,
    buildDeepLink: exports.buildDeepLink,
    getApiUrl: exports.getApiUrl,
    isFeatureEnabled: exports.isFeatureEnabled,
    getStoreBranding: exports.getStoreBranding
};
//# sourceMappingURL=constants.js.map