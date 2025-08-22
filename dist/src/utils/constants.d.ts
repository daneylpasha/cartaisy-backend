/**
 * Commonly used tenant values
 * These constants are derived from the tenant configuration
 * and provide easy access to frequently used values
 */
export declare const COMPANY_NAME: string;
export declare const SUPPORT_EMAIL: string;
export declare const ADMIN_EMAIL: string;
export declare const STORE_URL: string;
export declare const DEFAULT_CURRENCY: string;
export declare const CURRENCY_SYMBOL: string;
export declare const formatCurrency: (amount: number) => string;
export declare const APP_NAME: string;
export declare const APP_VERSION: string;
export declare const DEEP_LINK_SCHEME: string;
export declare const MINIMUM_ORDER_VALUE: number;
export declare const DEFAULT_SHIPPING_RATE: number;
export declare const FREE_SHIPPING_THRESHOLD: number;
export declare const TAX_RATE: number;
export declare const IS_PRODUCTION: boolean;
export declare const IS_DEVELOPMENT: boolean;
export declare const NODE_ENV: string;
export declare const API_VERSION: string;
export declare const API_BASE_URL: string;
export declare const FRONTEND_URL: string;
export declare const EMAIL_FROM: {
    name: string;
    address: string;
};
export declare const EMAIL_SIGNATURE: string;
export declare const FEATURES: {
    LOYALTY_PROGRAM: boolean;
    REVIEWS: boolean;
    WISHLIST: boolean;
    GUEST_CHECKOUT: boolean;
    SMS_NOTIFICATIONS: boolean;
    SOCIAL_LOGIN: boolean;
    TWO_FACTOR: boolean;
    PUSH_NOTIFICATIONS: boolean;
    BLOG: boolean;
    CHAT: boolean;
    SUBSCRIPTIONS: boolean;
    AFFILIATES: boolean;
    MULTI_LANGUAGE: boolean;
    ADVANCED_SEARCH: boolean;
    INVENTORY_TRACKING: boolean;
    BACKORDERS: boolean;
};
export declare const PASSWORD_MIN_LENGTH: number;
export declare const JWT_EXPIRES_IN: string;
export declare const SESSION_TIMEOUT: number;
export declare const RATE_LIMIT: {
    WINDOW_MS: number;
    MAX_REQUESTS: number;
};
export declare const UPLOAD_LIMITS: {
    MAX_FILE_SIZE: number;
    ALLOWED_TYPES: string[];
    UPLOAD_PATH: string;
};
export declare const SHOPIFY: {
    STORE_URL: string;
    API_VERSION: string;
    SCOPES: string[];
};
export declare const PAGINATION: {
    DEFAULT_PAGE: number;
    DEFAULT_LIMIT: number;
    MAX_LIMIT: number;
};
export declare const ERROR_MESSAGES: {
    UNAUTHORIZED: string;
    FORBIDDEN: string;
    NOT_FOUND: string;
    VALIDATION_ERROR: string;
    SERVER_ERROR: string;
    RATE_LIMIT_EXCEEDED: string;
    EMAIL_ALREADY_EXISTS: string;
    INVALID_CREDENTIALS: string;
    ACCOUNT_DISABLED: string;
    ORDER_MINIMUM_NOT_MET: string;
};
export declare const SUCCESS_MESSAGES: {
    REGISTRATION_SUCCESS: string;
    LOGIN_SUCCESS: string;
    LOGOUT_SUCCESS: string;
    PASSWORD_RESET_REQUEST: string;
    PASSWORD_RESET_SUCCESS: string;
    PROFILE_UPDATED: string;
    EMAIL_VERIFIED: string;
    ORDER_PLACED: string;
    PAYMENT_SUCCESS: string;
};
export declare const NOTIFICATION_TYPES: {
    ORDER_CONFIRMATION: string;
    ORDER_SHIPPED: string;
    ORDER_DELIVERED: string;
    PAYMENT_RECEIVED: string;
    ACCOUNT_CREATED: string;
    PASSWORD_RESET: string;
    PROMOTIONAL: string;
    REMINDER: string;
};
export declare const ORDER_STATUSES: {
    PENDING: string;
    PROCESSING: string;
    SHIPPED: string;
    DELIVERED: string;
    CANCELLED: string;
    REFUNDED: string;
};
export declare const PAYMENT_STATUSES: {
    PENDING: string;
    PROCESSING: string;
    COMPLETED: string;
    FAILED: string;
    CANCELLED: string;
    REFUNDED: string;
};
export declare const USER_ROLES: {
    CUSTOMER: string;
    STAFF: string;
    ADMIN: string;
    SUPER_ADMIN: string;
};
export declare const REGEX_PATTERNS: {
    EMAIL: RegExp;
    PHONE: RegExp;
    PASSWORD: RegExp;
    URL: RegExp;
    HEX_COLOR: RegExp;
};
export declare const HTTP_STATUS: {
    OK: number;
    CREATED: number;
    NO_CONTENT: number;
    BAD_REQUEST: number;
    UNAUTHORIZED: number;
    FORBIDDEN: number;
    NOT_FOUND: number;
    CONFLICT: number;
    UNPROCESSABLE_ENTITY: number;
    TOO_MANY_REQUESTS: number;
    INTERNAL_SERVER_ERROR: number;
    SERVICE_UNAVAILABLE: number;
};
/**
 * Build deep link URL for mobile app
 * @param path - Path to navigate to in the app
 * @returns Deep link URL
 */
export declare const buildDeepLink: (path: string) => string;
/**
 * Get full API endpoint URL
 * @param endpoint - API endpoint path
 * @returns Full URL to the endpoint
 */
export declare const getApiUrl: (endpoint: string) => string;
/**
 * Check if a feature is enabled
 * @param featureName - Name of the feature to check
 * @returns Boolean indicating if feature is enabled
 */
export declare const isFeatureEnabled: (featureName: keyof typeof FEATURES) => boolean;
/**
 * Get store branding information
 * @returns Store branding object
 */
export declare const getStoreBranding: () => {
    name: string;
    logo: string;
    primaryColor: string;
    currency: string;
    currencySymbol: string;
};
declare const _default: {
    COMPANY_NAME: string;
    SUPPORT_EMAIL: string;
    DEFAULT_CURRENCY: string;
    APP_NAME: string;
    FEATURES: {
        LOYALTY_PROGRAM: boolean;
        REVIEWS: boolean;
        WISHLIST: boolean;
        GUEST_CHECKOUT: boolean;
        SMS_NOTIFICATIONS: boolean;
        SOCIAL_LOGIN: boolean;
        TWO_FACTOR: boolean;
        PUSH_NOTIFICATIONS: boolean;
        BLOG: boolean;
        CHAT: boolean;
        SUBSCRIPTIONS: boolean;
        AFFILIATES: boolean;
        MULTI_LANGUAGE: boolean;
        ADVANCED_SEARCH: boolean;
        INVENTORY_TRACKING: boolean;
        BACKORDERS: boolean;
    };
    ERROR_MESSAGES: {
        UNAUTHORIZED: string;
        FORBIDDEN: string;
        NOT_FOUND: string;
        VALIDATION_ERROR: string;
        SERVER_ERROR: string;
        RATE_LIMIT_EXCEEDED: string;
        EMAIL_ALREADY_EXISTS: string;
        INVALID_CREDENTIALS: string;
        ACCOUNT_DISABLED: string;
        ORDER_MINIMUM_NOT_MET: string;
    };
    SUCCESS_MESSAGES: {
        REGISTRATION_SUCCESS: string;
        LOGIN_SUCCESS: string;
        LOGOUT_SUCCESS: string;
        PASSWORD_RESET_REQUEST: string;
        PASSWORD_RESET_SUCCESS: string;
        PROFILE_UPDATED: string;
        EMAIL_VERIFIED: string;
        ORDER_PLACED: string;
        PAYMENT_SUCCESS: string;
    };
    buildDeepLink: (path: string) => string;
    getApiUrl: (endpoint: string) => string;
    isFeatureEnabled: (featureName: keyof typeof FEATURES) => boolean;
    getStoreBranding: () => {
        name: string;
        logo: string;
        primaryColor: string;
        currency: string;
        currencySymbol: string;
    };
};
export default _default;
//# sourceMappingURL=constants.d.ts.map