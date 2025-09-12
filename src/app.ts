import express, { Application, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { tenantConfig, apiConfig, derivedConfig } from './config/tenant';

const app: Application = express();

// Security Middleware (protects your API)
app.use(helmet()); // Adds security headers
app.use(cors({
  origin: derivedConfig.isProduction 
    ? apiConfig.frontendUrl 
    : '*', // Allow all origins in development
  credentials: true
}));

// Rate limiting (prevents spam/abuse)
const limiter = rateLimit({
  windowMs: tenantConfig.security.rateLimitWindowMs,
  max: tenantConfig.security.rateLimitMaxRequests,
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Trust proxy for Railway/production deployments
app.set('trust proxy', 1);

app.use(`/api/${apiConfig.version}/`, limiter);

// Logging (see all requests in console)
app.use(morgan('combined'));

// Body parsing (handle JSON data from mobile app)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Enhanced health check route
// app.get('/api/health', async (_req: Request, res: Response) => {
//   try {
//     // Check database connection
//     const mongoose = require('mongoose');
//     const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
//     // Get enabled features
//     const enabledFeatures = Object.entries(tenantConfig.features)
//       .filter(([_, enabled]) => enabled)
//       .map(([feature, _]) => feature.replace(/^enable/, '').toLowerCase());
    
//     // Get active integrations
//     const integrations = {
//       shopify: !!tenantConfig.shopify.storeUrl,
//       stripe: !!tenantConfig.payments.stripe.secretKey,
//       paypal: !!tenantConfig.payments.paypal.clientId,
//       email: tenantConfig.email.serviceType,
//       analytics: !!tenantConfig.analytics.googleAnalyticsId
//     };
    
//     res.status(200).json({
//       status: 'success',
//       message: `${tenantConfig.store.name} API is running!`,
//       timestamp: new Date().toISOString(),
//       system: {
//         version: apiConfig.version,
//         environment: apiConfig.nodeEnv,
//         uptime: Math.floor(process.uptime()),
//         memory: {
//           used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
//           total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
//         }
//       },
//       database: {
//         status: dbStatus,
//         name: 'MongoDB'
//       },
//       store: {
//         name: tenantConfig.store.name,
//         domain: tenantConfig.store.domain,
//         currency: tenantConfig.store.currency,
//         country: tenantConfig.store.country
//       },
//       features: enabledFeatures,
//       integrations,
//       api: {
//         baseUrl: tenantConfig.api.baseUrl,
//         version: apiConfig.version,
//         endpoints: [
//           'GET /api/health',
//           'POST /api/v1/auth/register',
//           'POST /api/v1/auth/login',
//           'GET /api/v1/auth/profile',
//           'PATCH /api/v1/auth/profile',
//           'POST /api/v1/auth/change-password',
//           'POST /api/v1/auth/forgot-password',
//           'POST /api/v1/auth/reset-password',
//           'GET /api/v1/products',
//           'GET /api/v1/products/search',
//           'GET /api/v1/products/featured',
//           'GET /api/v1/products/recommendations',
//           'GET /api/v1/customer/wishlists',
//           'GET /api/v1/customer/orders',
//           'GET /api/v1/customer/reviews',
//           'GET /api/v1/customer/search',
//           'GET /api/v1/customer/admin/analytics/dashboard',
//           'GET /api/v1/shopify/sync/status',
//           'POST /api/v1/shopify/sync/full',
//           'POST /api/v1/shopify/sync/incremental',
//           'GET /api/v1/shopify/overview',
//           'GET /api/v1/admin/dashboard',
//           'GET /api/v1/admin/system/health',
//           'POST /api/webhooks/shopify/products/create',
//           'POST /api/webhooks/shopify/orders/create'
//         ]
//       }
//     });
//   } catch (error) {
//     res.status(503).json({
//       status: 'error',
//       message: 'Health check failed',
//       timestamp: new Date().toISOString(),
//       error: apiConfig.nodeEnv === 'development' ? (error as Error).message : 'Service unavailable'
//     });
//   }
// });
app.get('/api/status', async (_req, res) => {
  const mongooseConn = require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ status: 'ok', db: mongooseConn });
});
// Import routes
import authRoutes from './routes/authRoutes';
// Temporarily disable problematic routes for deployment
// import productRoutes from './routes/productRoutes';
// import customerRoutes from './routes/customerRoutes';
// import shopifyRoutes from './routes/shopifyRoutes';
// import webhookRoutes from './routes/webhookRoutes';
// import adminRoutes from './routes/adminRoutes';

// API Routes with versioning - only auth for now
app.use(`/api/${apiConfig.version}/auth`, authRoutes);
// app.use(`/api/${apiConfig.version}/products`, productRoutes);
// app.use(`/api/${apiConfig.version}/customer`, customerRoutes);
// app.use(`/api/${apiConfig.version}/shopify`, shopifyRoutes);
// app.use(`/api/webhooks`, webhookRoutes);
// app.use(`/api/${apiConfig.version}/admin`, adminRoutes);

// Custom error interface
interface CustomError extends Error {
  status?: number;
  stack?: string;
}

// Error handling middleware (catches all errors)
const errorHandler: ErrorRequestHandler = (err: CustomError, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error details:', err);
  
  res.status(err.status || 500).json({
    status: 'error',
    message: derivedConfig.isProduction 
      ? 'Something went wrong!' 
      : err.message,
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