# Cartaisy Backend Architecture Documentation

## System Overview

Cartaisy Backend is a scalable, enterprise-grade e-commerce API platform designed with microservices principles, built for high-performance mobile applications with seamless Shopify integration.

### Core Design Principles

1. **Scalability First**: Designed for horizontal scaling across multiple instances
2. **Mobile Optimized**: API responses and data structures optimized for mobile consumption
3. **Security by Design**: Multi-layered security with authentication, authorization, and data protection
4. **Integration Ready**: Flexible architecture supporting multiple third-party integrations
5. **Performance Focused**: Optimized database queries, caching, and response times
6. **Maintainable**: Clean code architecture with separation of concerns

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT LAYER                                     │
├─────────────────────┬─────────────────────┬─────────────────────┬───────────────┤
│   Mobile Apps       │   Web Applications  │   Admin Dashboard   │  Third Party  │
│  (React Native)     │   (React/Next.js)   │   (React/Vue)       │   Integrations│
└─────────────────────┴─────────────────────┴─────────────────────┴───────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │   Load Balancer   │
                              │  (nginx/CloudFlare)│
                              └─────────┬─────────┘
                                        │
                              ┌─────────▼─────────┐
                              │    API Gateway    │
                              │  Rate Limiting    │
                              │  Authentication   │
                              │  Request Routing  │
                              └─────────┬─────────┘
                                        │
┌─────────────────────────────────────▼─────────────────────────────────────────┐
│                              APPLICATION LAYER                                │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│   Auth Service  │ Product Service │ Order Service   │   Integration Service   │
│                 │                 │                 │                         │
│ • JWT Tokens    │ • CRUD Ops      │ • Order Mgmt    │ • Shopify Sync         │
│ • User Mgmt     │ • Search        │ • Payment Proc  │ • Email Service        │
│ • Permissions   │ • Categories    │ • Fulfillment   │ • Push Notifications   │
│ • Sessions      │ • Inventory     │ • Tracking      │ • Analytics            │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────────┘
                                        │
┌─────────────────────────────────────▼─────────────────────────────────────────┐
│                               DATA ACCESS LAYER                               │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│   Repository    │   Caching       │   Queue         │   File Storage          │
│   Pattern       │   Layer         │   System        │   Management            │
│                 │                 │                 │                         │
│ • Mongoose ODM  │ • Redis Cache   │ • Bull Queue    │ • AWS S3/CloudFlare    │
│ • Data Models   │ • Query Cache   │ • Background    │ • Image Optimization   │
│ • Validation    │ • Session Store │   Jobs          │ • CDN Integration      │
│ • Transactions  │ • Rate Limiting │ • Email Queue   │ • Security Scanning    │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────────┘
                                        │
┌─────────────────────────────────────▼─────────────────────────────────────────┐
│                              INFRASTRUCTURE LAYER                             │
├─────────────────┬─────────────────┬─────────────────┬─────────────────────────┤
│   Database      │   Message       │   Monitoring    │   Security              │
│   Systems       │   Queues        │   & Logging     │   & Compliance          │
│                 │                 │                 │                         │
│ • MongoDB       │ • Redis/Bull    │ • Sentry        │ • SSL/TLS              │
│ • Replica Sets  │ • Event Bus     │ • New Relic     │ • WAF                  │
│ • Sharding      │ • WebHooks      │ • Custom Logs   │ • Data Encryption      │
│ • Backups       │ • Notifications │ • Health Checks │ • Audit Logs           │
└─────────────────┴─────────────────┴─────────────────┴─────────────────────────┘
```

## Core Components

### 1. Application Server (Node.js + Express)

**Technology Stack:**
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js 5 with custom middleware
- **Process Management**: PM2 for clustering and monitoring

**Key Features:**
- Cluster mode for multi-core utilization
- Graceful shutdown handling
- Health check endpoints
- Request/response logging
- Error handling and recovery

**Configuration:**
```typescript
// server.ts
import express from 'express';
import { setupMiddleware } from './middleware';
import { setupRoutes } from './routes';
import { connectDatabase } from './config/database';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
setupMiddleware(app);

// Route setup
setupRoutes(app);

// Database connection
connectDatabase();

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

### 2. Database Architecture (MongoDB)

**Database Design:**
- **Primary Database**: MongoDB 7+ with replica sets
- **Connection Pooling**: Mongoose with optimized pool settings
- **Indexing Strategy**: Compound indexes for query optimization
- **Data Validation**: Schema-level validation with Mongoose

**Collections Structure:**
```
cartaisy_production/
├── users
├── products
├── orders
├── categories
├── inventory
├── sessions
├── audit_logs
├── webhooks
├── notifications
└── analytics_events
```

**Key Design Patterns:**
- **Document Embedding**: For related data (product variants, order line items)
- **Referencing**: For loosely coupled entities (user-order relationships)
- **Denormalization**: For frequently accessed data (product search fields)

**Index Strategy:**
```javascript
// Product indexes for search and filtering
db.products.createIndex({ "title": "text", "description": "text" });
db.products.createIndex({ "category": 1, "status": 1, "price": 1 });
db.products.createIndex({ "tags": 1, "status": 1 });
db.products.createIndex({ "shopifyProductId": 1 }, { sparse: true });

// Order indexes for customer queries
db.orders.createIndex({ "customer": 1, "createdAt": -1 });
db.orders.createIndex({ "status": 1, "createdAt": -1 });
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });

// User indexes for authentication
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1, "status": 1 });
```

### 3. Authentication & Authorization System

**Authentication Flow:**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Auth      │    │  Database   │    │   Session   │
│ Application │    │ Middleware  │    │   Store     │    │   Store     │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │ 1. Login Request │                  │                  │
       ├─────────────────▶│                  │                  │
       │                  │ 2. Validate     │                  │
       │                  ├─────────────────▶│                  │
       │                  │ 3. User Data    │                  │
       │                  │◀─────────────────┤                  │
       │                  │ 4. Create JWT   │                  │
       │                  ├─────────────────────────────────────▶│
       │ 5. JWT Token     │                  │                  │
       │◀─────────────────┤                  │                  │
       │                  │                  │                  │
       │ 6. API Request   │                  │                  │
       ├─────────────────▶│                  │                  │
       │                  │ 7. Verify JWT   │                  │
       │                  ├─────────────────────────────────────▶│
       │                  │ 8. Valid Session│                  │
       │                  │◀─────────────────────────────────────┤
       │ 9. API Response  │                  │                  │
       │◀─────────────────┤                  │                  │
```

**JWT Token Structure:**
```typescript
interface JWTPayload {
  userId: string;
  email: string;
  role: 'customer' | 'admin' | 'manager';
  permissions: string[];
  sessionId: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}
```

**Role-Based Access Control (RBAC):**
```typescript
// Permission definitions
const PERMISSIONS = {
  // Product permissions
  'product:read': 'Read product information',
  'product:write': 'Create and update products',
  'product:delete': 'Delete products',
  
  // Order permissions
  'order:read': 'Read order information',
  'order:write': 'Create and update orders',
  'order:fulfill': 'Fulfill orders',
  
  // User permissions
  'user:read': 'Read user information',
  'user:write': 'Create and update users',
  'user:delete': 'Delete users',
  
  // Admin permissions
  'admin:analytics': 'Access analytics data',
  'admin:system': 'System administration'
};

// Role definitions
const ROLES = {
  customer: ['product:read', 'order:read', 'order:write'],
  manager: ['product:read', 'product:write', 'order:read', 'order:write', 'order:fulfill'],
  admin: ['*'] // All permissions
};
```

### 4. Caching Strategy (Redis)

**Cache Layers:**
```
┌─────────────────────────────────────────────────────────────────┐
│                        CACHING ARCHITECTURE                    │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Application   │   Database      │   External API              │
│   Cache         │   Query Cache   │   Response Cache            │
│                 │                 │                             │
│ • Session Store │ • Product Data  │ • Shopify API Responses    │
│ • JWT Blacklist │ • Category Tree │ • Email Templates          │
│ • Rate Limiting │ • User Profiles │ • Currency Exchange Rates  │
│ • CSRF Tokens   │ • Order Status  │ • Shipping Rates           │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

**Cache Implementation:**
```typescript
// Cache service with Redis
export class CacheService {
  private redis: Redis;
  
  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
  
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage in product service
export class ProductService {
  async getProduct(id: string): Promise<Product> {
    const cacheKey = `product:${id}`;
    
    // Try cache first
    let product = await this.cache.get<Product>(cacheKey);
    
    if (!product) {
      // Fetch from database
      product = await Product.findById(id);
      
      // Cache for 1 hour
      if (product) {
        await this.cache.set(cacheKey, product, 3600);
      }
    }
    
    return product;
  }
}
```

### 5. Background Job Processing

**Queue Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                     BACKGROUND JOB SYSTEM                      │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Job Producers │   Job Queue     │   Job Processors            │
│                 │   (Redis/Bull)  │                             │
│ • API Endpoints │                 │ • Email Worker              │
│ • Webhooks      │ ┌─────────────┐ │ • Shopify Sync Worker      │
│ • Scheduled     │ │ High Prio   │ │ • Image Processing Worker   │
│   Tasks         │ │   Queue     │ │ • Analytics Worker          │
│ • Event         │ └─────────────┘ │ • Notification Worker       │
│   Triggers      │ ┌─────────────┐ │ • Cleanup Worker            │
│                 │ │ Normal Prio │ │                             │
│                 │ │   Queue     │ │                             │
│                 │ └─────────────┘ │                             │
│                 │ ┌─────────────┐ │                             │
│                 │ │  Low Prio   │ │                             │
│                 │ │   Queue     │ │                             │
│                 │ └─────────────┘ │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

**Job Types and Priorities:**
```typescript
// Job priority levels
enum JobPriority {
  HIGH = 1,    // Payment processing, critical notifications
  NORMAL = 2,  // Email sending, order processing
  LOW = 3      // Analytics, cleanup, sync operations
}

// Job definitions
interface JobTypes {
  // Email jobs
  'email:welcome': { userId: string; };
  'email:order-confirmation': { orderId: string; };
  'email:password-reset': { userId: string; resetToken: string; };
  
  // Shopify sync jobs
  'shopify:sync-product': { productId: string; };
  'shopify:sync-order': { orderId: string; };
  'shopify:full-sync': { syncId: string; };
  
  // Image processing jobs
  'image:optimize': { imageUrl: string; sizes: number[]; };
  'image:generate-thumbnails': { productId: string; };
  
  // Analytics jobs
  'analytics:track-event': { userId: string; event: string; data: any; };
  'analytics:generate-report': { reportType: string; period: string; };
  
  // Cleanup jobs
  'cleanup:expired-sessions': {};
  'cleanup:old-logs': { olderThan: Date; };
}
```

### 6. External Integrations

#### Shopify Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SHOPIFY INTEGRATION LAYER                   │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Sync Engine   │   Webhook       │   Real-time Updates         │
│                 │   Handlers      │                             │
│ • Full Sync     │                 │ • Product Changes           │
│ • Incremental   │ ┌─────────────┐ │ • Order Updates             │
│   Sync          │ │  Product    │ │ • Inventory Adjustments     │
│ • Conflict      │ │  Webhooks   │ │ • Customer Changes          │
│   Resolution    │ └─────────────┘ │ • Payment Status            │
│ • Error         │ ┌─────────────┐ │                             │
│   Handling      │ │   Order     │ │                             │
│ • Retry Logic   │ │  Webhooks   │ │                             │
│                 │ └─────────────┘ │                             │
│                 │ ┌─────────────┐ │                             │
│                 │ │ Inventory   │ │                             │
│                 │ │  Webhooks   │ │                             │
│                 │ └─────────────┘ │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

**Sync Flow Process:**
```typescript
// Shopify sync service architecture
export class ShopifySyncService {
  private shopifyClient: ShopifyClient;
  private conflictResolver: ConflictResolver;
  private changeTracker: ChangeTracker;
  
  async performFullSync(): Promise<SyncResult> {
    const syncSession = new SyncSession();
    
    try {
      // 1. Fetch all products from Shopify
      const shopifyProducts = await this.fetchAllShopifyProducts();
      
      // 2. Compare with local products
      const changes = await this.changeTracker.detectChanges(shopifyProducts);
      
      // 3. Resolve conflicts
      const resolved = await this.conflictResolver.resolve(changes);
      
      // 4. Apply changes
      const results = await this.applyChanges(resolved);
      
      return syncSession.complete(results);
    } catch (error) {
      return syncSession.fail(error);
    }
  }
  
  async handleWebhook(webhook: ShopifyWebhook): Promise<void> {
    const handler = this.getWebhookHandler(webhook.topic);
    await handler.process(webhook);
  }
}
```

### 7. Security Architecture

**Multi-Layer Security Model:**
```
┌─────────────────────────────────────────────────────────────────┐
│                       SECURITY LAYERS                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Network       │   Application   │   Data Protection           │
│   Security      │   Security      │                             │
│                 │                 │                             │
│ • WAF           │ • JWT Auth      │ • Encryption at Rest        │
│ • DDoS          │ • RBAC          │ • Encryption in Transit     │
│   Protection    │ • Rate Limiting │ • Field-level Encryption    │
│ • IP Filtering  │ • Input         │ • Key Management            │
│ • SSL/TLS       │   Validation    │ • Data Masking              │
│   Termination   │ • CSRF          │ • Audit Logging             │
│ • Load Balancer │   Protection    │ • Backup Encryption         │
│   Security      │ • XSS           │ • GDPR Compliance           │
│                 │   Prevention    │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

**Security Implementation:**
```typescript
// Security middleware stack
export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }),
  
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
  }),
  
  cors({
    origin: process.env.CORS_ORIGINS?.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }),
  
  // Custom security middleware
  sanitizeInput,
  validateCSRF,
  auditLogger
];
```

### 8. Monitoring & Observability

**Monitoring Stack:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY PLATFORM                      │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Metrics       │   Logging       │   Tracing                   │
│   Collection    │   System        │   & APM                     │
│                 │                 │                             │
│ • Application   │ • Structured    │ • Request Tracing           │
│   Metrics       │   Logging       │ • Performance Monitoring    │
│ • System        │ • Error Logs    │ • Database Query Tracing    │
│   Metrics       │ • Audit Logs    │ • External API Monitoring   │
│ • Business      │ • Access Logs   │ • Error Tracking            │
│   Metrics       │ • Debug Logs    │ • User Session Tracking     │
│ • Custom KPIs   │ • Log           │ • Business Flow Tracing     │
│                 │   Aggregation   │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

**Health Check System:**
```typescript
// Comprehensive health check implementation
export class HealthCheckService {
  private checks: HealthCheck[] = [];
  
  registerCheck(check: HealthCheck): void {
    this.checks.push(check);
  }
  
  async runAllChecks(): Promise<HealthStatus> {
    const results = await Promise.allSettled(
      this.checks.map(check => check.execute())
    );
    
    return {
      status: this.calculateOverallStatus(results),
      checks: results.map((result, index) => ({
        name: this.checks[index].name,
        status: result.status === 'fulfilled' ? 'healthy' : 'unhealthy',
        details: result.status === 'fulfilled' ? result.value : result.reason,
        responseTime: this.checks[index].responseTime
      })),
      timestamp: new Date(),
      version: process.env.APP_VERSION
    };
  }
}

// Individual health checks
export const databaseHealthCheck: HealthCheck = {
  name: 'database',
  execute: async () => {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    return {
      responseTime: Date.now() - start,
      connections: mongoose.connection.readyState,
      status: 'healthy'
    };
  }
};

export const redisHealthCheck: HealthCheck = {
  name: 'redis',
  execute: async () => {
    const start = Date.now();
    await redis.ping();
    return {
      responseTime: Date.now() - start,
      memory: await redis.memory('usage'),
      status: 'healthy'
    };
  }
};
```

## Scalability Architecture

### Horizontal Scaling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCALING ARCHITECTURE                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Load          │   Application   │   Database                  │
│   Distribution  │   Scaling       │   Scaling                   │
│                 │                 │                             │
│ • Load Balancer │ • Multiple      │ • Read Replicas             │
│ • Health Checks │   Instances     │ • Write Primary             │
│ • Failover      │ • Auto Scaling  │ • Connection Pooling        │
│ • Geographic    │ • Container     │ • Query Optimization        │
│   Distribution  │   Orchestration │ • Index Strategy            │
│ • CDN           │ • Resource      │ • Sharding (Future)         │
│   Integration   │   Management    │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### Performance Optimization

**Database Optimization:**
```typescript
// Connection pool optimization
const mongooseOptions = {
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  bufferCommands: false,
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'majority' },
  writeConcern: { w: 'majority', j: true }
};

// Query optimization patterns
export class OptimizedProductService {
  async getProductsWithPagination(filters: ProductFilters): Promise<PaginatedProducts> {
    const pipeline = [
      // Match stage with indexed fields
      { $match: this.buildMatchQuery(filters) },
      
      // Lookup stage for related data
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'category'
        }
      },
      
      // Project only required fields
      {
        $project: {
          title: 1,
          price: 1,
          images: { $slice: ['$images', 1] }, // Only first image
          category: { $arrayElemAt: ['$category.name', 0] },
          status: 1
        }
      },
      
      // Sort by indexed field
      { $sort: { [filters.sortBy]: filters.sortOrder } },
      
      // Pagination
      { $skip: (filters.page - 1) * filters.limit },
      { $limit: filters.limit }
    ];
    
    return Product.aggregate(pipeline);
  }
}
```

## Data Flow Architecture

### Request Processing Flow

```
Client Request
      │
      ▼
┌─────────────┐
│ Load        │
│ Balancer    │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Rate        │
│ Limiter     │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Auth        │
│ Middleware  │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Validation  │
│ Middleware  │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Route       │
│ Handler     │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Service     │
│ Layer       │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Cache       │
│ Check       │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Database    │
│ Query       │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Response    │
│ Formatting  │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Cache       │
│ Update      │
└─────┬───────┘
      │
      ▼
   Response
```

### Event-Driven Architecture

```typescript
// Event system for decoupled components
export class EventBus {
  private subscribers: Map<string, EventHandler[]> = new Map();
  
  subscribe(event: string, handler: EventHandler): void {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event)?.push(handler);
  }
  
  async emit(event: string, data: any): Promise<void> {
    const handlers = this.subscribers.get(event) || [];
    
    // Process handlers in parallel
    await Promise.allSettled(
      handlers.map(handler => handler(data))
    );
  }
}

// Event definitions
export enum Events {
  USER_REGISTERED = 'user:registered',
  ORDER_CREATED = 'order:created',
  PRODUCT_UPDATED = 'product:updated',
  PAYMENT_COMPLETED = 'payment:completed',
  INVENTORY_LOW = 'inventory:low'
}

// Event handlers
eventBus.subscribe(Events.ORDER_CREATED, async (order: Order) => {
  // Send confirmation email
  await emailService.sendOrderConfirmation(order);
  
  // Update inventory
  await inventoryService.decreaseStock(order.lineItems);
  
  // Sync with Shopify
  await shopifyService.createOrder(order);
  
  // Track analytics
  await analyticsService.trackPurchase(order);
});
```

## Deployment Architecture

### Container Architecture

```dockerfile
# Multi-stage Docker build for optimization
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .

# Build application
RUN npm run build

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
```

### Infrastructure as Code

```yaml
# Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cartaisy-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cartaisy-backend
  template:
    metadata:
      labels:
        app: cartaisy-backend
    spec:
      containers:
      - name: app
        image: cartaisy/backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: cartaisy-secrets
              key: mongodb-uri
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Future Architecture Considerations

### Microservices Migration Path

```
Current Monolith → Modular Monolith → Microservices

Phase 1: Modular Monolith
├── Auth Service Module
├── Product Service Module
├── Order Service Module
├── Integration Service Module
└── Shared Infrastructure

Phase 2: Extract Services
├── Authentication Service (Separate)
├── Product Catalog Service (Separate)
├── Order Management Service (Separate)
├── Integration Hub Service (Separate)
└── Shared Data Layer

Phase 3: Full Microservices
├── User Identity Service
├── Product Catalog Service
├── Inventory Management Service
├── Order Processing Service
├── Payment Service
├── Notification Service
├── Analytics Service
└── API Gateway
```

### Technology Evolution

**Planned Upgrades:**
- **Database**: MongoDB → MongoDB + PostgreSQL (hybrid approach)
- **Caching**: Redis → Redis Cluster + CDN edge caching
- **Search**: MongoDB text search → Elasticsearch
- **Queue**: Bull → Apache Kafka for event streaming
- **Monitoring**: Custom metrics → OpenTelemetry + Prometheus
- **API**: REST → GraphQL + REST hybrid

---

This architecture documentation provides a comprehensive overview of the Cartaisy Backend system design, covering all major components, data flows, and scaling strategies. The architecture is designed to support high-performance mobile e-commerce applications while maintaining security, scalability, and maintainability.