# Cartaisy Backend API Reference

## Overview

The Cartaisy Backend API provides comprehensive e-commerce functionality with Shopify integration, designed specifically for mobile applications. This RESTful API offers authentication, product management, order processing, and advanced features like recommendations and analytics.

### Base URL
```
Production: https://api.yourdomain.com
Staging: https://staging-api.yourdomain.com
Development: http://localhost:3000
```

### API Version
Current version: `v1`

All endpoints are prefixed with `/api/`

## Authentication

### Overview
The API uses JWT (JSON Web Token) authentication. Include the token in the `Authorization` header with the `Bearer` prefix.

```
Authorization: Bearer your-jwt-token-here
```

### Registration

**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "confirmPassword": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": false,
      "createdAt": "2023-10-01T10:00:00.000Z"
    }
  }
}
```

### Login

**POST** `/api/auth/login`

Authenticate a user and receive access tokens.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "lastLoginAt": "2023-10-01T10:00:00.000Z"
    }
  }
}
```

### Refresh Token

**POST** `/api/auth/refresh`

Refresh an expired access token using the refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Profile

**GET** `/api/auth/profile`

Get the current user's profile information.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "customer",
      "isEmailVerified": true,
      "preferences": {
        "notifications": true,
        "newsletter": false
      },
      "createdAt": "2023-10-01T10:00:00.000Z",
      "updatedAt": "2023-10-01T10:00:00.000Z"
    }
  }
}
```

### Update Profile

**PUT** `/api/auth/profile`

Update the current user's profile information.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Request Body:**
```json
{
  "name": "John Smith",
  "preferences": {
    "notifications": false,
    "newsletter": true
  }
}
```

### Password Reset

**POST** `/api/auth/forgot-password`

Request a password reset email.

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**POST** `/api/auth/reset-password`

Reset password using the reset token.

**Request Body:**
```json
{
  "token": "password-reset-token",
  "newPassword": "newsecurepassword123",
  "confirmPassword": "newsecurepassword123"
}
```

## Products

### Get Products

**GET** `/api/products`

Retrieve a paginated list of products with optional filtering.

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10, max: 50) - Items per page
- `search` (string) - Search products by title or description
- `category` (string) - Filter by category
- `tags` (string) - Filter by tags (comma-separated)
- `minPrice` (number) - Minimum price filter
- `maxPrice` (number) - Maximum price filter
- `sortBy` (string) - Sort field (title, price, createdAt)
- `sortOrder` (string) - Sort order (asc, desc)
- `status` (string) - Filter by status (active, draft, archived)

**Example:**
```
GET /api/products?page=1&limit=12&search=mobile&category=electronics&sortBy=price&sortOrder=asc
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "Premium Mobile Phone",
        "handle": "premium-mobile-phone",
        "description": "Latest smartphone with advanced features",
        "price": 699.99,
        "compareAtPrice": 899.99,
        "images": [
          {
            "url": "https://cdn.yourdomain.com/phone-1.jpg",
            "altText": "Phone front view",
            "position": 1
          }
        ],
        "variants": [
          {
            "id": "507f1f77bcf86cd799439012",
            "title": "64GB Black",
            "price": 699.99,
            "sku": "PHONE-64GB-BLACK",
            "inventoryQuantity": 25,
            "availableForSale": true
          }
        ],
        "tags": ["electronics", "mobile", "smartphone"],
        "category": "Electronics",
        "vendor": "TechBrand",
        "status": "active",
        "seo": {
          "title": "Premium Mobile Phone - Best Price",
          "description": "Get the latest premium mobile phone..."
        },
        "createdAt": "2023-10-01T10:00:00.000Z",
        "updatedAt": "2023-10-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "current": 1,
      "total": 5,
      "count": 12,
      "totalItems": 48,
      "hasNext": true,
      "hasPrev": false
    },
    "filters": {
      "categories": ["Electronics", "Clothing", "Home"],
      "priceRange": {
        "min": 9.99,
        "max": 1299.99
      },
      "vendors": ["TechBrand", "FashionCorp", "HomeEssentials"]
    }
  }
}
```

### Get Single Product

**GET** `/api/products/{id}`

Retrieve detailed information for a specific product.

**Response:**
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Premium Mobile Phone",
      "handle": "premium-mobile-phone",
      "description": "Detailed product description...",
      "price": 699.99,
      "compareAtPrice": 899.99,
      "images": [
        {
          "url": "https://cdn.yourdomain.com/phone-1.jpg",
          "altText": "Phone front view",
          "position": 1
        }
      ],
      "variants": [
        {
          "id": "507f1f77bcf86cd799439012",
          "title": "64GB Black",
          "price": 699.99,
          "sku": "PHONE-64GB-BLACK",
          "inventoryQuantity": 25,
          "availableForSale": true,
          "options": {
            "Storage": "64GB",
            "Color": "Black"
          }
        }
      ],
      "options": [
        {
          "name": "Storage",
          "values": ["64GB", "128GB", "256GB"]
        },
        {
          "name": "Color", 
          "values": ["Black", "White", "Blue"]
        }
      ],
      "tags": ["electronics", "mobile", "smartphone"],
      "category": "Electronics",
      "vendor": "TechBrand",
      "status": "active",
      "seo": {
        "title": "Premium Mobile Phone - Best Price",
        "description": "Get the latest premium mobile phone..."
      },
      "metafields": [
        {
          "key": "warranty",
          "value": "2 years",
          "type": "string"
        }
      ],
      "relatedProducts": ["507f1f77bcf86cd799439013", "507f1f77bcf86cd799439014"],
      "reviews": {
        "count": 156,
        "averageRating": 4.5
      },
      "createdAt": "2023-10-01T10:00:00.000Z",
      "updatedAt": "2023-10-01T10:00:00.000Z"
    }
  }
}
```

### Create Product

**POST** `/api/products`

Create a new product (Admin/Manager only).

**Headers:**
```
Authorization: Bearer your-jwt-token
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "New Product",
  "description": "Product description",
  "price": 49.99,
  "compareAtPrice": 69.99,
  "images": [
    {
      "url": "https://cdn.yourdomain.com/product.jpg",
      "altText": "Product image"
    }
  ],
  "variants": [
    {
      "title": "Default",
      "price": 49.99,
      "sku": "PROD-001",
      "inventoryQuantity": 100
    }
  ],
  "tags": ["new", "featured"],
  "category": "General",
  "vendor": "YourBrand",
  "status": "active"
}
```

### Update Product

**PUT** `/api/products/{id}`

Update an existing product (Admin/Manager only).

**Headers:**
```
Authorization: Bearer your-jwt-token
Content-Type: application/json
```

### Delete Product

**DELETE** `/api/products/{id}`

Delete a product (Admin only).

**Headers:**
```
Authorization: Bearer your-jwt-token
```

## Orders

### Get Customer Orders

**GET** `/api/customer/orders`

Retrieve the current customer's orders.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `status` (string) - Filter by order status

**Response:**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": "507f1f77bcf86cd799439020",
        "orderNumber": "ORD-1696154400-ABC123",
        "status": "processing",
        "totalPrice": 149.97,
        "subtotalPrice": 149.97,
        "totalTax": 0,
        "shippingPrice": 0,
        "currency": "USD",
        "lineItems": [
          {
            "id": "507f1f77bcf86cd799439021",
            "productId": "507f1f77bcf86cd799439011",
            "variantId": "507f1f77bcf86cd799439012",
            "title": "Premium Mobile Phone",
            "variantTitle": "64GB Black",
            "quantity": 1,
            "price": 699.99,
            "totalPrice": 699.99,
            "sku": "PHONE-64GB-BLACK",
            "image": {
              "url": "https://cdn.yourdomain.com/phone-1.jpg",
              "altText": "Phone front view"
            }
          }
        ],
        "customer": {
          "id": "507f1f77bcf86cd799439011",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "shippingAddress": {
          "firstName": "John",
          "lastName": "Doe",
          "address1": "123 Main St",
          "city": "New York",
          "province": "NY",
          "country": "US",
          "zip": "10001",
          "phone": "+1234567890"
        },
        "billingAddress": {
          "firstName": "John",
          "lastName": "Doe",
          "address1": "123 Main St",
          "city": "New York",
          "province": "NY",
          "country": "US",
          "zip": "10001"
        },
        "fulfillmentStatus": "unfulfilled",
        "paymentStatus": "paid",
        "tracking": {
          "company": "UPS",
          "number": "1Z999AA1234567890",
          "url": "https://tracking.ups.com/..."
        },
        "createdAt": "2023-10-01T10:00:00.000Z",
        "updatedAt": "2023-10-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "current": 1,
      "total": 3,
      "count": 5,
      "totalItems": 15
    }
  }
}
```

### Get Single Order

**GET** `/api/customer/orders/{id}`

Retrieve detailed information for a specific order.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

### Create Order

**POST** `/api/customer/orders`

Create a new order for the current customer.

**Headers:**
```
Authorization: Bearer your-jwt-token
Content-Type: application/json
```

**Request Body:**
```json
{
  "lineItems": [
    {
      "productId": "507f1f77bcf86cd799439011",
      "variantId": "507f1f77bcf86cd799439012",
      "quantity": 2
    }
  ],
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "city": "New York",
    "province": "NY",
    "country": "US",
    "zip": "10001",
    "phone": "+1234567890"
  },
  "billingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address1": "123 Main St",
    "city": "New York",
    "province": "NY",
    "country": "US",
    "zip": "10001"
  },
  "paymentMethod": {
    "type": "stripe",
    "stripePaymentIntentId": "pi_1234567890"
  },
  "notes": "Please handle with care"
}
```

### Cancel Order

**POST** `/api/customer/orders/{id}/cancel`

Cancel an order (only if order status allows cancellation).

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Request Body:**
```json
{
  "reason": "Customer changed mind"
}
```

## Shopify Integration

### Sync Status

**GET** `/api/shopify/sync/status`

Get the current synchronization status with Shopify.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lastFullSync": "2023-10-01T10:00:00.000Z",
    "lastIncrementalSync": "2023-10-01T11:00:00.000Z",
    "inProgress": false,
    "errors": [],
    "stats": {
      "productsSynced": 245,
      "ordersSynced": 1023,
      "customersSynced": 567
    }
  }
}
```

### Full Sync

**POST** `/api/shopify/sync/full`

Trigger a full synchronization with Shopify.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Response:**
```json
{
  "success": true,
  "message": "Full synchronization initiated",
  "data": {
    "syncId": "sync-1696154400-abc123",
    "estimatedDuration": "5-10 minutes",
    "status": "queued"
  }
}
```

### Incremental Sync

**POST** `/api/shopify/sync/incremental`

Trigger an incremental synchronization with Shopify.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

### Integration Overview

**GET** `/api/shopify/overview`

Get Shopify integration overview and statistics.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "products": {
      "total": 245,
      "syncedWithShopify": 240,
      "syncRate": 98
    },
    "orders": {
      "total": 1023,
      "mobileOnly": 456,
      "shopifyOrders": 567
    },
    "sync": {
      "lastFullSync": "2023-10-01T10:00:00.000Z",
      "lastIncrementalSync": "2023-10-01T11:00:00.000Z",
      "inProgress": false,
      "errorCount": 0
    },
    "integration": {
      "status": "active",
      "health": "healthy"
    }
  }
}
```

## User Management

### Get Users (Admin only)

**GET** `/api/admin/users`

Retrieve a list of users (Admin access required).

**Headers:**
```
Authorization: Bearer your-admin-jwt-token
```

**Query Parameters:**
- `page` (number, default: 1) - Page number
- `limit` (number, default: 20) - Items per page
- `role` (string) - Filter by user role
- `search` (string) - Search by name or email
- `status` (string) - Filter by account status

### Update User (Admin only)

**PUT** `/api/admin/users/{id}`

Update user information (Admin access required).

**Headers:**
```
Authorization: Bearer your-admin-jwt-token
Content-Type: application/json
```

## Analytics

### Customer Analytics

**GET** `/api/analytics/customers`

Get customer analytics data.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

**Query Parameters:**
- `period` (string) - Time period (7d, 30d, 90d, 1y)
- `metric` (string) - Specific metric to retrieve

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCustomers": 1250,
    "newCustomers": 45,
    "returningCustomers": 123,
    "customerLifetimeValue": 285.50,
    "acquisitionChannels": {
      "organic": 45,
      "social": 23,
      "email": 12,
      "direct": 67
    }
  }
}
```

### Product Analytics

**GET** `/api/analytics/products`

Get product performance analytics.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

### Sales Analytics

**GET** `/api/analytics/sales`

Get sales performance data.

**Headers:**
```
Authorization: Bearer your-jwt-token
```

## Health Checks

### Basic Health Check

**GET** `/api/health`

Check if the API server is running.

**Response:**
```json
{
  "success": true,
  "message": "API Server is running",
  "timestamp": "2023-10-01T10:00:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

### Detailed Health Check

**GET** `/api/health/detailed`

Get comprehensive system health information.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": {
        "status": "healthy",
        "responseTime": 15,
        "connections": 5
      },
      "redis": {
        "status": "healthy",
        "responseTime": 2,
        "memory": "125MB"
      },
      "shopify": {
        "status": "healthy",
        "responseTime": 120,
        "lastSync": "2023-10-01T11:00:00.000Z"
      },
      "email": {
        "status": "healthy",
        "provider": "sendgrid"
      }
    },
    "performance": {
      "uptime": 86400,
      "memoryUsage": "512MB",
      "cpuUsage": "15%"
    }
  }
}
```

## Error Handling

### Error Response Format

All API errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error message description",
  "code": "ERROR_CODE",
  "details": {
    "field": "Specific field error details"
  },
  "timestamp": "2023-10-01T10:00:00.000Z"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limited
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable

### Common Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `AUTHENTICATION_REQUIRED` - Authentication token required
- `INVALID_TOKEN` - Authentication token is invalid
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions
- `RESOURCE_NOT_FOUND` - Requested resource not found
- `DUPLICATE_RESOURCE` - Resource already exists
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `EXTERNAL_SERVICE_ERROR` - External service (Shopify, etc.) error
- `DATABASE_ERROR` - Database operation failed

## Rate Limiting

### Limits

- **Public endpoints**: 100 requests per 15 minutes per IP
- **Authenticated endpoints**: 500 requests per 15 minutes per user
- **Admin endpoints**: 1000 requests per 15 minutes per admin user

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1696155000
```

## Webhooks

### Shopify Webhooks

The API receives webhooks from Shopify for real-time synchronization:

- **Product updates**: `POST /api/webhooks/shopify/products`
- **Order updates**: `POST /api/webhooks/shopify/orders`
- **Customer updates**: `POST /api/webhooks/shopify/customers`
- **Inventory updates**: `POST /api/webhooks/shopify/inventory`

### Payment Webhooks

- **Stripe**: `POST /api/webhooks/stripe`
- **PayPal**: `POST /api/webhooks/paypal`

## SDK Examples

### JavaScript/TypeScript

```typescript
import { CartaisyAPI } from '@cartaisy/sdk';

const api = new CartaisyAPI({
  baseURL: 'https://api.yourdomain.com',
  apiKey: 'your-api-key'
});

// Get products
const products = await api.products.list({
  page: 1,
  limit: 12,
  search: 'mobile'
});

// Create order
const order = await api.orders.create({
  lineItems: [
    {
      productId: 'product-id',
      variantId: 'variant-id',
      quantity: 2
    }
  ],
  shippingAddress: {
    // address details
  }
});
```

### React Native

```typescript
import { useCartaisyAPI } from '@cartaisy/react-native-sdk';

function ProductList() {
  const { products, loading, error } = useCartaisyAPI().useProducts({
    search: 'mobile',
    limit: 12
  });

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <FlatList
      data={products}
      renderItem={({ item }) => <ProductCard product={item} />}
    />
  );
}
```

## Testing

### Test Endpoints

Development and staging environments include test endpoints:

- `POST /api/test/reset-database` - Reset test database
- `POST /api/test/seed-data` - Generate test data
- `GET /api/test/mock-shopify` - Test Shopify integration

### Authentication for Testing

Use the test user credentials in development:

```json
{
  "email": "test@cartaisy.com",
  "password": "testpassword123"
}
```

---

For additional support or questions about the API, contact our developer support team at developers@yourdomain.com