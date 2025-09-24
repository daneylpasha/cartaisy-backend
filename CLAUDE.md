# Cartaisy Backend - AI Development Guide

## Project Overview
Cartaisy is an e-commerce backend API built with Node.js, Express, TypeScript, and MongoDB. It provides APIs for a mobile shopping app with features like product management, user authentication, orders, wishlists, and homescreen content.

## 🏗️ Architecture & Structure

### Core Technologies
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens
- **Environment**: dotenv for configuration

### Directory Structure
```
src/
├── models/           # Mongoose schemas and models
├── controllers/      # Request handlers and business logic
├── routes/           # Express route definitions
├── middleware/       # Authentication, validation, error handling
├── services/         # Business logic and external API integrations
├── utils/            # Helper functions and constants
├── types/            # TypeScript type definitions
├── config/           # Configuration and validation
└── scripts/          # Database utilities and migrations
```

## 📋 Coding Standards & Conventions

### File Naming
- Models: PascalCase (e.g., `CarouselItem.ts`, `ProductCategory.ts`)
- Controllers: camelCase with suffix (e.g., `carouselController.ts`)
- Routes: camelCase with suffix (e.g., `carouselRoutes.ts`)
- Services: camelCase with suffix (e.g., `shopifyService.ts`)

### API Design Patterns
- RESTful endpoints with consistent naming
- JSON responses with standard structure:
  ```json
  {
    "success": boolean,
    "data": any,
    "error"?: string,
    "metadata"?: object
  }
  ```

### Authentication & Authorization
- Use `requireAuth` for user authentication
- Use `requireAdmin` or `authenticateAdmin` for admin-only endpoints
- Public endpoints need no authentication middleware

### Database Conventions
- Use Mongoose schemas with TypeScript interfaces
- Add proper indexes for performance
- Use `lean()` for read-only queries
- Implement soft deletes where appropriate

## 🛣️ API Route Structure

### Base URL: `/api/v1/`

#### Public Routes
- `GET /carousel` - Get carousel items
- `GET /customer/homescreen` - Get homescreen data
- `GET /products` - Get products
- `POST /auth/login` - User login
- `POST /auth/register` - User registration

#### Protected User Routes (require authentication)
- `GET /customer/wishlists` - User wishlists
- `POST /customer/orders` - Create order
- `GET /auth/profile` - User profile

#### Admin Routes (require admin authentication)
- `POST /admin/carousel` - Manage carousel items
- `GET /admin/analytics` - Analytics data
- Admin product management endpoints

## 🏠 Homescreen Architecture

The homescreen API is designed for scalability with modular components:

### Structure
```javascript
homescreenServices = {
  getCarouselData(),      // Hero carousel
  getFeaturedProducts(),  // Featured products
  getCategories(),       // Category navigation
  getNewArrivals(),      // Latest products
  getBestSellers(),      // Popular products
  // Future components can be added here
}
```

### Adding New Components
1. Add service function in `homescreenServices`
2. Add to `Promise.all()` array in controller
3. Include in response structure
4. Update metadata counts

### Response Structure
```json
{
  "data": {
    "carousel": [],
    "featuredProducts": [],
    "categories": [],
    "newArrivals": [],
    "bestSellers": [],
    "metadata": {
      "carouselItemsCount": 3,
      "lastUpdated": "ISO timestamp"
    }
  }
}
```

## 📊 Database Models

### Key Models
- **User**: Customer accounts with authentication
- **Product**: Product catalog with Shopify integration
- **Order**: Order management and tracking
- **CarouselItem**: Homescreen carousel content
- **Wishlist**: Customer wishlists
- **ProductCategory**: Product categorization

### Model Conventions
- Use proper TypeScript interfaces extending `Document`
- Add timestamps with `{ timestamps: true }`
- Create indexes for frequently queried fields
- Use enums for status fields

## 🔧 Development Workflow

### Adding New Features
1. Create model in `src/models/` if needed
2. Create controller in `src/controllers/`
3. Create routes in `src/routes/`
4. Register routes in `src/app.ts`
5. Test endpoints
6. Update this guide if needed

### Testing
- Use curl commands for API testing
- Test authentication flows
- Verify database operations
- Check error handling

### Environment Setup
- Copy `.env.example` to `.env`
- Update MongoDB connection string
- Set JWT_SECRET
- Configure external service credentials

## 📱 Mobile App Integration

### Key Considerations
- APIs designed for mobile consumption
- Optimize response sizes with `.select()`
- Use `.lean()` for better performance
- Structure data for UI components
- Include metadata for pagination/counts

### Homescreen Data
The `/customer/homescreen` endpoint provides all data needed for the mobile app's home screen in a single request, optimized for mobile performance.

## 🔐 Security & Authentication

### JWT Implementation
- Tokens include userId and role
- Use `authenticate` middleware for protected routes
- Admin routes require `role: 'admin'`

### Data Validation
- Use middleware for input validation
- Sanitize user inputs
- Validate MongoDB ObjectIds

## 📦 External Integrations

### Shopify
- Product sync capabilities
- Webhook handling for real-time updates
- Order management integration

### Stripe/PayPal
- Payment processing
- Webhook handling for payment confirmations

## 🚀 Deployment Notes

### Environment Variables
- Set proper production values in deployment
- Use Railway/Heroku environment configs
- Ensure MongoDB connection strings are correct

### Performance
- Database indexes are crucial for production
- Use connection pooling
- Monitor query performance

## 💡 Best Practices for AI Development

### When Adding Features
1. Follow existing patterns in the codebase
2. Use TypeScript properly with interfaces
3. Add proper error handling
4. Include authentication where needed
5. Test with curl commands
6. Update this guide if adding major features

### Common Tasks
- **Adding API endpoint**: Model → Controller → Routes → App registration
- **Database changes**: Update model, add migrations if needed
- **Authentication**: Use existing middleware patterns
- **Testing**: Use provided curl examples as templates

### Performance Optimization
- Use `Promise.all()` for parallel operations
- Use `.lean()` for read-only queries
- Add database indexes for frequently queried fields
- Limit response sizes with `.select()`

---

*This guide should be updated when major architectural changes are made to help future AI development sessions understand the codebase structure and conventions.*