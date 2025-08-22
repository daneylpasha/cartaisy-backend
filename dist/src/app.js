"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const tenant_1 = require("./config/tenant");
const app = (0, express_1.default)();
exports.app = app;
// Security Middleware (protects your API)
app.use((0, helmet_1.default)()); // Adds security headers
app.use((0, cors_1.default)({
    origin: tenant_1.derivedConfig.isProduction
        ? tenant_1.apiConfig.frontendUrl
        : '*', // Allow all origins in development
    credentials: true
}));
// Rate limiting (prevents spam/abuse)
const limiter = (0, express_rate_limit_1.default)({
    windowMs: tenant_1.tenantConfig.security.rateLimitWindowMs,
    max: tenant_1.tenantConfig.security.rateLimitMaxRequests,
    message: {
        error: 'Too many requests, please try again later.'
    }
});
app.use(`/api/${tenant_1.apiConfig.version}/`, limiter);
// Logging (see all requests in console)
app.use((0, morgan_1.default)('combined'));
// Body parsing (handle JSON data from mobile app)
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Enhanced health check route
app.get('/api/health', async (_req, res) => {
    try {
        // Check database connection
        const mongoose = require('mongoose');
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        // Get enabled features
        const enabledFeatures = Object.entries(tenant_1.tenantConfig.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => feature.replace(/^enable/, '').toLowerCase());
        // Get active integrations
        const integrations = {
            shopify: !!tenant_1.tenantConfig.shopify.storeUrl,
            stripe: !!tenant_1.tenantConfig.payments.stripe.secretKey,
            paypal: !!tenant_1.tenantConfig.payments.paypal.clientId,
            email: tenant_1.tenantConfig.email.serviceType,
            analytics: !!tenant_1.tenantConfig.analytics.googleAnalyticsId
        };
        res.status(200).json({
            status: 'success',
            message: `${tenant_1.tenantConfig.store.name} API is running!`,
            timestamp: new Date().toISOString(),
            system: {
                version: tenant_1.apiConfig.version,
                environment: tenant_1.apiConfig.nodeEnv,
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
                name: tenant_1.tenantConfig.store.name,
                domain: tenant_1.tenantConfig.store.domain,
                currency: tenant_1.tenantConfig.store.currency,
                country: tenant_1.tenantConfig.store.country
            },
            features: enabledFeatures,
            integrations,
            api: {
                baseUrl: tenant_1.tenantConfig.api.baseUrl,
                version: tenant_1.apiConfig.version,
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
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            message: 'Health check failed',
            timestamp: new Date().toISOString(),
            error: tenant_1.apiConfig.nodeEnv === 'development' ? error.message : 'Service unavailable'
        });
    }
});
// Import routes
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const productRoutes_1 = __importDefault(require("./routes/productRoutes"));
const customerRoutes_1 = __importDefault(require("./routes/customerRoutes"));
const shopifyRoutes_1 = __importDefault(require("./routes/shopifyRoutes"));
const webhookRoutes_1 = __importDefault(require("./routes/webhookRoutes"));
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
// API Routes with versioning
app.use(`/api/${tenant_1.apiConfig.version}/auth`, authRoutes_1.default);
app.use(`/api/${tenant_1.apiConfig.version}/products`, productRoutes_1.default);
app.use(`/api/${tenant_1.apiConfig.version}/customer`, customerRoutes_1.default);
app.use(`/api/${tenant_1.apiConfig.version}/shopify`, shopifyRoutes_1.default);
app.use(`/api/webhooks`, webhookRoutes_1.default); // Webhooks don't use versioning
app.use(`/api/${tenant_1.apiConfig.version}/admin`, adminRoutes_1.default);
// Error handling middleware (catches all errors)
const errorHandler = (err, _req, res, _next) => {
    console.error('Error details:', err);
    res.status(err.status || 500).json({
        status: 'error',
        message: tenant_1.derivedConfig.isProduction
            ? 'Something went wrong!'
            : err.message,
        ...(tenant_1.derivedConfig.isDevelopment && { stack: err.stack })
    });
};
app.use(errorHandler);
// 404 handler (route not found)
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.originalUrl} not found`
    });
});
exports.default = app;
//# sourceMappingURL=app.js.map