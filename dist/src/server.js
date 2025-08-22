"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const mongoose_1 = __importDefault(require("mongoose"));
const tenant_1 = require("./config/tenant");
const validateConfig_1 = require("./config/validateConfig");
const backgroundJobService_1 = require("./services/backgroundJobService");
// Validate configuration before starting server
try {
    (0, validateConfig_1.validateRequiredConfig)();
}
catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    process.exit(1);
}
const PORT = tenant_1.apiConfig.port;
const MONGODB_URI = tenant_1.databaseConfig.mongodbUri;
// Database connection
const connectDB = async () => {
    try {
        await mongoose_1.default.connect(MONGODB_URI, {
            maxPoolSize: tenant_1.databaseConfig.maxPoolSize,
            minPoolSize: tenant_1.databaseConfig.minPoolSize,
            connectTimeoutMS: tenant_1.databaseConfig.connectionTimeout
        });
        console.log('🟢 MongoDB connected successfully');
        console.log(`📊 Database: ${MONGODB_URI.split('@')[1]?.split('/')[0] || 'localhost'}`);
    }
    catch (error) {
        console.error('🔴 MongoDB connection failed:', error.message);
        process.exit(1); // Exit if database connection fails
    }
};
// Start server
const startServer = async () => {
    try {
        // Log tenant configuration summary
        (0, validateConfig_1.logConfigSummary)();
        // Connect to database
        await connectDB();
        // Initialize background jobs if enabled
        if (tenant_1.tenantConfig.features.enableBackgroundJobs) {
            console.log('🔄 Initializing background job system...');
            (0, backgroundJobService_1.initializeBackgroundJobs)();
        }
        app_1.default.listen(PORT, () => {
            console.log('\n🚀 =================== SERVER STARTED ===================');
            console.log(`🏪 ${tenant_1.tenantConfig.store.name} API Server`);
            console.log(`📡 Port: ${PORT}`);
            console.log(`🌍 Environment: ${tenant_1.apiConfig.nodeEnv}`);
            console.log(`🔗 Base URL: ${tenant_1.tenantConfig.api.baseUrl}`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
            console.log(`🔐 Auth endpoints: http://localhost:${PORT}/api/${tenant_1.apiConfig.version}/auth/*`);
            // Show enabled features
            const enabledFeatures = Object.entries(tenant_1.tenantConfig.features)
                .filter(([_, enabled]) => enabled)
                .map(([feature, _]) => feature.replace(/^enable/, ''));
            if (enabledFeatures.length > 0) {
                console.log(`✨ Features: ${enabledFeatures.join(', ')}`);
            }
            // Show integrations
            const integrations = [];
            if (tenant_1.tenantConfig.shopify.storeUrl)
                integrations.push('Shopify');
            if (tenant_1.tenantConfig.payments.stripe.secretKey)
                integrations.push('Stripe');
            if (tenant_1.tenantConfig.email.smtp.user)
                integrations.push('SMTP Email');
            if (integrations.length > 0) {
                console.log(`🔌 Active integrations: ${integrations.join(', ')}`);
            }
            console.log('=======================================================\n');
            console.log(`✅ ${tenant_1.tenantConfig.store.name} backend is ready for ${tenant_1.apiConfig.nodeEnv}!`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};
// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    // Shutdown background jobs
    if (tenant_1.tenantConfig.features.enableBackgroundJobs) {
        console.log('🔄 Shutting down background jobs...');
        (0, backgroundJobService_1.shutdownBackgroundJobs)();
    }
    // Close database connection
    mongoose_1.default.connection.close(() => {
        console.log('📦 MongoDB connection closed');
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    });
};
// Handle graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('🔴 Unhandled Rejection:', err.message);
    gracefulShutdown('UNHANDLED_REJECTION');
});
// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('🔴 Uncaught Exception:', err.message);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});
startServer();
//# sourceMappingURL=server.js.map