// Simple production server for Railway deployment
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// Environment variables
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cartaisy';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Starting Cartaisy Backend Server...');
console.log('📍 Port:', PORT);
console.log('🌍 Environment:', NODE_ENV);
console.log('💾 MongoDB URI:', MONGODB_URI ? 'Configured' : 'Not configured');

// Basic middleware (simplified for Railway)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.status(200).json({
    status: 'OK',
    message: 'Cartaisy Backend is healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    port: PORT,
    uptime: process.uptime()
  });
});

// Import User model for auth APIs
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User Schema (inline for production)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' },
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Update last login
userSchema.methods.updateLastLogin = async function() {
  this.lastLoginAt = new Date();
  return await this.save();
};

const User = mongoose.model('User', userSchema);

// JWT helper functions
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'default-secret', { expiresIn: '24h' });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET || 'default-refresh-secret', { expiresIn: '7d' });
};

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
    status: '/api/status',
    endpoints: {
      register: '/api/v1/auth/register',
      login: '/api/v1/auth/login',
      health: '/api/health'
    }
  });
});

// Authentication APIs
// User Registration
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, email, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({ name, email, password, role: 'customer' });
    await user.save();

    // Generate tokens
    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    // Return user data without password
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt
    };

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        user: userData,
        token,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Registration failed. Please try again.'
    });
  }
});

// User Login  
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        status: 'error',
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Check password
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Update last login
    await user.updateLastLogin();

    // Generate tokens
    const token = generateToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    // Return user data
    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      lastLoginAt: user.lastLoginAt
    };

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: userData,
        token,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Login failed. Please try again.'
    });
  }
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
    // Don't wait for DB connection - start server first
    connectDB().catch(err => console.log('⚠️ Database connection deferred:', err.message));
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Cartaisy Backend Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`🏥 Health check: http://0.0.0.0:${PORT}/api/health`);
      console.log('✅ Server started successfully!');
    });

    server.on('error', (error) => {
      console.error('❌ Server error:', error.message);
      process.exit(1);
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