# Cartaisy Backend - Professional E-commerce API Platform

## 🌟 Project Overview

Cartaisy Backend is a comprehensive, enterprise-grade e-commerce API platform designed to power modern mobile and web applications. Built with TypeScript, Node.js, and MongoDB, it provides seamless Shopify integration, advanced mobile optimization, and robust multi-tenant architecture.

### 💡 Value Proposition

- **🚀 Rapid Deployment**: Deploy production-ready e-commerce backends in minutes
- **📱 Mobile-First**: Optimized APIs specifically designed for React Native and mobile apps
- **🔗 Shopify Integration**: Seamless bi-directional sync with Shopify stores
- **🏢 Multi-Tenant**: Support multiple client stores from a single deployment
- **🔒 Enterprise Security**: JWT authentication, rate limiting, and comprehensive security
- **📊 Advanced Analytics**: Built-in tracking, metrics, and business intelligence
- **⚡ Performance**: Optimized for high-traffic mobile commerce applications

## 🏗️ Architecture Overview

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Mobile App        │    │   Web Dashboard     │    │   Admin Panel       │
│   (React Native)    │    │   (React/Next.js)   │    │   (React/Vue)       │
└──────────┬──────────┘    └──────────┬──────────┘    └──────────┬──────────┘
           │                          │                          │
           └─────────────────┬────────────────────────────────────┘
                             │
                ┌─────────────▼──────────────┐
                │      Load Balancer         │
                │     (nginx/CloudFlare)     │
                └─────────────┬──────────────┘
                             │
                ┌─────────────▼──────────────┐
                │    Cartaisy Backend API    │
                │   (Node.js + Express)      │
                │                            │
                │  ┌──────────────────────┐  │
                │  │   Authentication     │  │
                │  │   Product Management │  │
                │  │   Order Processing   │  │
                │  │   User Management    │  │
                │  │   Analytics Engine   │  │
                │  │   Background Jobs    │  │
                │  └──────────────────────┘  │
                └─────────────┬──────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
│   MongoDB       │  │   Shopify API   │  │   Email Service │
│   (Database)    │  │   Integration   │  │   (SendGrid)    │
└────────────────┘  └─────────────────┘  └─────────────────┘
```

## 🚀 Features & Capabilities

### Core E-commerce Features
- ✅ **Product Management**: Complete CRUD with variants, images, SEO optimization
- ✅ **Order Processing**: Full order lifecycle with mobile status tracking
- ✅ **User Management**: Registration, authentication, profiles, preferences
- ✅ **Inventory Management**: Real-time stock levels, reservations, low-stock alerts
- ✅ **Payment Integration**: Ready for Stripe, PayPal, and mobile payment gateways

### Mobile-Optimized Features
- ✅ **Mobile-First APIs**: Optimized response formats for mobile consumption
- ✅ **Push Notifications**: Order updates, promotional campaigns, abandoned cart
- ✅ **Offline Support**: Caching strategies and sync mechanisms
- ✅ **Image Optimization**: Automatic mobile image resizing and CDN integration
- ✅ **Quick Actions**: One-tap ordering, wishlist management, easy checkout

### Shopify Integration
- ✅ **Bi-directional Sync**: Products, customers, orders, inventory
- ✅ **Real-time Webhooks**: Instant updates from Shopify store changes
- ✅ **Bulk Operations**: Mass import/export and bulk updates
- ✅ **Conflict Resolution**: Intelligent handling of sync conflicts
- ✅ **Custom Fields**: Support for metafields and custom attributes

### Business Intelligence
- ✅ **Advanced Analytics**: Customer behavior, conversion tracking, sales metrics
- ✅ **Recommendation Engine**: AI-powered product recommendations
- ✅ **A/B Testing**: Built-in experimentation framework
- ✅ **Reporting Dashboard**: Real-time business metrics and KPIs
- ✅ **Customer Segmentation**: Automated customer grouping and targeting

### Enterprise Features
- ✅ **Multi-tenant Architecture**: Isolated data and configurations per client
- ✅ **Role-based Access Control**: Granular permissions and user roles
- ✅ **API Rate Limiting**: Configurable rate limiting and throttling
- ✅ **Audit Logging**: Comprehensive activity tracking and compliance
- ✅ **Backup & Recovery**: Automated backups and disaster recovery

## 🛠️ Technology Stack

### Backend Framework
- **Node.js 18+** - Runtime environment
- **TypeScript 5+** - Type-safe development
- **Express.js 5** - Web framework with enhanced performance
- **Mongoose 8** - MongoDB object modeling

### Database & Storage
- **MongoDB 7+** - Primary database with advanced indexing
- **Redis** - Caching and session management (optional)
- **AWS S3/CloudFlare** - File storage and CDN (configurable)

### Authentication & Security
- **JWT Tokens** - Stateless authentication
- **bcryptjs** - Password hashing
- **Helmet.js** - Security headers
- **express-rate-limit** - DDoS protection

### Integrations
- **Shopify Admin API** - E-commerce platform integration
- **SendGrid/Mailgun** - Email services
- **Stripe/PayPal** - Payment processing
- **Twilio** - SMS notifications

### Development & Deployment
- **Jest** - Testing framework
- **ESLint + Prettier** - Code quality
- **Docker** - Containerization
- **GitHub Actions** - CI/CD pipelines
- **PM2** - Process management

## 📋 Installation Requirements

### System Requirements
- **Node.js**: 18.0.0 or higher
- **npm/yarn**: Latest stable version
- **MongoDB**: 5.0+ (Atlas recommended for production)
- **Memory**: Minimum 2GB RAM (4GB+ recommended)
- **Storage**: 10GB+ available space
- **Network**: Reliable internet for Shopify API calls

### Development Environment
```bash
# Check Node.js version
node --version  # Should be 18.0.0+

# Check npm version
npm --version   # Should be 8.0.0+

# Verify MongoDB access (if local)
mongosh --version
```

## 🔧 Quick Setup Guide

### 1. Clone and Install
```bash
# Clone repository
git clone https://github.com/your-org/cartaisy-backend.git
cd cartaisy-backend

# Install dependencies
npm install
# or
yarn install
```

### 2. Environment Configuration
```bash
# Copy environment template
cp .env.template.development .env

# Edit configuration
nano .env
```

### 3. Database Setup
```bash
# Option A: MongoDB Atlas (Recommended)
# - Create cluster at https://cloud.mongodb.com
# - Get connection string
# - Add to MONGODB_URI in .env

# Option B: Local MongoDB
# - Install MongoDB locally
# - Start service: brew services start mongodb-community
# - Use: mongodb://localhost:27017/cartaisy-dev
```

### 4. Start Development Server
```bash
# Development mode with hot reload
npm run dev

# Production build and start
npm run build
npm start

# Run tests
npm test
```

### 5. Verify Installation
```bash
# Health check
curl http://localhost:3000/api/health

# Expected response:
{
  "success": true,
  "message": "API Server is running",
  "database": "connected"
}
```

## ⚙️ Configuration Guide

### Environment Variables
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | Yes | development |
| `PORT` | Server port | No | 3000 |
| `MONGODB_URI` | Database connection | Yes | - |
| `JWT_SECRET` | JWT signing key | Yes | - |
| `SHOPIFY_API_KEY` | Shopify app key | No | - |
| `EMAIL_API_KEY` | Email service key | No | - |

See [Environment Templates](docs/environment-templates.md) for complete reference.

### Feature Flags
```env
# Enable/disable features
ENABLE_SHOPIFY_SYNC=true
ENABLE_BACKGROUND_JOBS=true
ENABLE_ANALYTICS=true
ENABLE_PUSH_NOTIFICATIONS=false
```

## 📚 API Documentation

### Authentication
```bash
# Register user
POST /api/auth/register
Content-Type: application/json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}

# Login
POST /api/auth/login
Content-Type: application/json
{
  "email": "john@example.com",
  "password": "securepassword"
}

# Access protected routes
GET /api/auth/profile
Authorization: Bearer your-jwt-token
```

### Products
```bash
# Get products (public)
GET /api/products?page=1&limit=10&search=mobile

# Get single product
GET /api/products/:id

# Create product (authenticated)
POST /api/products
Authorization: Bearer your-jwt-token
Content-Type: application/json
{
  "title": "Product Name",
  "price": 29.99,
  "description": "Product description"
}
```

For complete API documentation, see [API-REFERENCE.md](docs/API-REFERENCE.md).

## 🚀 Deployment Instructions

### Production Deployment
1. **Server Setup**: Ubuntu 20.04+ with Node.js 18+
2. **Database**: MongoDB Atlas cluster (recommended)
3. **SSL**: Configure HTTPS with Let's Encrypt
4. **Process Manager**: Use PM2 for production
5. **Monitoring**: Set up health checks and logging

### Quick Deploy with Docker
```bash
# Build and run with Docker
docker build -t cartaisy-backend .
docker run -p 3000:3000 --env-file .env cartaisy-backend

# Or use Docker Compose
docker-compose up -d
```

### Deploy to Cloud Platforms
- **Heroku**: One-click deployment with MongoDB Atlas
- **AWS**: ECS or Elastic Beanstalk deployment
- **DigitalOcean**: App Platform deployment
- **Vercel**: Serverless deployment option

Detailed deployment guides: [DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 📊 Monitoring & Health Checks

### Health Check Endpoints
- `GET /api/health` - Basic server health
- `GET /api/health/detailed` - Comprehensive system status
- `GET /api/health/database` - Database connectivity
- `GET /api/health/shopify` - Shopify API status

### Monitoring Setup
```bash
# Install monitoring tools
npm install --save @sentry/node @sentry/integrations

# Configure application monitoring
# See monitoring setup in DEPLOYMENT.md
```

## 🔒 Security Features

- **JWT Authentication** with configurable expiration
- **Password Hashing** using bcrypt with salt rounds
- **Rate Limiting** to prevent abuse and DDoS
- **CORS Configuration** for cross-origin security
- **Input Validation** with comprehensive sanitization
- **SQL Injection Prevention** through Mongoose ODM
- **Security Headers** via Helmet.js middleware

## 🐛 Troubleshooting Guide

### Common Issues

#### Database Connection Failed
```bash
# Check MongoDB URI format
# Correct: mongodb+srv://user:pass@cluster.mongodb.net/dbname
# Verify network access and credentials
```

#### Shopify API Errors
```bash
# Verify API credentials in .env
# Check Shopify app permissions
# Confirm webhook endpoints are accessible
```

#### Performance Issues
```bash
# Monitor memory usage: npm run monitor
# Check database indexes: npm run db:analyze
# Review slow query logs
```

### Debug Mode
```bash
# Enable detailed logging
DEBUG=cartaisy:* npm run dev

# API request logging
NODE_ENV=development npm run dev
```

## 📞 Support & Maintenance

### Documentation Resources
- [API Reference](docs/API-REFERENCE.md)
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Client Onboarding](docs/CLIENT-ONBOARDING.md) — **superseded (2026-07-23)**; see `docs/DECISIONS.md`

### Support Channels
- **Documentation**: Comprehensive guides and examples
- **Issue Tracker**: GitHub issues for bug reports
- **Community**: Discord/Slack for discussions
- **Enterprise Support**: Priority support for enterprise clients

### Maintenance Schedule
- **Security Updates**: Monthly security patches
- **Feature Updates**: Quarterly feature releases
- **LTS Support**: Long-term support for stable versions
- **Migration Assistance**: Guided upgrades and migrations

## 📈 Performance Metrics

### Expected Performance
- **Response Time**: < 200ms for 95% of requests
- **Throughput**: 1000+ requests/minute per instance
- **Availability**: 99.9% uptime SLA
- **Scalability**: Horizontal scaling to 100+ instances

### Optimization Features
- **Database Indexing**: Optimized queries and indexes
- **Response Caching**: Intelligent caching strategies
- **Connection Pooling**: Efficient database connections
- **Background Processing**: Async job processing

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Airbnb configuration with custom rules
- **Prettier**: Automated code formatting
- **Testing**: Jest unit and integration tests
- **Documentation**: JSDoc comments for all functions

---

## 🚀 Quick Start

### 1. Setup Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials:
# - MONGODB_URI
# - JWT_SECRET
# - SHOPIFY_SHOP_DOMAIN
# - SHOPIFY_STOREFRONT_ACCESS_TOKEN
```

### 2. Install & Run

```bash
npm install
npm run generate  # Generate TSOA routes
npm run dev       # Start development server
```

### 3. Verify

- API Docs: http://localhost:3000/api-docs
- Test endpoint: `curl http://localhost:3000/api/v1/customer/homescreen`

---

## 📚 Documentation

- **[API.md](API.md)** - Complete API reference
- **[MIGRATION.md](MIGRATION.md)** - React Native migration guide
- **[CLAUDE.md](CLAUDE.md)** - Architecture and development guidelines

---

## 🔐 Shopify Setup

**Required:** Storefront Access Token (NOT API Key/Secret)

1. Shopify Admin → Settings → Apps and sales channels
2. "Develop apps" → Create custom app
3. Configure "Storefront API" scopes (read_products, read_collections)
4. Generate **Storefront Access Token**
5. Add to `.env`: `SHOPIFY_STOREFRONT_ACCESS_TOKEN=<your_token>`

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Database powered by [MongoDB](https://www.mongodb.com/)
- Shopify integration via [Shopify API](https://shopify.dev/)
- TypeScript for enhanced developer experience

---

**Ready to transform your e-commerce business?** 
Get started with Cartaisy Backend today and build the mobile commerce experience your customers deserve.

For enterprise inquiries and custom implementations, contact our team at enterprise@cartaisy.com
