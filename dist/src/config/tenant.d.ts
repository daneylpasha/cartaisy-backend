/**
 * Comprehensive tenant configuration object
 * All settings are configurable through environment variables
 */
export declare const tenantConfig: {
    store: {
        name: string;
        domain: string;
        logoUrl: string;
        primaryColor: string;
        currency: string;
        timezone: string;
        country: string;
        description: string;
    };
    api: {
        baseUrl: string;
        version: string;
        frontendUrl: string;
        adminEmail: string;
        port: number;
        nodeEnv: string;
    };
    shopify: {
        storeUrl: string;
        apiKey: string;
        apiSecret: string;
        accessToken: string;
        webhookSecret: string;
        scopes: string;
        apiVersion: string;
        webhookUrl: string;
        enableSync: boolean;
        syncInterval: number;
        maxRetries: number;
        rateLimitDelay: number;
    };
    email: {
        fromName: string;
        fromAddress: string;
        replyTo: string;
        serviceType: string;
        serviceApiKey: string;
        smtp: {
            host: string;
            port: number;
            user: string;
            pass: string;
            secure: boolean;
        };
    };
    app: {
        name: string;
        bundleId: string;
        deepLinkScheme: string;
        version: string;
        pushNotificationKey: string;
        analyticsTrackingId: string;
        enablePushNotifications: boolean;
    };
    security: {
        jwtSecret: string;
        jwtExpiresIn: string;
        rateLimitWindowMs: number;
        rateLimitMaxRequests: number;
        enableSocialLogin: boolean;
        googleClientId: string;
        googleClientSecret: string;
        facebookAppId: string;
        facebookAppSecret: string;
        enableTwoFactor: boolean;
        passwordMinLength: number;
        sessionTimeout: number;
    };
    sms: {
        enableSmsNotifications: boolean;
        serviceProvider: string;
        serviceApiKey: string;
        serviceApiSecret: string;
        fromNumber: string;
    };
    business: {
        enableLoyaltyProgram: boolean;
        loyaltyPointsRatio: number;
        defaultShippingRate: number;
        freeShippingThreshold: number;
        taxRate: number;
        minimumOrderValue: number;
        currencySymbol: string;
        enableReviews: boolean;
        enableWishlist: boolean;
        enableGuestCheckout: boolean;
    };
    database: {
        mongodbUri: string;
        connectionTimeout: number;
        maxPoolSize: number;
        minPoolSize: number;
    };
    redis: {
        enabled: boolean;
        host: string;
        port: number;
        password: string;
        database: number;
        keyPrefix: string;
    };
    storage: {
        provider: string;
        uploadPath: string;
        maxFileSize: number;
        allowedFileTypes: string;
        aws: {
            accessKeyId: string;
            secretAccessKey: string;
            region: string;
            bucketName: string;
        };
    };
    payments: {
        defaultProvider: string;
        enableMultipleProviders: boolean;
        stripe: {
            publishableKey: string;
            secretKey: string;
            webhookSecret: string;
        };
        paypal: {
            clientId: string;
            clientSecret: string;
            sandbox: boolean;
        };
    };
    analytics: {
        enableAnalytics: boolean;
        googleAnalyticsId: string;
        facebookPixelId: string;
        hotjarId: string;
        enableErrorTracking: boolean;
        sentryDsn: string;
    };
    features: {
        enableBlog: boolean;
        enableChat: boolean;
        enableSubscriptions: boolean;
        enableAffiliates: boolean;
        enableMultiLanguage: boolean;
        enableAdvancedSearch: boolean;
        enableInventoryTracking: boolean;
        enableBackorders: boolean;
        enableShopifySync: boolean;
        enableProductEnhancement: boolean;
        enableBackgroundJobs: boolean;
    };
    jobs: {
        enableScheduledSync: boolean;
        fullSyncCron: string;
        incrementalSyncCron: string;
        inventorySyncCron: string;
        orderProcessingCron: string;
        analyticsUpdateCron: string;
        lowStockAlertsCron: string;
        dataCleanupCron: string;
        healthCheckCron: string;
    };
};
export declare const derivedConfig: {
    storeUrl: string;
    apiUrl: string;
    emailSignature: string;
    formatCurrency: (amount: number) => string;
    buildDeepLink: (path: string) => string;
    isProduction: boolean;
    isDevelopment: boolean;
};
export declare const storeConfig: {
    name: string;
    domain: string;
    logoUrl: string;
    primaryColor: string;
    currency: string;
    timezone: string;
    country: string;
    description: string;
};
export declare const apiConfig: {
    baseUrl: string;
    version: string;
    frontendUrl: string;
    adminEmail: string;
    port: number;
    nodeEnv: string;
};
export declare const shopifyConfig: {
    storeUrl: string;
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    webhookSecret: string;
    scopes: string;
    apiVersion: string;
    webhookUrl: string;
    enableSync: boolean;
    syncInterval: number;
    maxRetries: number;
    rateLimitDelay: number;
};
export declare const emailConfig: {
    fromName: string;
    fromAddress: string;
    replyTo: string;
    serviceType: string;
    serviceApiKey: string;
    smtp: {
        host: string;
        port: number;
        user: string;
        pass: string;
        secure: boolean;
    };
};
export declare const appConfig: {
    name: string;
    bundleId: string;
    deepLinkScheme: string;
    version: string;
    pushNotificationKey: string;
    analyticsTrackingId: string;
    enablePushNotifications: boolean;
};
export declare const securityConfig: {
    jwtSecret: string;
    jwtExpiresIn: string;
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;
    enableSocialLogin: boolean;
    googleClientId: string;
    googleClientSecret: string;
    facebookAppId: string;
    facebookAppSecret: string;
    enableTwoFactor: boolean;
    passwordMinLength: number;
    sessionTimeout: number;
};
export declare const businessConfig: {
    enableLoyaltyProgram: boolean;
    loyaltyPointsRatio: number;
    defaultShippingRate: number;
    freeShippingThreshold: number;
    taxRate: number;
    minimumOrderValue: number;
    currencySymbol: string;
    enableReviews: boolean;
    enableWishlist: boolean;
    enableGuestCheckout: boolean;
};
export declare const databaseConfig: {
    mongodbUri: string;
    connectionTimeout: number;
    maxPoolSize: number;
    minPoolSize: number;
};
export default tenantConfig;
//# sourceMappingURL=tenant.d.ts.map