# Client Onboarding Guide - Cartaisy Backend

> **⚠️ SUPERSEDED (2026-07-23) — do not follow this guide.** It describes the
> retired pre-SaaS model (per-client backend deployments, manually created
> Shopify private apps, hand-entered Admin tokens, per-client cloud choices).
> The current onboarding sources of truth are: dashboard repo
> `docs/DASHBOARD_ONBOARDING_FLOW.md` (merchant-facing flow), mobile repo
> `docs/MOBILE_MERCHANT_PROVISIONING_RUNBOOK.md` (Cartaisy-side provisioning),
> and `docs/cartaisy/ROADMAP.md` Phase 6 (onboarding productization). See the
> 2026-07-23 decision "Legacy CLIENT-ONBOARDING.md is superseded by the SaaS
> onboarding flow" in `docs/DECISIONS.md`. A docs-only ticket will rewrite or
> stub this file; until then this banner is the authoritative warning.

This comprehensive guide walks clients through the complete onboarding process for deploying and configuring their Cartaisy Backend instance.

## Pre-Deployment Client Questionnaire

Please provide the following information before we begin your deployment:

### 🏢 Business Information
- **Company Name**: ________________________________
- **Primary Contact**: ______________________________
- **Technical Contact**: ____________________________
- **Project Timeline**: _____________________________
- **Go-Live Date**: ________________________________

### 🛍️ E-commerce Requirements
- **Existing Shopify Store URL**: ___________________
- **Expected Daily Orders**: _______________________
- **Peak Traffic Periods**: _________________________
- **Product Catalog Size**: _________________________
- **Mobile App Launch Date**: ______________________

### 🎨 Branding & Customization
- **Brand Colors (Primary/Secondary)**: ______________
- **Logo Files**: ___________________________________
- **Custom Domain**: _______________________________
- **Email Domain**: ________________________________
- **Support Email**: _______________________________

### 📱 Technical Specifications
- **Mobile Platform(s)**: ___________________________
- **Expected Concurrent Users**: ____________________
- **Preferred Cloud Provider**: _____________________
- **Budget Range**: ________________________________
- **Compliance Requirements**: ______________________

## Shopify Store Requirements and Setup

### Minimum Shopify Plan Requirements
- **Shopify Plan**: Basic ($29/month) or higher
- **Admin API Access**: Required
- **Custom App Creation**: Enabled
- **Webhook Configuration**: Required

### Shopify Store Preparation Checklist

#### ✅ Store Configuration
- [ ] Store is active and accessible
- [ ] Products are properly categorized
- [ ] Inventory tracking is enabled
- [ ] Tax settings are configured
- [ ] Shipping zones are set up
- [ ] Payment gateways are active

#### ✅ Content Requirements
- [ ] Product descriptions are complete
- [ ] High-quality product images uploaded
- [ ] SEO titles and descriptions added
- [ ] Collections are organized
- [ ] Navigation menus are configured

#### ✅ Policy Pages
- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] Refund Policy published
- [ ] Shipping Policy published

## Required Shopify App Permissions

### 🔑 API Permissions Needed

When creating the Shopify private app, ensure these permissions are enabled:

#### **Read Permissions**
- `read_products` - Access product catalog
- `read_customers` - Access customer data
- `read_orders` - Access order information
- `read_inventory` - Access inventory levels
- `read_locations` - Access store locations
- `read_price_rules` - Access discount codes
- `read_script_tags` - Access script tags
- `read_themes` - Access theme files

#### **Write Permissions**
- `write_products` - Update product information
- `write_customers` - Update customer data
- `write_orders` - Create and update orders
- `write_inventory` - Update inventory levels
- `write_script_tags` - Install tracking scripts

#### **Webhook Permissions**
- All webhook events for real-time synchronization

### 🔧 Shopify App Creation Process

1. **Access Admin Panel**
   ```
   Navigate to: https://your-store.myshopify.com/admin
   ```

2. **Create Private App**
   ```
   Settings > Apps and sales channels > Develop apps > Create an app
   ```

3. **Configure App Details**
   ```
   App name: "Cartaisy Mobile Backend"
   App URL: https://your-domain.com
   ```

4. **Set API Permissions**
   - Configure Admin API scopes (listed above)
   - Enable Storefront API access
   - Set webhook endpoints

5. **Generate API Credentials**
   - Note down API Key
   - Note down API Secret
   - Generate Access Token

## API Key Generation Process

### 🔐 Step-by-Step API Key Setup

#### 1. Shopify API Keys
```bash
# Required Shopify credentials:
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_ACCESS_TOKEN=your_access_token_here
SHOPIFY_STORE_URL=your-store.myshopify.com
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_here
```

#### 2. JWT Secret Generation
```bash
# Generate secure JWT secret (run on server)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 3. Email Service API Keys

**SendGrid Setup:**
```bash
# 1. Create SendGrid account: https://sendgrid.com
# 2. Navigate to: Settings > API Keys
# 3. Create new API key with full access
# 4. Copy the generated key

EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=SG.your_sendgrid_api_key_here
EMAIL_FROM=noreply@yourdomain.com
```

**Mailgun Setup:**
```bash
# 1. Create Mailgun account: https://mailgun.com
# 2. Navigate to: Domains > API Keys
# 3. Copy Domain and Private API key

EMAIL_SERVICE=mailgun
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=mg.yourdomain.com
EMAIL_FROM=noreply@yourdomain.com
```

#### 4. Database Connection String
```bash
# MongoDB Atlas connection string format:
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority

# Self-hosted MongoDB:
MONGODB_URI=mongodb://username:password@localhost:27017/cartaisy_production
```

## Brand Customization Options

### 🎨 Visual Branding Configuration

#### 1. Color Scheme Customization
```env
# Primary brand colors
BRAND_PRIMARY_COLOR=#1a73e8
BRAND_SECONDARY_COLOR=#34a853
BRAND_ACCENT_COLOR=#fbbc04
BRAND_BACKGROUND_COLOR=#ffffff
BRAND_TEXT_COLOR=#202124
```

#### 2. Logo Configuration
```env
# Logo URLs (recommended: CDN hosted)
BRAND_LOGO_URL=https://cdn.yourdomain.com/logo.png
BRAND_LOGO_DARK_URL=https://cdn.yourdomain.com/logo-dark.png
BRAND_FAVICON_URL=https://cdn.yourdomain.com/favicon.ico
```

#### 3. Email Template Branding
```env
# Email template customization
EMAIL_TEMPLATE_HEADER_COLOR=#1a73e8
EMAIL_TEMPLATE_BUTTON_COLOR=#34a853
EMAIL_TEMPLATE_FOOTER_COLOR=#f8f9fa
```

### 📱 Mobile App Branding

#### 1. App Configuration
```json
{
  "appName": "Your Store Name",
  "appTagline": "Your Store Tagline",
  "primaryColor": "#1a73e8",
  "secondaryColor": "#34a853",
  "logoUrl": "https://cdn.yourdomain.com/app-logo.png",
  "splashScreenUrl": "https://cdn.yourdomain.com/splash.png"
}
```

#### 2. Push Notification Branding
```env
# Push notification configuration
PUSH_NOTIFICATION_ICON=https://cdn.yourdomain.com/push-icon.png
PUSH_NOTIFICATION_SOUND=default
PUSH_NOTIFICATION_SENDER_ID=your_fcm_sender_id
```

## Email Service Configuration

### 📧 SendGrid Configuration

#### 1. Account Setup
```bash
# 1. Sign up: https://sendgrid.com/free
# 2. Complete sender verification
# 3. Configure domain authentication
# 4. Create API key with full access
```

#### 2. Email Templates
```bash
# Create these email templates in SendGrid:
- welcome_email (User registration welcome)
- order_confirmation (Order placed confirmation)
- order_shipped (Shipping notification)
- order_delivered (Delivery confirmation)
- password_reset (Password reset instructions)
- promotional_email (Marketing campaigns)
```

#### 3. Configuration Variables
```env
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=SG.your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Your Store Name
SENDGRID_TEMPLATE_WELCOME=d-template_id_here
SENDGRID_TEMPLATE_ORDER_CONFIRMATION=d-template_id_here
```

### 📧 Alternative: Mailgun Configuration

```env
EMAIL_SERVICE=mailgun
MAILGUN_API_KEY=your_private_key_here
MAILGUN_DOMAIN=mg.yourdomain.com
MAILGUN_HOST=api.mailgun.net
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Your Store Name
```

## Mobile App Configuration Requirements

### 📱 React Native App Setup

#### 1. Environment Configuration
```javascript
// config/environment.js
export const API_CONFIG = {
  BASE_URL: 'https://api.yourdomain.com',
  API_VERSION: 'v1',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
};

export const SHOPIFY_CONFIG = {
  STORE_URL: 'your-store.myshopify.com',
  STOREFRONT_TOKEN: 'your_storefront_access_token'
};
```

#### 2. Authentication Configuration
```javascript
// config/auth.js
export const AUTH_CONFIG = {
  JWT_STORAGE_KEY: 'cartaisy_jwt_token',
  REFRESH_TOKEN_KEY: 'cartaisy_refresh_token',
  SESSION_TIMEOUT: 604800000, // 7 days
  AUTO_LOGIN: true
};
```

#### 3. Push Notification Setup
```javascript
// config/notifications.js
export const NOTIFICATION_CONFIG = {
  FCM_SENDER_ID: 'your_fcm_sender_id',
  VAPID_KEY: 'your_vapid_key',
  BADGE_ICON: 'notification_icon',
  DEFAULT_SOUND: 'default'
};
```

### 🔔 Push Notification Configuration

#### 1. Firebase Setup
```bash
# 1. Create Firebase project: https://console.firebase.google.com
# 2. Add Android/iOS apps
# 3. Download config files:
#    - google-services.json (Android)
#    - GoogleService-Info.plist (iOS)
# 4. Enable Cloud Messaging
```

#### 2. Server Configuration
```env
# Firebase Cloud Messaging
FCM_SERVER_KEY=your_fcm_server_key
FCM_SENDER_ID=your_fcm_sender_id

# Apple Push Notifications (iOS)
APNS_KEY_ID=your_apns_key_id
APNS_TEAM_ID=your_apple_team_id
APNS_PRIVATE_KEY_PATH=/path/to/apns_private_key.p8
```

## Testing and Go-Live Checklist

### 🧪 Pre-Launch Testing

#### ✅ API Testing
- [ ] Authentication endpoints functional
- [ ] Product catalog sync working
- [ ] Order processing complete
- [ ] Payment integration tested
- [ ] Email notifications sending
- [ ] Push notifications working
- [ ] Error handling appropriate

#### ✅ Shopify Integration Testing
- [ ] Product sync (Shopify → Backend)
- [ ] Customer sync (Shopify → Backend)
- [ ] Order sync (Backend → Shopify)
- [ ] Inventory sync bidirectional
- [ ] Webhook endpoints responding
- [ ] Real-time updates working

#### ✅ Mobile App Testing
- [ ] App builds successfully
- [ ] Authentication flow complete
- [ ] Product browsing functional
- [ ] Cart and checkout working
- [ ] Order tracking operational
- [ ] Push notifications received
- [ ] Offline functionality tested

#### ✅ Performance Testing
- [ ] Load testing completed
- [ ] Response times acceptable (<2s)
- [ ] Database queries optimized
- [ ] Memory usage within limits
- [ ] Error rates under 1%

### 🚀 Go-Live Deployment

#### ✅ Production Checklist
- [ ] SSL certificate installed
- [ ] Custom domain configured
- [ ] Database backups automated
- [ ] Monitoring systems active
- [ ] Error tracking enabled
- [ ] Log aggregation configured
- [ ] CDN configured for assets
- [ ] Rate limiting enabled

#### ✅ Security Verification
- [ ] Environment variables secured
- [ ] API rate limiting configured
- [ ] CORS settings restrictive
- [ ] Input validation comprehensive
- [ ] SQL injection prevention active
- [ ] XSS protection enabled
- [ ] HTTPS enforced everywhere

## Training Materials Overview

### 📚 Admin Dashboard Training

#### 1. Order Management
- View and manage orders
- Update order status
- Process refunds and returns
- Generate shipping labels
- Track delivery status

#### 2. Product Management
- Add/edit products
- Manage inventory levels
- Configure product variants
- Update pricing and promotions
- Optimize SEO settings

#### 3. Customer Management
- View customer profiles
- Manage customer support tickets
- Configure customer segments
- Send targeted communications
- Analyze customer behavior

#### 4. Analytics and Reporting
- Sales performance metrics
- Customer acquisition reports
- Product performance analysis
- Revenue forecasting
- Conversion rate optimization

### 📱 Mobile App User Guide

#### 1. Customer Features
- Account registration/login
- Product browsing and search
- Shopping cart management
- Secure checkout process
- Order tracking and history
- Wishlist management
- Push notification preferences

#### 2. Store Staff Features
- Inventory management
- Order fulfillment
- Customer support chat
- Product updates
- Promotional campaigns
- Analytics dashboard

## Support Escalation Process

### 🆘 Support Tiers

#### **Tier 1: Self-Service**
- Documentation portal
- FAQ database
- Video tutorials
- Community forums
- Knowledge base articles

#### **Tier 2: Standard Support**
- Email support (24-48 hour response)
- Chat support (business hours)
- Bug reports and feature requests
- Configuration assistance
- Basic troubleshooting

#### **Tier 3: Priority Support**
- Phone support (4-hour response)
- Video consultations
- Screen sharing sessions
- Custom development requests
- Performance optimization
- Emergency hotline

#### **Tier 4: Enterprise Support**
- Dedicated account manager
- 24/7 technical support
- Custom SLA agreements
- Priority bug fixes
- On-site support available
- Architecture consulting

### 📞 Contact Information

#### **Support Channels**
- **Documentation**: https://docs.cartaisy.com
- **Email Support**: support@cartaisy.com
- **Priority Support**: priority@cartaisy.com
- **Emergency Hotline**: +1-XXX-XXX-XXXX
- **Status Page**: https://status.cartaisy.com

#### **Response Time SLAs**
| Support Tier | Response Time | Resolution Time |
|--------------|---------------|-----------------|
| Self-Service | Immediate | Self-guided |
| Standard | 24-48 hours | 3-5 business days |
| Priority | 4 hours | 24 hours |
| Enterprise | 1 hour | 4 hours |

### 🔄 Escalation Workflow

1. **Initial Contact**: Submit ticket with detailed description
2. **Triage**: Support team categorizes and prioritizes
3. **Assignment**: Ticket routed to appropriate specialist
4. **Resolution**: Issue investigated and resolved
5. **Follow-up**: Customer satisfaction confirmation
6. **Documentation**: Solution added to knowledge base

## Post-Launch Success Metrics

### 📊 Key Performance Indicators

#### **Technical Metrics**
- API response time: < 200ms average
- Uptime: > 99.9%
- Error rate: < 0.1%
- Mobile app crash rate: < 1%

#### **Business Metrics**
- Order conversion rate
- Customer acquisition cost
- Average order value
- Customer lifetime value
- Monthly recurring revenue

#### **User Experience Metrics**
- App store ratings: > 4.5 stars
- Customer satisfaction: > 90%
- Support ticket volume: < 2% of users
- Feature adoption rates

### 🎯 30-60-90 Day Milestones

#### **30 Days Post-Launch**
- [ ] All critical bugs resolved
- [ ] Performance metrics stable
- [ ] User feedback incorporated
- [ ] Support processes optimized
- [ ] Analytics baseline established

#### **60 Days Post-Launch**
- [ ] Feature usage analysis complete
- [ ] Optimization recommendations implemented
- [ ] User onboarding flow refined
- [ ] Support documentation updated
- [ ] Marketing campaigns launched

#### **90 Days Post-Launch**
- [ ] ROI analysis completed
- [ ] Scaling plan developed
- [ ] Feature roadmap updated
- [ ] Success story documented
- [ ] Growth strategy implemented

---

**Welcome to the Cartaisy family!** 

We're committed to your success and will work closely with you throughout the onboarding process and beyond. For any questions or additional support, don't hesitate to reach out to our dedicated onboarding team.

Contact: onboarding@cartaisy.com | Phone: +1-XXX-XXX-XXXX