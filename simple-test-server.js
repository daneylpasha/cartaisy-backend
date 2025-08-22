// Simple JavaScript server to test API functionality
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Test health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic auth test endpoint
app.post('/api/auth/test', (req, res) => {
  res.json({
    success: true,
    message: 'Auth endpoint responding',
    body: req.body
  });
});

// Basic products test endpoint
app.get('/api/products/test', (req, res) => {
  res.json({
    success: true,
    message: 'Products endpoint responding',
    query: req.query
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection if MongoDB URI is provided
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Database connected');
    } else {
      console.log('⚠️  No MongoDB URI provided, skipping database connection');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Test server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();