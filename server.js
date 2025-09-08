// Simple production server for Railway deployment
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const app = express();

// Environment variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    port: PORT
  });
});

// Basic API routes
app.get('/api/status', (req, res) => {
  res.json({
    message: 'Cartaisy Backend API is running',
    version: '1.0.0',
    environment: NODE_ENV
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Cartaisy Backend API',
    docs: '/api/health',
    status: '/api/status'
  });
});

// Database connection
const connectDB = async () => {
  try {
    if (MONGODB_URI !== 'mongodb://localhost:27017/cartaisy') {
      await mongoose.connect(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 1,
        connectTimeoutMS: 30000
      });
      console.log('🟢 MongoDB connected successfully');
    } else {
      console.log('⚠️ Using default MongoDB URI - database connection skipped');
    }
  } catch (error) {
    console.error('🔴 MongoDB connection failed:', error.message);
    // Don't exit on DB error for initial deployment
    console.log('⚠️ Continuing without database connection...');
  }
};

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
const startServer = async () => {
  try {
    await connectDB();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Cartaisy Backend Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer();