// import app from './app';
// import mongoose from 'mongoose';
// import { tenantConfig, databaseConfig, apiConfig } from './config/tenant';
// import { validateRequiredConfig, logConfigSummary } from './config/validateConfig';

// // Validate configuration before starting server
// try {
//   validateRequiredConfig();
// } catch (error) {
//   console.error('❌ Configuration validation failed:', (error as Error).message);
//   process.exit(1);
// }

// const PORT = apiConfig.port;
// const MONGODB_URI = databaseConfig.mongodbUri;

// // Database connection
// const connectDB = async (): Promise<void> => {
//   try {
//     await mongoose.connect(MONGODB_URI, {
//       maxPoolSize: databaseConfig.maxPoolSize,
//       minPoolSize: databaseConfig.minPoolSize,
//       connectTimeoutMS: databaseConfig.connectionTimeout
//     });
//     console.log('🟢 MongoDB connected successfully');
//     console.log(`📊 Database: ${MONGODB_URI.split('@')[1]?.split('/')[0] || 'localhost'}`);
//   } catch (error) {
//     console.error('🔴 MongoDB connection failed:', (error as Error).message);
//     process.exit(1); // Exit if database connection fails
//   }
// };

// // Start server
// const startServer = async (): Promise<void> => {
//   try {
//     // Log tenant configuration summary
//     logConfigSummary();
    
//     // Connect to database
//     await connectDB();
    
//     app.listen(PORT, '0.0.0.0', () => {
//       console.log('\n🚀 =================== SERVER STARTED ===================');
//       console.log(`🏪 ${tenantConfig.store.name} API Server`);
//       console.log(`📡 Port: ${PORT}`);
//       console.log(`🌍 Environment: ${apiConfig.nodeEnv}`);
//       console.log(`🔗 Base URL: ${tenantConfig.api.baseUrl}`);
//       console.log(`📊 Health check: http://0.0.0.0:${PORT}/api/health`);
//       console.log(`🔐 Auth endpoints: http://0.0.0.0:${PORT}/api/${apiConfig.version}/auth/*`);
      
//       // Show enabled features
//       const enabledFeatures = Object.entries(tenantConfig.features)
//         .filter(([_, enabled]) => enabled)
//         .map(([feature, _]) => feature.replace(/^enable/, ''));
      
//       if (enabledFeatures.length > 0) {
//         console.log(`✨ Features: ${enabledFeatures.join(', ')}`);
//       }
      
//       // Show integrations
//       const integrations = [];
//       if (tenantConfig.shopify.storeUrl) integrations.push('Shopify');
//       if (tenantConfig.payments.stripe.secretKey) integrations.push('Stripe');
//       if (tenantConfig.email.smtp.user) integrations.push('SMTP Email');
      
//       if (integrations.length > 0) {
//         console.log(`🔌 Active integrations: ${integrations.join(', ')}`);
//       }
      
//       console.log('=======================================================\n');
//       console.log(`✅ ${tenantConfig.store.name} backend is ready for ${apiConfig.nodeEnv}!`);
//     });
//   } catch (error) {
//     console.error('❌ Failed to start server:', (error as Error).message);
//     process.exit(1);
//   }
// };

// // Graceful shutdown handling
// const gracefulShutdown = async (signal: string) => {
//   console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
//   // Close database connection
//   await mongoose.connection.close();
//   console.log('📦 MongoDB connection closed');
//   console.log('✅ Graceful shutdown completed');
//   process.exit(0);
// };

// // Handle graceful shutdown signals
// process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
// process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// // Handle unhandled promise rejections
// process.on('unhandledRejection', (err: unknown) => {
//   console.error('🔴 Unhandled Rejection:', (err as Error).message);
//   gracefulShutdown('UNHANDLED_REJECTION');
// });

// // Handle uncaught exceptions
// process.on('uncaughtException', (err: Error) => {
//   console.error('🔴 Uncaught Exception:', err.message);
//   gracefulShutdown('UNCAUGHT_EXCEPTION');
// });

// startServer();
// server.ts
// server.ts
import express from 'express';
import mongoose from 'mongoose';
import { tenantConfig, databaseConfig, apiConfig } from './config/tenant';
import { validateRequiredConfig, logConfigSummary } from './config/validateConfig';

const PORT = Number(process.env.PORT) || Number(apiConfig.port) || 3000;
const MONGODB_URI = databaseConfig.mongodbUri;

// 1) Make a lightweight server wrapper
const server = express();

// liveness flag
let isReady = false;

// 2) Health routes FIRST (always 200 on /api/health)
server.get('/api/health', (_req, res) => {
  console.log('💗 HEALTH HIT');
  res.status(200).json({ status: 'ok', ready: isReady });
});

// (optional) readiness with DB check
server.get('/api/ready', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ready' : 'not-ready' });
});

// 3) Start server immediately (don’t block on DB)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on ${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/api/health`);
});

// 4) Now do the heavy work in background
(async () => {
  try {
    validateRequiredConfig();
    logConfigSummary();

    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: databaseConfig.maxPoolSize,
      minPoolSize: databaseConfig.minPoolSize,
      connectTimeoutMS: databaseConfig.connectionTimeout,
      serverSelectionTimeoutMS: databaseConfig.connectionTimeout,
    });
    console.log('🟢 MongoDB connected');

    // dynamic import AFTER DB so app.ts side-effects don't block startup
    const { default: app } = await import('./app');

    // mount your actual app under /
    server.use(app);

    isReady = true;
    console.log(`✅ ${tenantConfig.store.name} backend is ready for ${apiConfig.nodeEnv}`);
  } catch (err: any) {
    console.error('❌ Startup error:', err?.message || err);
    // do NOT exit — keep healthcheck alive
  }
})();

// graceful shutdown
const shutdown = async (sig: string) => {
  console.log(`🛑 ${sig} received. Shutting down...`);
  try { await mongoose.connection.close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e: any) => { console.error('UNHANDLED REJECTION', e?.message || e); });
process.on('uncaughtException', (e: any) => { console.error('UNCAUGHT EXCEPTION', e?.message || e); });

