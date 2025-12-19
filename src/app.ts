import express, { Application, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { tenantConfig, apiConfig, derivedConfig } from './config/tenant';

// Firebase initialization
import { FirebaseNotificationService } from './services/firebaseNotificationService';
import { notificationScheduler } from './services/notificationScheduler';
import { imageCleanupScheduler } from './services/imageCleanupScheduler';
import { abandonedCartScheduler } from './services/abandonedCartScheduler';

// Log Firebase status on startup
console.log('Firebase Status:', {
  initialized: FirebaseNotificationService.isInitialized(),
  message: FirebaseNotificationService.isInitialized()
    ? 'Push notifications enabled ✅'
    : 'Push notifications disabled (no credentials) ⚠️'
});

// Start notification scheduler
notificationScheduler.start();

// Start image cleanup scheduler
imageCleanupScheduler.start();

// Start abandoned cart scheduler
abandonedCartScheduler.start();

// Security middleware imports
import { strictStoreValidation } from './middleware/strictStoreValidation';
import { queryProtection } from './middleware/queryInjectionProtection';
import { auditLogger } from './middleware/auditLogger';
import { loginLimiter } from './middleware/storeLimiter';

const app: Application = express();

// Security Middleware (protects your API)
app.use(helmet()); // Adds security headers
// CORS: Use function to allow all origins (required for React Native)
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins (mobile apps don't have fixed origin)
    callback(null, true);
  },
  credentials: true
}));

// Trust proxy for Railway/production deployments (must be before rate limiters)
app.set('trust proxy', 1);

// Standard rate limiting (prevents spam/abuse)
const limiter = rateLimit({
  windowMs: tenantConfig.security.rateLimitWindowMs,
  max: tenantConfig.security.rateLimitMaxRequests,
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// More lenient rate limiter for search and read-only endpoints
// Mobile apps frequently hit these endpoints (e.g., search screen opens)
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute (1 per second average)
  message: {
    error: 'Too many search requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Very lenient rate limiter for homescreen/public data (cached on client anyway)
const publicDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 120, // 120 requests per minute
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply lenient rate limiters to specific paths BEFORE the general limiter
app.use(`/api/${apiConfig.version}/customer/search`, searchLimiter);
app.use(`/api/${apiConfig.version}/search`, searchLimiter);
app.use(`/api/${apiConfig.version}/customer/homescreen`, publicDataLimiter);

// Apply general rate limiter to all other API routes
app.use(`/api/${apiConfig.version}/`, limiter);

// Logging (see all requests in console)
app.use(morgan('combined'));

// Body parsing (handle JSON data from mobile app)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// SECURITY MIDDLEWARE
// =============================================================================

// NoSQL injection protection - sanitizes all input
app.use(queryProtection);

// Store ID validation for all API routes (prevents cross-store access)
app.use(`/api/${apiConfig.version}/*`, strictStoreValidation);

// Audit logging for all API routes (async, non-blocking)
app.use(`/api/${apiConfig.version}/*`, auditLogger);

// Stricter rate limiting for auth endpoints
app.use(`/api/${apiConfig.version}/customer/auth/login`, loginLimiter);
app.use(`/api/${apiConfig.version}/customer/auth/register`, loginLimiter);
app.use(`/api/${apiConfig.version}/auth/login`, loginLimiter);
app.use(`/api/${apiConfig.version}/auth/register`, loginLimiter);

// =============================================================================
// HEALTH & MONITORING
// =============================================================================

// Detailed health check route with system info
app.get('/api/health/detailed', async (_req: Request, res: Response) => {
  try {
    // Check database connection
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Get enabled features
    const enabledFeatures = Object.entries(tenantConfig.features)
      .filter(([_, enabled]) => enabled)
      .map(([feature, _]) => feature.replace(/^enable/, '').toLowerCase());

    // Get active integrations
    const integrations = {
      shopify: !!tenantConfig.shopify.storeUrl,
      stripe: !!tenantConfig.payments.stripe.secretKey,
      paypal: !!tenantConfig.payments.paypal.clientId,
      email: tenantConfig.email.serviceType,
      analytics: !!tenantConfig.analytics.googleAnalyticsId
    };

    res.status(200).json({
      status: 'success',
      message: `${tenantConfig.store.name} API is running!`,
      timestamp: new Date().toISOString(),
      system: {
        version: apiConfig.version,
        environment: apiConfig.nodeEnv,
        uptime: Math.floor(process.uptime()),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      database: {
        status: dbStatus,
        name: 'MongoDB'
      },
      store: {
        name: tenantConfig.store.name,
        domain: tenantConfig.store.domain,
        currency: tenantConfig.store.currency,
        country: tenantConfig.store.country
      },
      features: enabledFeatures,
      integrations,
      api: {
        baseUrl: tenantConfig.api.baseUrl,
        version: apiConfig.version,
        endpoints: [
          'GET /api/health',
          'POST /api/v1/auth/register',
          'POST /api/v1/auth/login',
          'GET /api/v1/auth/profile',
          'PATCH /api/v1/auth/profile',
          'POST /api/v1/auth/change-password',
          'POST /api/v1/auth/forgot-password',
          'POST /api/v1/auth/reset-password',
          'GET /api/v1/products',
          'GET /api/v1/products/search',
          'GET /api/v1/products/featured',
          'GET /api/v1/products/recommendations',
          'GET /api/v1/customer/wishlists',
          'GET /api/v1/customer/orders',
          'GET /api/v1/customer/reviews',
          'GET /api/v1/customer/search',
          'GET /api/v1/customer/admin/analytics/dashboard',
          'GET /api/v1/shopify/sync/status',
          'POST /api/v1/shopify/sync/full',
          'POST /api/v1/shopify/sync/incremental',
          'GET /api/v1/shopify/overview',
          'GET /api/v1/admin/dashboard',
          'GET /api/v1/admin/system/health',
          'POST /api/webhooks/shopify/products/create',
          'POST /api/webhooks/shopify/orders/create'
        ]
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      error: apiConfig.nodeEnv === 'development' ? (error as Error).message : 'Service unavailable'
    });
  }
});
// Import routes
import productRoutes from './routes/productRoutes';
import customerRoutes from './routes/customerRoutes';
import shopifyRoutes from './routes/shopifyRoutes';
import shopifyOAuthRoutes from './routes/shopifyOAuthRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';
import carouselRoutes from './routes/carouselRoutes';
import categoryGridRoutes from './routes/categoryGridRoutes';
import calloutBannerRoutes from './routes/calloutBannerRoutes';
import collectionDisplayRoutes from './routes/collectionDisplayRoutes';
import promoBannerRoutes from './routes/promoBannerRoutes';
import categoryCollectionGridRoutes from './routes/categoryCollectionGridRoutes';
import collectionShowcaseRoutes from './routes/collectionShowcaseRoutes';
import recommendationsRoutes from './routes/recommendationsRoutes';
import authRoutes from './routes/authRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import customerAuthRoutes from './routes/customerAuthRoutes';
import customerAddressRoutes from './routes/customerAddressRoutes';
import unifiedCartRoutes from './routes/unifiedCartRoutes';
import orderManagementRoutes from './routes/orderManagementRoutes';
import securityRoutes from './routes/securityRoutes';
import emailConfigRoutes from './routes/emailConfigRoutes';
import pushNotificationRoutes from './routes/pushNotificationRoutes';
import customerManagementRoutes from './routes/customerManagementRoutes';
import abandonedCartRoutes from './routes/abandonedCartRoutes';

// API Routes with versioning
app.use(`/api/${apiConfig.version}/auth`, authRoutes);
app.use(`/api/${apiConfig.version}/products`, productRoutes);
app.use(`/api/${apiConfig.version}/customer`, customerRoutes);
app.use(`/api/${apiConfig.version}/customer/auth`, customerAuthRoutes);
app.use(`/api/${apiConfig.version}/customer/addresses`, customerAddressRoutes);
// Unified cart routes - supports both authenticated customers and guest users
app.use(`/api/${apiConfig.version}/unified-cart`, unifiedCartRoutes);
// IMPORTANT: shopifyOAuthRoutes MUST come before shopifyRoutes
// because shopifyRoutes has router.use(authenticate) which would block the OAuth callback
app.use(`/api/${apiConfig.version}/shopify`, shopifyOAuthRoutes);
app.use(`/api/${apiConfig.version}/shopify`, shopifyRoutes);
// Shopify OAuth callback route (matches Shopify Partner Dashboard redirect URL)
app.use('/api/auth/shopify', shopifyOAuthRoutes);
app.use(`/api/webhooks`, webhookRoutes);
app.use(`/api/${apiConfig.version}/admin`, adminRoutes);
// Order management routes (admin)
app.use(`/api/${apiConfig.version}/admin`, orderManagementRoutes);
// Security monitoring routes (admin)
app.use(`/api/${apiConfig.version}/admin`, securityRoutes);
// Email configuration routes (admin)
app.use(`/api/${apiConfig.version}/admin`, emailConfigRoutes);
// Customer management routes (admin)
app.use(`/api/${apiConfig.version}/admin`, customerManagementRoutes);
// Abandoned cart routes (admin)
app.use(`/api/${apiConfig.version}/admin`, abandonedCartRoutes);
app.use(`/api/${apiConfig.version}`, carouselRoutes);
app.use(`/api/${apiConfig.version}`, categoryGridRoutes);
app.use(`/api/${apiConfig.version}`, calloutBannerRoutes);
app.use(`/api/${apiConfig.version}`, collectionDisplayRoutes);
app.use(`/api/${apiConfig.version}`, promoBannerRoutes);
app.use(`/api/${apiConfig.version}`, categoryCollectionGridRoutes);
app.use(`/api/${apiConfig.version}`, collectionShowcaseRoutes);
app.use(`/api/${apiConfig.version}/recommendations`, recommendationsRoutes);
app.use(`/api/${apiConfig.version}/analytics`, analyticsRoutes);
app.use('/api/analytics', analyticsRoutes); // Also support without version
// Push notification routes (customer)
app.use(`/api/${apiConfig.version}/notifications`, pushNotificationRoutes);

// tsoa generated routes (auto-generated, includes controllers with decorators)
try {
  const { RegisterRoutes } = require('./generated/routes');
  RegisterRoutes(app);
} catch (error) {
  console.warn('tsoa routes not generated yet. Run: npm run generate');
}

// OpenAPI/Swagger documentation
try {
  const swaggerDocument = require('../public/swagger.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'Cartaisy API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  }));
  // Serve raw JSON for Orval
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.json(swaggerDocument);
  });
  console.log('📚 API Docs available at: /api-docs');
} catch (error) {
  console.warn('⚠️ OpenAPI spec not found. Run: npm run generate:spec');
}

// Custom error interface
interface CustomError extends Error {
  status?: number;
  stack?: string;
}

// Error handling middleware (catches all errors)
const errorHandler: ErrorRequestHandler = (err: CustomError, req: Request, res: Response, _next: NextFunction) => {
  console.error('Error details:', err);

  // Determine if error message should be shown to user
  // Show meaningful messages for checkout/payment errors even in production
  const isCheckoutError = req.path.includes('/checkout');
  const isPaymentError = err.message?.includes('payment') ||
                         err.message?.includes('Payment') ||
                         err.message?.includes('Stripe') ||
                         err.message?.includes('card');
  const showMessage = !derivedConfig.isProduction || isCheckoutError || isPaymentError;

  res.status(err.status || 500).json({
    status: 'error',
    message: showMessage ? err.message : 'Something went wrong!',
    ...(derivedConfig.isDevelopment && { stack: err.stack })
  });
};

app.use(errorHandler);

// 404 handler (route not found)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

export { app };
export default app;