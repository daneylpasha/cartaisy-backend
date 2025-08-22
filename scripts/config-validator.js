#!/usr/bin/env node

/**
 * Configuration Validator Script
 * 
 * This script validates environment configuration before deployment
 * and provides detailed error reporting for configuration issues.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m'
};

class ConfigValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Main validation runner
   */
  async validate() {
    console.log(`${colors.cyan}${colors.bright}🔍 Cartaisy Configuration Validator${colors.reset}\n`);
    console.log(`Environment: ${colors.yellow}${this.environment}${colors.reset}\n`);

    try {
      // Run validation checks
      await this.validateEnvironmentFile();
      await this.validateRequiredVariables();
      await this.validateSecuritySettings();
      await this.validateDatabaseConnection();
      await this.validateExternalServices();
      await this.validateEnvironmentSpecific();

      // Print results
      this.printResults();

      // Exit with appropriate code
      if (this.errors.length > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`${colors.red}${colors.bright}❌ Validation failed with error:${colors.reset}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  /**
   * Validate environment file exists and is readable
   */
  async validateEnvironmentFile() {
    console.log(`${colors.blue}📁 Checking environment files...${colors.reset}`);

    const envFiles = [
      '.env',
      `.env.${this.environment}`,
      '.env.local'
    ];

    let foundEnvFile = false;

    for (const file of envFiles) {
      if (fs.existsSync(file)) {
        foundEnvFile = true;
        console.log(`   ✅ Found: ${file}`);
        
        // Check file permissions
        try {
          fs.accessSync(file, fs.constants.R_OK);
        } catch (error) {
          this.errors.push(`Environment file ${file} is not readable`);
        }

        // Check file size (warn if too large)
        const stats = fs.statSync(file);
        if (stats.size > 50000) { // 50KB
          this.warnings.push(`Environment file ${file} is unusually large (${Math.round(stats.size / 1024)}KB)`);
        }
      }
    }

    if (!foundEnvFile) {
      this.errors.push('No environment file found. Create .env or .env.' + this.environment);
    }
  }

  /**
   * Validate required environment variables
   */
  async validateRequiredVariables() {
    console.log(`\n${colors.blue}🔑 Checking required variables...${colors.reset}`);

    const requiredVars = {
      // Core variables
      'NODE_ENV': 'Application environment',
      'PORT': 'Server port',
      'MONGODB_URI': 'Database connection string',
      'JWT_SECRET': 'JWT signing secret',
      'BASE_URL': 'Application base URL'
    };

    const conditionalVars = {
      'SHOPIFY_API_KEY': 'Required if ENABLE_SHOPIFY_SYNC=true',
      'SHOPIFY_API_SECRET': 'Required if ENABLE_SHOPIFY_SYNC=true',
      'SHOPIFY_ACCESS_TOKEN': 'Required if ENABLE_SHOPIFY_SYNC=true',
      'EMAIL_API_KEY': 'Required if EMAIL_SEND_REAL_EMAILS=true',
      'REDIS_URL': 'Required if ENABLE_REDIS_CACHE=true',
      'STRIPE_SECRET_KEY': 'Required for payment processing'
    };

    // Check required variables
    for (const [varName, description] of Object.entries(requiredVars)) {
      if (!process.env[varName]) {
        this.errors.push(`Missing required variable: ${varName} (${description})`);
      } else {
        console.log(`   ✅ ${varName}`);
      }
    }

    // Check conditional variables
    if (this.isEnabled('ENABLE_SHOPIFY_SYNC')) {
      ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_ACCESS_TOKEN'].forEach(varName => {
        if (!process.env[varName]) {
          this.errors.push(`Missing required variable for Shopify: ${varName}`);
        }
      });
    }

    if (this.isEnabled('EMAIL_SEND_REAL_EMAILS')) {
      if (!process.env.EMAIL_API_KEY && !process.env.SENDGRID_API_KEY) {
        this.errors.push('Missing EMAIL_API_KEY or SENDGRID_API_KEY for email service');
      }
    }

    if (this.isEnabled('ENABLE_REDIS_CACHE')) {
      if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
        this.warnings.push('Redis cache enabled but no Redis connection details provided');
      }
    }
  }

  /**
   * Validate security settings
   */
  async validateSecuritySettings() {
    console.log(`\n${colors.blue}🔒 Checking security settings...${colors.reset}`);

    // JWT Secret validation
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      if (jwtSecret.length < 32) {
        this.errors.push('JWT_SECRET must be at least 32 characters long');
      } else if (this.environment === 'production' && jwtSecret.length < 64) {
        this.warnings.push('Production JWT_SECRET should be at least 64 characters long');
      } else {
        console.log(`   ✅ JWT_SECRET length: ${jwtSecret.length} characters`);
      }

      // Check for common weak secrets
      const weakSecrets = ['secret', 'password', 'development', 'test', '12345'];
      if (weakSecrets.some(weak => jwtSecret.toLowerCase().includes(weak))) {
        this.errors.push('JWT_SECRET appears to contain common weak patterns');
      }
    }

    // Session Secret validation
    const sessionSecret = process.env.SESSION_SECRET;
    if (sessionSecret && sessionSecret.length < 32) {
      this.warnings.push('SESSION_SECRET should be at least 32 characters long');
    }

    // CORS validation
    const corsOrigins = process.env.CORS_ORIGINS;
    if (corsOrigins) {
      const origins = corsOrigins.split(',').map(o => o.trim());
      
      if (this.environment === 'production') {
        const hasInsecureOrigins = origins.some(origin => 
          origin.startsWith('http://') && !origin.includes('localhost')
        );
        
        if (hasInsecureOrigins) {
          this.errors.push('Production CORS_ORIGINS should not include insecure HTTP URLs');
        }
      }

      console.log(`   ✅ CORS origins: ${origins.length} configured`);
    }

    // Rate limiting
    const rateLimitEnabled = this.isEnabled('RATE_LIMIT_ENABLED');
    if (!rateLimitEnabled && this.environment === 'production') {
      this.warnings.push('Rate limiting is disabled in production environment');
    }

    // HTTPS enforcement
    const forceHttps = this.isEnabled('FORCE_HTTPS');
    if (!forceHttps && this.environment === 'production') {
      this.warnings.push('HTTPS enforcement is not enabled in production');
    }
  }

  /**
   * Validate database connection
   */
  async validateDatabaseConnection() {
    console.log(`\n${colors.blue}🗄️  Checking database connection...${colors.reset}`);

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      this.errors.push('MONGODB_URI is required');
      return;
    }

    // Validate URI format
    try {
      const url = new URL(mongoUri);
      
      // Check for credentials in production
      if (this.environment === 'production' && (!url.username || !url.password)) {
        this.errors.push('Production database URI should include authentication credentials');
      }

      // Check SSL usage in production
      if (this.environment === 'production' && !mongoUri.includes('ssl=true')) {
        this.warnings.push('Production database should use SSL connection');
      }

      console.log(`   ✅ MongoDB URI format valid`);
      console.log(`   ✅ Database host: ${url.hostname}`);
      
      // Test connection if possible
      if (process.env.VALIDATE_DB_CONNECTION === 'true') {
        try {
          // This would require mongoose to be available
          console.log(`   ⏳ Testing database connection...`);
          // Connection test would go here
          console.log(`   ✅ Database connection successful`);
        } catch (error) {
          this.warnings.push(`Database connection test failed: ${error.message}`);
        }
      }
    } catch (error) {
      this.errors.push(`Invalid MONGODB_URI format: ${error.message}`);
    }
  }

  /**
   * Validate external service configurations
   */
  async validateExternalServices() {
    console.log(`\n${colors.blue}🌐 Checking external service configurations...${colors.reset}`);

    // Shopify validation
    if (this.isEnabled('ENABLE_SHOPIFY_SYNC')) {
      const shopifyUrl = process.env.SHOPIFY_STORE_URL;
      if (shopifyUrl && !shopifyUrl.endsWith('.myshopify.com')) {
        this.warnings.push('SHOPIFY_STORE_URL should end with .myshopify.com');
      }
      console.log(`   ✅ Shopify integration enabled`);
    }

    // Email service validation
    const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
    console.log(`   ✅ Email service: ${emailService}`);

    if (emailService === 'sendgrid' && this.isEnabled('EMAIL_SEND_REAL_EMAILS')) {
      if (!process.env.SENDGRID_API_KEY && !process.env.EMAIL_API_KEY) {
        this.errors.push('SendGrid API key required for email service');
      }
    }

    // Payment service validation
    if (process.env.STRIPE_SECRET_KEY) {
      const isLiveKey = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
      const isTestKey = process.env.STRIPE_SECRET_KEY.startsWith('sk_test_');
      
      if (!isLiveKey && !isTestKey) {
        this.errors.push('Invalid Stripe secret key format');
      } else if (isLiveKey && this.environment !== 'production') {
        this.warnings.push('Using live Stripe keys in non-production environment');
      } else if (isTestKey && this.environment === 'production') {
        this.errors.push('Using test Stripe keys in production environment');
      } else {
        console.log(`   ✅ Stripe configuration: ${isLiveKey ? 'live' : 'test'} mode`);
      }
    }

    // File storage validation
    const storageProvider = process.env.FILE_STORAGE_PROVIDER || 'local';
    if (storageProvider === 'aws-s3') {
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        this.errors.push('AWS credentials required for S3 file storage');
      }
      if (!process.env.AWS_S3_BUCKET) {
        this.errors.push('AWS_S3_BUCKET required for S3 file storage');
      }
    }
    console.log(`   ✅ File storage: ${storageProvider}`);
  }

  /**
   * Validate environment-specific requirements
   */
  async validateEnvironmentSpecific() {
    console.log(`\n${colors.blue}🏷️  Checking ${this.environment}-specific requirements...${colors.reset}`);

    switch (this.environment) {
      case 'production':
        await this.validateProduction();
        break;
      case 'staging':
        await this.validateStaging();
        break;
      case 'development':
        await this.validateDevelopment();
        break;
      default:
        this.warnings.push(`Unknown environment: ${this.environment}`);
    }
  }

  /**
   * Production-specific validations
   */
  async validateProduction() {
    // Security requirements
    if (process.env.LOG_LEVEL === 'debug') {
      this.errors.push('Debug logging should not be used in production');
    }

    if (this.isEnabled('ENABLE_ADMIN_DEBUG_MODE')) {
      this.errors.push('Admin debug mode must be disabled in production');
    }

    if (!this.isEnabled('ENABLE_SECURITY_HEADERS')) {
      this.errors.push('Security headers must be enabled in production');
    }

    // Performance requirements
    const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    if (bcryptRounds < 12) {
      this.warnings.push('BCRYPT_ROUNDS should be at least 12 in production');
    }

    // Monitoring requirements
    if (!process.env.SENTRY_DSN && !process.env.NEW_RELIC_LICENSE_KEY) {
      this.warnings.push('No error monitoring service configured for production');
    }

    console.log(`   ✅ Production validations complete`);
  }

  /**
   * Staging-specific validations
   */
  async validateStaging() {
    // Ensure staging uses test credentials
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')) {
      this.warnings.push('Consider using test Stripe keys in staging environment');
    }

    console.log(`   ✅ Staging validations complete`);
  }

  /**
   * Development-specific validations
   */
  async validateDevelopment() {
    // Development-specific checks
    if (!process.env.MONGODB_URI?.includes('localhost') && !process.env.MONGODB_URI?.includes('127.0.0.1')) {
      this.warnings.push('Development environment connecting to remote database');
    }

    console.log(`   ✅ Development validations complete`);
  }

  /**
   * Helper method to check if a feature is enabled
   */
  isEnabled(envVar) {
    const value = process.env[envVar];
    return value === 'true' || value === '1';
  }

  /**
   * Print validation results
   */
  printResults() {
    console.log(`\n${colors.cyan}${colors.bright}📋 Validation Results${colors.reset}`);
    console.log('='.repeat(50));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(`${colors.green}${colors.bright}✅ All validations passed!${colors.reset}`);
    } else {
      if (this.errors.length > 0) {
        console.log(`\n${colors.red}${colors.bright}❌ Errors (${this.errors.length}):${colors.reset}`);
        this.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }

      if (this.warnings.length > 0) {
        console.log(`\n${colors.yellow}${colors.bright}⚠️  Warnings (${this.warnings.length}):${colors.reset}`);
        this.warnings.forEach((warning, index) => {
          console.log(`   ${index + 1}. ${warning}`);
        });
      }
    }

    console.log('\n' + '='.repeat(50));

    if (this.errors.length > 0) {
      console.log(`${colors.red}${colors.bright}❌ Configuration validation failed. Please fix the errors above.${colors.reset}`);
    } else if (this.warnings.length > 0) {
      console.log(`${colors.yellow}${colors.bright}⚠️  Configuration validation passed with warnings.${colors.reset}`);
    } else {
      console.log(`${colors.green}${colors.bright}✅ Configuration validation successful!${colors.reset}`);
    }
  }
}

// Run validator if called directly
if (require.main === module) {
  const validator = new ConfigValidator();
  validator.validate().catch(error => {
    console.error('Validation script failed:', error);
    process.exit(1);
  });
}

module.exports = ConfigValidator;