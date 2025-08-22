"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigSummary = exports.validateRequiredConfig = exports.logConfigSummary = exports.validateTenantConfig = void 0;
const tenant_1 = require("./tenant");
/**
 * Validates tenant configuration and returns validation results
 * @returns Array of validation errors/warnings
 */
const validateTenantConfig = () => {
    const errors = [];
    // ============ CRITICAL VALIDATIONS (ERRORS) ============
    // Database
    if (!tenant_1.tenantConfig.database.mongodbUri || tenant_1.tenantConfig.database.mongodbUri === 'mongodb://localhost:27017/cartaisy') {
        errors.push({
            field: 'MONGODB_URI',
            message: 'MongoDB connection string is required and should not use default localhost value in production',
            severity: tenant_1.derivedConfig.isProduction ? 'error' : 'warning'
        });
    }
    // JWT Secret
    if (!tenant_1.tenantConfig.security.jwtSecret || tenant_1.tenantConfig.security.jwtSecret.length < 32) {
        errors.push({
            field: 'JWT_SECRET',
            message: 'JWT secret is required and must be at least 32 characters long',
            severity: 'error'
        });
    }
    if (tenant_1.tenantConfig.security.jwtSecret === 'your-super-secret-jwt-key-replace-with-random-string-in-production') {
        errors.push({
            field: 'JWT_SECRET',
            message: 'JWT secret must be changed from default value',
            severity: tenant_1.derivedConfig.isProduction ? 'error' : 'warning'
        });
    }
    // Store Information
    if (!tenant_1.tenantConfig.store.name || tenant_1.tenantConfig.store.name === 'Cartaisy Store') {
        errors.push({
            field: 'STORE_NAME',
            message: 'Store name should be customized for your tenant',
            severity: 'warning'
        });
    }
    // Email Configuration
    if (!tenant_1.tenantConfig.email.fromAddress || tenant_1.tenantConfig.email.fromAddress.includes('example.com')) {
        errors.push({
            field: 'EMAIL_FROM_ADDRESS',
            message: 'Email from address is required and should use your domain',
            severity: 'error'
        });
    }
    // API URLs
    if (!tenant_1.tenantConfig.api.baseUrl || tenant_1.tenantConfig.api.baseUrl.includes('localhost')) {
        errors.push({
            field: 'API_BASE_URL',
            message: 'API base URL should be set to your production domain',
            severity: tenant_1.derivedConfig.isProduction ? 'error' : 'warning'
        });
    }
    if (!tenant_1.tenantConfig.api.frontendUrl || tenant_1.tenantConfig.api.frontendUrl.includes('localhost')) {
        errors.push({
            field: 'FRONTEND_URL',
            message: 'Frontend URL should be set to your production domain',
            severity: tenant_1.derivedConfig.isProduction ? 'error' : 'warning'
        });
    }
    // ============ EMAIL CONFIGURATION VALIDATIONS ============
    if (tenant_1.tenantConfig.email.serviceType === 'smtp') {
        if (!tenant_1.tenantConfig.email.smtp.host) {
            errors.push({
                field: 'EMAIL_SMTP_HOST',
                message: 'SMTP host is required when using SMTP email service',
                severity: 'error'
            });
        }
        if (!tenant_1.tenantConfig.email.smtp.user || !tenant_1.tenantConfig.email.smtp.pass) {
            errors.push({
                field: 'EMAIL_SMTP_USER/EMAIL_SMTP_PASS',
                message: 'SMTP credentials are recommended for email functionality',
                severity: 'warning'
            });
        }
    }
    // ============ SHOPIFY INTEGRATION VALIDATIONS ============
    if (tenant_1.tenantConfig.shopify.storeUrl && !tenant_1.tenantConfig.shopify.apiKey) {
        errors.push({
            field: 'SHOPIFY_API_KEY',
            message: 'Shopify API key is required when Shopify store URL is provided',
            severity: 'error'
        });
    }
    if (tenant_1.tenantConfig.shopify.storeUrl && !tenant_1.tenantConfig.shopify.apiSecret) {
        errors.push({
            field: 'SHOPIFY_API_SECRET',
            message: 'Shopify API secret is required when Shopify store URL is provided',
            severity: 'error'
        });
    }
    // ============ SECURITY VALIDATIONS ============
    if (tenant_1.derivedConfig.isProduction) {
        if (tenant_1.tenantConfig.security.rateLimitMaxRequests > 1000) {
            errors.push({
                field: 'RATE_LIMIT_MAX_REQUESTS',
                message: 'Rate limit seems too high for production environment',
                severity: 'warning'
            });
        }
        if (!tenant_1.tenantConfig.analytics.enableErrorTracking) {
            errors.push({
                field: 'ENABLE_ERROR_TRACKING',
                message: 'Error tracking is recommended for production environment',
                severity: 'warning'
            });
        }
    }
    // ============ PAYMENT PROCESSING VALIDATIONS ============
    if (tenant_1.tenantConfig.payments.defaultProvider === 'stripe') {
        if (!tenant_1.tenantConfig.payments.stripe.secretKey) {
            errors.push({
                field: 'STRIPE_SECRET_KEY',
                message: 'Stripe secret key is required when using Stripe as payment provider',
                severity: 'warning'
            });
        }
        if (tenant_1.derivedConfig.isProduction && tenant_1.tenantConfig.payments.stripe.secretKey?.startsWith('sk_test_')) {
            errors.push({
                field: 'STRIPE_SECRET_KEY',
                message: 'Using test Stripe key in production environment',
                severity: 'error'
            });
        }
    }
    // ============ URL FORMAT VALIDATIONS ============
    const urlFields = [
        { field: 'API_BASE_URL', value: tenant_1.tenantConfig.api.baseUrl },
        { field: 'FRONTEND_URL', value: tenant_1.tenantConfig.api.frontendUrl },
        { field: 'SHOPIFY_STORE_URL', value: tenant_1.tenantConfig.shopify.storeUrl },
        { field: 'STORE_LOGO_URL', value: tenant_1.tenantConfig.store.logoUrl }
    ];
    urlFields.forEach(({ field, value }) => {
        if (value && !isValidUrl(value)) {
            errors.push({
                field,
                message: `${field} should be a valid URL`,
                severity: 'warning'
            });
        }
    });
    // ============ EMAIL FORMAT VALIDATIONS ============
    const emailFields = [
        { field: 'EMAIL_FROM_ADDRESS', value: tenant_1.tenantConfig.email.fromAddress },
        { field: 'EMAIL_REPLY_TO', value: tenant_1.tenantConfig.email.replyTo },
        { field: 'ADMIN_EMAIL', value: tenant_1.tenantConfig.api.adminEmail }
    ];
    emailFields.forEach(({ field, value }) => {
        if (value && !isValidEmail(value)) {
            errors.push({
                field,
                message: `${field} should be a valid email address`,
                severity: 'error'
            });
        }
    });
    // ============ COLOR FORMAT VALIDATION ============
    if (tenant_1.tenantConfig.store.primaryColor && !isValidHexColor(tenant_1.tenantConfig.store.primaryColor)) {
        errors.push({
            field: 'STORE_PRIMARY_COLOR',
            message: 'Store primary color should be a valid hex color (e.g., #FF0000)',
            severity: 'warning'
        });
    }
    return errors;
};
exports.validateTenantConfig = validateTenantConfig;
/**
 * Validates URL format
 * @param url - URL to validate
 * @returns Boolean indicating if URL is valid
 */
const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    }
    catch {
        return false;
    }
};
/**
 * Validates email format
 * @param email - Email to validate
 * @returns Boolean indicating if email is valid
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
/**
 * Validates hex color format
 * @param color - Color to validate
 * @returns Boolean indicating if color is valid hex
 */
const isValidHexColor = (color) => {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return hexRegex.test(color);
};
/**
 * Logs configuration summary without sensitive information
 */
const logConfigSummary = () => {
    console.log('\n🏪 =================== TENANT CONFIGURATION ===================');
    console.log(`📊 Store: ${tenant_1.tenantConfig.store.name}`);
    console.log(`🌍 Domain: ${tenant_1.tenantConfig.store.domain}`);
    console.log(`💰 Currency: ${tenant_1.tenantConfig.store.currency}`);
    console.log(`🕐 Timezone: ${tenant_1.tenantConfig.store.timezone}`);
    console.log(`🌐 Environment: ${tenant_1.tenantConfig.api.nodeEnv}`);
    console.log(`📱 App: ${tenant_1.tenantConfig.app.name} v${tenant_1.tenantConfig.app.version}`);
    console.log(`🔗 API: ${tenant_1.tenantConfig.api.baseUrl}/api/${tenant_1.tenantConfig.api.version}`);
    console.log(`📧 Email: ${tenant_1.tenantConfig.email.fromAddress} (${tenant_1.tenantConfig.email.serviceType})`);
    // Feature flags summary
    const enabledFeatures = Object.entries(tenant_1.tenantConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature.replace(/^enable/, '').toLowerCase());
    if (enabledFeatures.length > 0) {
        console.log(`✨ Features: ${enabledFeatures.join(', ')}`);
    }
    // Business settings
    console.log(`💵 Min Order: ${tenant_1.tenantConfig.business.currencySymbol}${tenant_1.tenantConfig.business.minimumOrderValue}`);
    console.log(`🚚 Shipping: ${tenant_1.tenantConfig.business.currencySymbol}${tenant_1.tenantConfig.business.defaultShippingRate} (free over ${tenant_1.tenantConfig.business.currencySymbol}${tenant_1.tenantConfig.business.freeShippingThreshold})`);
    // Integration status
    const integrations = [];
    if (tenant_1.tenantConfig.shopify.storeUrl)
        integrations.push('Shopify');
    if (tenant_1.tenantConfig.payments.stripe.secretKey)
        integrations.push('Stripe');
    if (tenant_1.tenantConfig.payments.paypal.clientId)
        integrations.push('PayPal');
    if (tenant_1.tenantConfig.analytics.googleAnalyticsId)
        integrations.push('Google Analytics');
    if (integrations.length > 0) {
        console.log(`🔌 Integrations: ${integrations.join(', ')}`);
    }
    console.log('============================================================\n');
};
exports.logConfigSummary = logConfigSummary;
/**
 * Throws error if critical configuration is missing
 * Should be called during app initialization
 */
const validateRequiredConfig = () => {
    const errors = (0, exports.validateTenantConfig)();
    const criticalErrors = errors.filter(error => error.severity === 'error');
    if (criticalErrors.length > 0) {
        console.error('\n❌ =============== CONFIGURATION ERRORS ===============');
        console.error('The following configuration errors must be fixed:');
        console.error('');
        criticalErrors.forEach(error => {
            console.error(`❌ ${error.field}: ${error.message}`);
        });
        console.error('');
        console.error('Please check your .env file and fix these issues before starting the server.');
        console.error('Copy .env.example to .env and customize the values for your tenant.');
        console.error('=====================================================\n');
        throw new Error(`Configuration validation failed with ${criticalErrors.length} critical error(s)`);
    }
    // Log warnings
    const warnings = errors.filter(error => error.severity === 'warning');
    if (warnings.length > 0) {
        console.warn('\n⚠️  =============== CONFIGURATION WARNINGS ===============');
        console.warn('The following configuration should be reviewed:');
        console.warn('');
        warnings.forEach(warning => {
            console.warn(`⚠️  ${warning.field}: ${warning.message}`);
        });
        console.warn('=====================================================\n');
    }
};
exports.validateRequiredConfig = validateRequiredConfig;
/**
 * Gets a summary of the current configuration
 * @returns Configuration summary object
 */
const getConfigSummary = () => ({
    store: {
        name: tenant_1.tenantConfig.store.name,
        domain: tenant_1.tenantConfig.store.domain,
        currency: tenant_1.tenantConfig.store.currency,
        country: tenant_1.tenantConfig.store.country
    },
    environment: tenant_1.tenantConfig.api.nodeEnv,
    features: Object.entries(tenant_1.tenantConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature),
    integrations: {
        shopify: !!tenant_1.tenantConfig.shopify.storeUrl,
        stripe: !!tenant_1.tenantConfig.payments.stripe.secretKey,
        paypal: !!tenant_1.tenantConfig.payments.paypal.clientId,
        email: tenant_1.tenantConfig.email.serviceType,
        analytics: !!tenant_1.tenantConfig.analytics.googleAnalyticsId
    },
    validation: {
        errors: (0, exports.validateTenantConfig)().filter(e => e.severity === 'error').length,
        warnings: (0, exports.validateTenantConfig)().filter(e => e.severity === 'warning').length
    }
});
exports.getConfigSummary = getConfigSummary;
exports.default = {
    validateTenantConfig: exports.validateTenantConfig,
    validateRequiredConfig: exports.validateRequiredConfig,
    logConfigSummary: exports.logConfigSummary,
    getConfigSummary: exports.getConfigSummary
};
//# sourceMappingURL=validateConfig.js.map