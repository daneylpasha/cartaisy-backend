// Comprehensive API Testing Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Simple User model for testing
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// Simple Product model for testing
const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  status: { type: String, default: 'active' },
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Simple Order model for testing
const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalPrice: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// JWT Middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// ====================================
// HEALTH CHECK ENDPOINTS
// ====================================

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ====================================
// AUTHENTICATION ENDPOINTS
// ====================================

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const user = new User({
      name,
      email,
      password: hashedPassword
    });
    
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// Get Profile (Protected)
app.get('/api/auth/profile', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        createdAt: req.user.createdAt
      }
    }
  });
});

// ====================================
// PRODUCT ENDPOINTS
// ====================================

// Get all products
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const products = await Product.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Product.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          count: products.length,
          totalItems: total
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Get single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: { product }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product',
      error: error.message
    });
  }
});

// Create product (Protected)
app.post('/api/products', authenticate, async (req, res) => {
  try {
    const { title, description, price } = req.body;
    
    if (!title || !price) {
      return res.status(400).json({
        success: false,
        message: 'Title and price are required'
      });
    }
    
    const product = new Product({
      title,
      description,
      price
    });
    
    await product.save();
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message
    });
  }
});

// ====================================
// ORDER ENDPOINTS
// ====================================

// Get user orders (Protected)
app.get('/api/customer/orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: { orders }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Create order (Protected)
app.post('/api/customer/orders', authenticate, async (req, res) => {
  try {
    const { totalPrice } = req.body;
    
    if (!totalPrice || totalPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid total price is required'
      });
    }
    
    const orderNumber = 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    
    const order = new Order({
      orderNumber,
      user: req.user._id,
      totalPrice
    });
    
    await order.save();
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// ====================================
// SHOPIFY INTEGRATION ENDPOINTS
// ====================================

app.get('/api/shopify/sync/status', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      lastSync: new Date(),
      status: 'completed',
      message: 'Shopify integration is working'
    }
  });
});

app.post('/api/shopify/sync/full', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Full sync initiated',
    data: {
      syncId: 'sync-' + Date.now(),
      estimatedDuration: '5-10 minutes'
    }
  });
});

// ====================================
// ERROR HANDLING
// ====================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
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
    // Connect to database
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('✅ Database connected');
    } else {
      console.log('⚠️  No MongoDB URI provided');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 API Test Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log('📚 Available endpoints:');
      console.log('  POST /api/auth/register');
      console.log('  POST /api/auth/login');
      console.log('  GET  /api/auth/profile (requires auth)');
      console.log('  GET  /api/products');
      console.log('  GET  /api/products/:id');
      console.log('  POST /api/products (requires auth)');
      console.log('  GET  /api/customer/orders (requires auth)');
      console.log('  POST /api/customer/orders (requires auth)');
      console.log('  GET  /api/shopify/sync/status (requires auth)');
      console.log('  POST /api/shopify/sync/full (requires auth)');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();