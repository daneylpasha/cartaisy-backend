import { tenantConfig, derivedConfig } from './tenant';

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validates tenant configuration and returns validation results
 * @returns Array of validation errors/warnings
 */
export const validateTenantConfig = (): ValidationError[] => {
  const errors: ValidationError[] = [];

  // ============ CRITICAL VALIDATIONS (ERRORS) ============
  
  // Database
  if (!tenantConfig.database.mongodbUri || tenantConfig.database.mongodbUri === 'mongodb://localhost:27017/cartaisy') {
    errors.push({
      field: 'MONGODB_URI',
      message: 'MongoDB connection string is required and should not use default localhost value in production',
      severity: derivedConfig.isProduction ? 'error' : 'warning'
    });
  }

  // JWT Secret
  if (!tenantConfig.security.jwtSecret || tenantConfig.security.jwtSecret.length < 32) {
    errors.push({
      field: 'JWT_SECRET',
      message: 'JWT secret is required and must be at least 32 characters long',
      severity: 'error'
    });
  }

  if (tenantConfig.security.jwtSecret === 'your-super-secret-jwt-key-replace-with-random-string-in-production') {
    errors.push({
      field: 'JWT_SECRET',
      message: 'JWT secret must be changed from default value',
      severity: derivedConfig.isProduction ? 'error' : 'warning'
    });
  }

  // Store Information
  if (!tenantConfig.store.name || tenantConfig.store.name === 'Cartaisy Store') {
    errors.push({
      field: 'STORE_NAME',
      message: 'Store name should be customized for your tenant',
      severity: 'warning'
    });
  }

  // Email Configuration
  if (!tenantConfig.email.fromAddress || tenantConfig.email.fromAddress.includes('example.com')) {
    errors.push({
      field: 'EMAIL_FROM_ADDRESS',
      message: 'Email from address is required and should use your domain',
      severity: 'warning'
    });
  }

  // API URLs
  if (!tenantConfig.api.baseUrl || tenantConfig.api.baseUrl.includes('localhost')) {
    errors.push({
      field: 'API_BASE_URL',
      message: 'API base URL should be set to your production domain',
      severity: 'warning'
    });
  }

  if (!tenantConfig.api.frontendUrl || tenantConfig.api.frontendUrl.includes('localhost')) {
    errors.push({
      field: 'FRONTEND_URL',
      message: 'Frontend URL should be set to your production domain',
      severity: 'warning'
    });
  }

  // ============ EMAIL CONFIGURATION VALIDATIONS ============
  
  if (tenantConfig.email.serviceType === 'smtp') {
    if (!tenantConfig.email.smtp.host) {
      errors.push({
        field: 'EMAIL_SMTP_HOST',
        message: 'SMTP host is required when using SMTP email service',
        severity: 'warning'
      });
    }

    if (!tenantConfig.email.smtp.user || !tenantConfig.email.smtp.pass) {
      errors.push({
        field: 'EMAIL_SMTP_USER/EMAIL_SMTP_PASS',
        message: 'SMTP credentials are recommended for email functionality',
        severity: 'warning'
      });
    }
  }

  // ============ SHOPIFY INTEGRATION VALIDATIONS ============
  
  if (tenantConfig.shopify.storeUrl && !tenantConfig.shopify.apiKey) {
    errors.push({
      field: 'SHOPIFY_API_KEY',
      message: 'Shopify API key is required when Shopify store URL is provided',
      severity: 'error'
    });
  }

  if (tenantConfig.shopify.storeUrl && !tenantConfig.shopify.apiSecret) {
    errors.push({
      field: 'SHOPIFY_API_SECRET',
      message: 'Shopify API secret is required when Shopify store URL is provided',
      severity: 'error'
    });
  }

  // ============ SECURITY VALIDATIONS ============
  
  if (derivedConfig.isProduction) {
    if (tenantConfig.security.rateLimitMaxRequests > 1000) {
      errors.push({
        field: 'RATE_LIMIT_MAX_REQUESTS',
        message: 'Rate limit seems too high for production environment',
        severity: 'warning'
      });
    }

    if (!tenantConfig.analytics.enableErrorTracking) {
      errors.push({
        field: 'ENABLE_ERROR_TRACKING',
        message: 'Error tracking is recommended for production environment',
        severity: 'warning'
      });
    }
  }

  // ============ PAYMENT PROCESSING VALIDATIONS ============
  
  if (tenantConfig.payments.defaultProvider === 'stripe') {
    if (!tenantConfig.payments.stripe.secretKey) {
      errors.push({
        field: 'STRIPE_SECRET_KEY',
        message: 'Stripe secret key is required when using Stripe as payment provider',
        severity: 'warning'
      });
    }

    if (derivedConfig.isProduction && tenantConfig.payments.stripe.secretKey?.startsWith('sk_test_')) {
      errors.push({
        field: 'STRIPE_SECRET_KEY',
        message: 'Using test Stripe key in production environment',
        severity: 'error'
      });
    }
  }

  // ============ URL FORMAT VALIDATIONS ============
  
  const urlFields = [
    { field: 'API_BASE_URL', value: tenantConfig.api.baseUrl },
    { field: 'FRONTEND_URL', value: tenantConfig.api.frontendUrl },
    { field: 'SHOPIFY_STORE_URL', value: tenantConfig.shopify.storeUrl },
    { field: 'STORE_LOGO_URL', value: tenantConfig.store.logoUrl }
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
    { field: 'EMAIL_FROM_ADDRESS', value: tenantConfig.email.fromAddress },
    { field: 'EMAIL_REPLY_TO', value: tenantConfig.email.replyTo },
    { field: 'ADMIN_EMAIL', value: tenantConfig.api.adminEmail }
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
  
  if (tenantConfig.store.primaryColor && !isValidHexColor(tenantConfig.store.primaryColor)) {
    errors.push({
      field: 'STORE_PRIMARY_COLOR',
      message: 'Store primary color should be a valid hex color (e.g., #FF0000)',
      severity: 'warning'
    });
  }

  return errors;
};

/**
 * Validates URL format
 * @param url - URL to validate
 * @returns Boolean indicating if URL is valid
 */
const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates email format
 * @param email - Email to validate
 * @returns Boolean indicating if email is valid
 */
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validates hex color format
 * @param color - Color to validate
 * @returns Boolean indicating if color is valid hex
 */
const isValidHexColor = (color: string): boolean => {
  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  return hexRegex.test(color);
};

/**
 * Logs configuration summary without sensitive information
 */
export const logConfigSummary = (): void => {
  console.log('\n🏪 =================== TENANT CONFIGURATION ===================');
  console.log(`📊 Store: ${tenantConfig.store.name}`);
  console.log(`🌍 Domain: ${tenantConfig.store.domain}`);
  console.log(`💰 Currency: ${tenantConfig.store.currency}`);
  console.log(`🕐 Timezone: ${tenantConfig.store.timezone}`);
  console.log(`🌐 Environment: ${tenantConfig.api.nodeEnv}`);
  console.log(`📱 App: ${tenantConfig.app.name} v${tenantConfig.app.version}`);
  console.log(`🔗 API: ${tenantConfig.api.baseUrl}/api/${tenantConfig.api.version}`);
  console.log(`📧 Email: ${tenantConfig.email.fromAddress} (${tenantConfig.email.serviceType})`);
  
  // Feature flags summary
  const enabledFeatures = Object.entries(tenantConfig.features)
    .filter(([_, enabled]) => enabled)
    .map(([feature, _]) => feature.replace(/^enable/, '').toLowerCase());
  
  if (enabledFeatures.length > 0) {
    console.log(`✨ Features: ${enabledFeatures.join(', ')}`);
  }

  // Business settings
  console.log(`💵 Min Order: ${tenantConfig.business.currencySymbol}${tenantConfig.business.minimumOrderValue}`);
  console.log(`🚚 Shipping: ${tenantConfig.business.currencySymbol}${tenantConfig.business.defaultShippingRate} (free over ${tenantConfig.business.currencySymbol}${tenantConfig.business.freeShippingThreshold})`);
  
  // Integration status
  const integrations = [];
  if (tenantConfig.shopify.storeUrl) integrations.push('Shopify');
  if (tenantConfig.payments.stripe.secretKey) integrations.push('Stripe');
  if (tenantConfig.payments.paypal.clientId) integrations.push('PayPal');
  if (tenantConfig.analytics.googleAnalyticsId) integrations.push('Google Analytics');
  
  if (integrations.length > 0) {
    console.log(`🔌 Integrations: ${integrations.join(', ')}`);
  }
  
  console.log('============================================================\n');
};

/**
 * Throws error if critical configuration is missing
 * Should be called during app initialization
 */
export const validateRequiredConfig = (): void => {
  const errors = validateTenantConfig();
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

/**
 * Gets a summary of the current configuration
 * @returns Configuration summary object
 */
export const getConfigSummary = () => ({
  store: {
    name: tenantConfig.store.name,
    domain: tenantConfig.store.domain,
    currency: tenantConfig.store.currency,
    country: tenantConfig.store.country
  },
  environment: tenantConfig.api.nodeEnv,
  features: Object.entries(tenantConfig.features)
    .filter(([_, enabled]) => enabled)
    .map(([feature, _]) => feature),
  integrations: {
    shopify: !!tenantConfig.shopify.storeUrl,
    stripe: !!tenantConfig.payments.stripe.secretKey,
    paypal: !!tenantConfig.payments.paypal.clientId,
    email: tenantConfig.email.serviceType,
    analytics: !!tenantConfig.analytics.googleAnalyticsId
  },
  validation: {
    errors: validateTenantConfig().filter(e => e.severity === 'error').length,
    warnings: validateTenantConfig().filter(e => e.severity === 'warning').length
  }
});

export default {
  validateTenantConfig,
  validateRequiredConfig,
  logConfigSummary,
  getConfigSummary
};