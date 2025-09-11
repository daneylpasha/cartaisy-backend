import app from './app';
import mongoose from 'mongoose';
import { tenantConfig, databaseConfig, apiConfig } from './config/tenant';
import { validateRequiredConfig, logConfigSummary } from './config/validateConfig';

// Validate configuration before starting server
try {
  validateRequiredConfig();
} catch (error) {
  console.error('❌ Configuration validation failed:', (error as Error).message);
  process.exit(1);
}

const PORT = apiConfig.port;
const MONGODB_URI = databaseConfig.mongodbUri;

// Database connection
const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout
    });
    console.log('🟢 MongoDB connected successfully');
    console.log(`📊 Database: ${MONGODB_URI.split('@')[1]?.split('/')[0] || 'localhost'}`);
  } catch (error) {
    console.error('🔴 MongoDB connection failed:', (error as Error).message);
    process.exit(1); // Exit if database connection fails
  }
};

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Log tenant configuration summary
    logConfigSummary();
    
    // Connect to database
    await connectDB();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🚀 =================== SERVER STARTED ===================');
      console.log(`🏪 ${tenantConfig.store.name} API Server`);
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌍 Environment: ${apiConfig.nodeEnv}`);
      console.log(`🔗 Base URL: ${tenantConfig.api.baseUrl}`);
      console.log(`📊 Health check: http://0.0.0.0:${PORT}/api/health`);
      console.log(`🔐 Auth endpoints: http://0.0.0.0:${PORT}/api/${apiConfig.version}/auth/*`);
      
      // Show enabled features
      const enabledFeatures = Object.entries(tenantConfig.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature.replace(/^enable/, ''));
      
      if (enabledFeatures.length > 0) {
        console.log(`✨ Features: ${enabledFeatures.join(', ')}`);
      }
      
      // Show integrations
      const integrations = [];
      if (tenantConfig.shopify.storeUrl) integrations.push('Shopify');
      if (tenantConfig.payments.stripe.secretKey) integrations.push('Stripe');
      if (tenantConfig.email.smtp.user) integrations.push('SMTP Email');
      
      if (integrations.length > 0) {
        console.log(`🔌 Active integrations: ${integrations.join(', ')}`);
      }
      
      console.log('=======================================================\n');
      console.log(`✅ ${tenantConfig.store.name} backend is ready for ${apiConfig.nodeEnv}!`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);
    process.exit(1);
  }
};

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Close database connection
  await mongoose.connection.close();
  console.log('📦 MongoDB connection closed');
  console.log('✅ Graceful shutdown completed');
  process.exit(0);
};

// Handle graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: unknown) => {
  console.error('🔴 Unhandled Rejection:', (err as Error).message);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('🔴 Uncaught Exception:', err.message);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

startServer();