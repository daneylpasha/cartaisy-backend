# Cartaisy Multi-Tenant Deployment Guide

This guide explains how to deploy the Cartaisy backend for a new tenant (Shopify store client). Each deployment uses the same codebase but with tenant-specific configuration.

## 📋 Prerequisites

- Node.js 18+ and Yarn
- MongoDB database (cloud or self-hosted)
- Domain name and SSL certificate
- Email service (SMTP, SendGrid, etc.)
- Shopify store (for Shopify integrations)

## 🚀 Quick Deployment

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd cartaisy-backend

# Install dependencies
yarn install

# Copy environment template
cp .env.example .env
```

### 2. Configure Environment

Edit the `.env` file with your tenant-specific values:

```bash
# Required configuration
STORE_NAME="Your Store Name"
MONGODB_URI="mongodb+srv://..."
JWT_SECRET="your-unique-32-char-secret"
EMAIL_FROM_ADDRESS="noreply@yourstore.com"
API_BASE_URL="https://api.yourstore.com"
FRONTEND_URL="https://app.yourstore.com"
```

### 3. Start Server

```bash
# Development
yarn dev

# Production
yarn build
yarn start
```

## ⚙️ Detailed Configuration

### 🏪 Store Information

These settings define your tenant's store identity:

```bash
STORE_NAME="Premium Fashion Store"           # Your store's display name
STORE_DOMAIN="premium-fashion.myshopify.com" # Shopify domain
STORE_LOGO_URL="https://cdn.yourstore.com/logo.png"
STORE_PRIMARY_COLOR="#E91E63"                # Brand color for emails/UI
STORE_CURRENCY="USD"                         # Default currency
STORE_TIMEZONE="America/New_York"            # Store timezone
STORE_COUNTRY="US"                           # ISO country code
```

### 🔐 Security Configuration

**Critical security settings that must be customized:**

```bash
# JWT Secret (REQUIRED - minimum 32 characters)
JWT_SECRET="your-super-secure-random-string-at-least-32-chars-long"

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100    # Max requests per window

# Password requirements
PASSWORD_MIN_LENGTH=6          # Minimum password length
```

### 🛒 Shopify Integration

For Shopify store integrations:

1. Create a private app in your Shopify admin
2. Copy the credentials to your `.env`:

```bash
SHOPIFY_STORE_URL="https://your-store.myshopify.com"
SHOPIFY_API_KEY="your_private_app_key"
SHOPIFY_API_SECRET="your_private_app_secret"
SHOPIFY_WEBHOOK_SECRET="your_webhook_secret"
SHOPIFY_SCOPES="read_products,read_orders,read_customers,write_orders"
```

### 📧 Email Configuration

**Option 1: SMTP (Recommended for most setups)**

```bash
EMAIL_SERVICE_TYPE=smtp
EMAIL_FROM_NAME="Your Store Team"
EMAIL_FROM_ADDRESS="noreply@yourstore.com"
EMAIL_REPLY_TO="support@yourstore.com"

# SMTP Settings
EMAIL_SMTP_HOST="smtp.gmail.com"
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER="your-email@gmail.com"
EMAIL_SMTP_PASS="your-app-password"
EMAIL_SMTP_SECURE=false
```

**Option 2: Email Service (SendGrid, Mailgun, etc.)**

```bash
EMAIL_SERVICE_TYPE=sendgrid
EMAIL_SERVICE_API_KEY="your_sendgrid_api_key"
```

### 💳 Payment Processing

**Stripe Configuration:**

```bash
PAYMENT_DEFAULT_PROVIDER=stripe
STRIPE_PUBLISHABLE_KEY="pk_live_..."  # Use pk_test_ for testing
STRIPE_SECRET_KEY="sk_live_..."       # Use sk_test_ for testing
STRIPE_WEBHOOK_SECRET="whsec_..."
```

**PayPal Configuration:**

```bash
PAYPAL_CLIENT_ID="your_paypal_client_id"
PAYPAL_CLIENT_SECRET="your_paypal_client_secret"
PAYPAL_SANDBOX=false  # Set to true for testing
```

### 📱 Mobile App Configuration

```bash
APP_NAME="Your Store App"
APP_BUNDLE_ID="com.yourstore.app"
APP_DEEP_LINK_SCHEME="yourstore"
APP_VERSION="1.0.0"

# Push notifications
ENABLE_PUSH_NOTIFICATIONS=true
PUSH_NOTIFICATION_KEY="your_fcm_server_key"
```

### 📊 Analytics & Monitoring

```bash
ENABLE_ANALYTICS=true
GOOGLE_ANALYTICS_ID="UA-XXXXXXXX-1"
FACEBOOK_PIXEL_ID="your_facebook_pixel_id"

# Error tracking
ENABLE_ERROR_TRACKING=true
SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"
```

## 🔧 Feature Configuration

Enable/disable features per tenant using feature flags:

```bash
# Business Features
ENABLE_LOYALTY_PROGRAM=true
ENABLE_REVIEWS=true
ENABLE_WISHLIST=true
ENABLE_GUEST_CHECKOUT=true

# Advanced Features
ENABLE_BLOG=false
ENABLE_CHAT=false
ENABLE_SUBSCRIPTIONS=false
ENABLE_AFFILIATES=false
ENABLE_MULTI_LANGUAGE=false
```

## 🏗️ Infrastructure Setup

### Database (MongoDB)

**Option 1: MongoDB Atlas (Recommended)**

1. Create MongoDB Atlas account
2. Create new cluster
3. Create database user
4. Get connection string:
   ```bash
   MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/cartaisy?retryWrites=true&w=majority"
   ```

**Option 2: Self-hosted MongoDB**

```bash
MONGODB_URI="mongodb://username:password@your-mongo-server:27017/cartaisy"
DB_CONNECTION_TIMEOUT=30000
DB_MAX_POOL_SIZE=10
```

### Redis (Optional - for caching/sessions)

```bash
REDIS_ENABLED=true
REDIS_HOST="your-redis-host"
REDIS_PORT=6379
REDIS_PASSWORD="your_redis_password"
REDIS_KEY_PREFIX="cartaisy:tenant1:"
```

### File Storage

**Option 1: Local Storage**

```bash
STORAGE_PROVIDER=local
UPLOAD_PATH="./uploads"
MAX_FILE_SIZE=10485760  # 10MB
```

**Option 2: AWS S3**

```bash
STORAGE_PROVIDER=aws
AWS_ACCESS_KEY_ID="your_aws_access_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret_key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="your-s3-bucket"
```

## 🚢 Production Deployment

### Environment-Specific Settings

**Development:**
```bash
NODE_ENV=development
API_BASE_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3001"
```

**Staging:**
```bash
NODE_ENV=staging
API_BASE_URL="https://api-staging.yourstore.com"
FRONTEND_URL="https://app-staging.yourstore.com"
```

**Production:**
```bash
NODE_ENV=production
API_BASE_URL="https://api.yourstore.com"
FRONTEND_URL="https://app.yourstore.com"
```

### Docker Deployment

1. Build Docker image:
   ```bash
   docker build -t cartaisy-backend .
   ```

2. Run container:
   ```bash
   docker run -d \
     --name cartaisy-backend \
     --env-file .env \
     -p 3000:3000 \
     cartaisy-backend
   ```

### Process Manager (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/server.js --name "cartaisy-backend"

# Save PM2 configuration
pm2 save
pm2 startup
```

## ✅ Configuration Validation

The system automatically validates your configuration on startup:

- **Critical Errors**: Will prevent server from starting
- **Warnings**: Server will start but configuration should be reviewed

### Common Validation Issues

1. **Missing JWT_SECRET**: Generate a secure 32+ character string
2. **Default values**: Replace example values with real ones
3. **Invalid URLs**: Ensure URLs are properly formatted
4. **Email format**: Verify email addresses are valid
5. **Production settings**: Use production credentials in production

### Testing Configuration

```bash
# Start server and check logs
yarn dev

# Test health endpoint
curl http://localhost:3000/api/health

# Test authentication endpoints
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

## 🎯 Tenant-Specific Customization Patterns

### E-commerce Store
```bash
ENABLE_WISHLIST=true
ENABLE_REVIEWS=true
ENABLE_LOYALTY_PROGRAM=true
DEFAULT_SHIPPING_RATE=5.99
FREE_SHIPPING_THRESHOLD=50.00
```

### Subscription Service
```bash
ENABLE_SUBSCRIPTIONS=true
ENABLE_GUEST_CHECKOUT=false
MINIMUM_ORDER_VALUE=9.99
```

### B2B Store
```bash
ENABLE_GUEST_CHECKOUT=false
ENABLE_REVIEWS=false
MINIMUM_ORDER_VALUE=100.00
TAX_RATE=0.0  # Handle tax separately
```

### Marketplace
```bash
ENABLE_AFFILIATES=true
ENABLE_REVIEWS=true
ENABLE_ADVANCED_SEARCH=true
ENABLE_MULTI_LANGUAGE=true
```

## 🔍 Troubleshooting

### Server Won't Start

1. **Configuration errors**: Check logs for validation errors
2. **Database connection**: Verify MongoDB URI and network access
3. **Port conflicts**: Ensure port 3000 is available
4. **Dependencies**: Run `yarn install` to ensure all packages are installed

### Email Not Sending

1. **SMTP credentials**: Verify username/password
2. **Firewall**: Ensure SMTP ports (587/465) are open
3. **Gmail**: Use app passwords, not regular password
4. **Rate limits**: Check if you've hit email service limits

### Authentication Issues

1. **JWT_SECRET**: Ensure it's set and at least 32 characters
2. **CORS**: Verify FRONTEND_URL matches your app domain
3. **Rate limiting**: Check if you've hit rate limits

### Database Issues

1. **Connection string**: Verify MongoDB URI format
2. **Network access**: Ensure database allows connections from your server
3. **Credentials**: Check username/password are correct
4. **Database name**: Ensure database exists or can be created

## 📞 Support

For deployment support:
- Check logs: `yarn dev` or `pm2 logs`
- Validate config: Server logs will show validation warnings/errors
- Test endpoints: Use provided curl commands
- Contact support: Include server logs and configuration (without secrets)

## 🔒 Security Checklist

- [ ] JWT_SECRET is unique and 32+ characters
- [ ] Default passwords changed
- [ ] HTTPS enabled in production
- [ ] Database access restricted
- [ ] Rate limiting configured
- [ ] Error tracking enabled
- [ ] Secrets not committed to version control
- [ ] Production vs test credentials separated
- [ ] CORS properly configured
- [ ] Email templates customized

---

**Ready to deploy?** Follow this guide step by step and your Cartaisy backend will be running smoothly for your tenant! 🚀