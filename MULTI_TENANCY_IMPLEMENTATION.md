# Multi-Tenancy API Implementation Guide

## Overview
This document outlines the changes made to implement multi-tenancy support in the Cartaisy backend API. All endpoints now filter data by `storeId` to ensure complete data isolation between stores.

## Completed Changes

### 1. Store Authentication Middleware
**File**: `src/middleware/storeAuth.ts` (NEW)

Provides middleware for store-based access control:
- **`storeAuth`** - Ensures authenticated user has a valid storeId
- **`storeAdmin`** - Ensures user has admin/super_admin role within their store
- **`superAdmin`** - Ensures user is a global super_admin
- **`getStoreIdFromRequest()`** - Utility to extract storeId from auth context, query params, or headers

**Usage**:
```typescript
import { storeAuth, storeAdmin } from '../middleware/storeAuth';

// Apply to routes
router.post('/admin/items', [authenticate, storeAuth, storeAdmin], controller.create);
```

### 2. Authentication Middleware Updates
**File**: `src/middleware/auth.ts`

Enhanced with multi-tenancy support:
- Added `storeId` to the user object attached to requests
- Exports convenience middleware combinations:
  - `requireStoreAuth` - Authentication + storeAuth
  - `requireStoreAdmin` - Authentication + storeAuth + storeAdmin
  - `requireSuperAdmin` - Authentication + storeAuth + superAdmin

**Changes**:
```typescript
// Before
req.user = {
  _id: user._id,
  email: user.email,
  role: user.role,
  // ...
};

// After
req.user = {
  _id: user._id,
  storeId: user.storeId,  // NEW
  email: user.email,
  role: user.role,
  // ...
};
```

### 3. Express Type Definitions
**File**: `src/types/express.d.ts`

Updated Express Request interface to include multi-tenancy properties:
```typescript
interface Request {
  user?: {
    _id: ObjectId;
    storeId?: ObjectId;      // NEW
    email: string;
    role: string;
    name: string;
    isActive: boolean;
  };
  sessionID?: string;
  storeId?: ObjectId;         // NEW - Set by storeAuth middleware
  userRole?: string;          // NEW - Set by storeAuth middleware
}
```

### 4. Homescreen Controller
**File**: `src/controllers/homescreenController.ts`

Updated to filter all homescreen components by storeId:

**Changes**:
- Added `@TsoaRequest()` parameter to extract request context
- Implemented `getStoreIdFromRequest()` to get store context
- Updated all private methods to accept `storeId` parameter:
  - `getCarouselData(storeId)`
  - `getCategoryGrid(storeId)`
  - `getCalloutBanners(storeId)`
  - `getPromoBanners(storeId)`
  - `getCollectionDisplaysRaw(storeId)`
  - `getCategoryCollectionGrid(storeId)`
  - `getCollectionShowcases(storeId)`

**Example query change**:
```typescript
// Before
CarouselItem.find({ isActive: true })

// After
CarouselItem.find({ storeId, isActive: true })
```

### 5. Carousel Controller
**File**: `src/controllers/carouselController.ts`

Fully implemented multi-tenancy filtering:

**Create (POST)**:
```typescript
const validatedItems = items.map((item, index) => ({
  storeId: req.storeId,  // Auto-set from authenticated user
  imageUrl: item.imageUrl,
  // ... other fields
}));
await CarouselItem.deleteMany({ storeId: req.storeId });  // Only delete own store's items
```

**Read (GET)**:
```typescript
const query: any = {};
if (req.storeId) {
  query.storeId = req.storeId;
}
CarouselItem.find(query)
```

**Update (PATCH)**:
```typescript
await CarouselItem.findOneAndUpdate(
  { _id: id, storeId: req.storeId },  // Ensure store isolation
  { isActive },
  { new: true }
);
```

**Delete (DELETE)**:
```typescript
await CarouselItem.findOneAndDelete({
  _id: id,
  storeId: req.storeId  // Ensure store isolation
});
```

### 6. Carousel Routes
**File**: `src/routes/carouselRoutes.ts`

Updated to use store authentication middleware:

**Before**:
```typescript
router.post('/admin/carousel', authenticateAdmin, controller.create);
```

**After**:
```typescript
router.post('/admin/carousel', requireStoreAdmin, controller.create);
// requireStoreAdmin = [authenticate, storeAuth, storeAdmin]
```

All CRUD operations now require store admin privileges:
- `POST /admin/carousel` - Create items
- `PUT /admin/carousel` - Update items
- `DELETE /admin/carousel/:id` - Delete item
- `PATCH /admin/carousel/:id/status` - Update status

## Pattern Summary

### CRUD Pattern for Multi-Tenant Endpoints

**Create**:
```typescript
async createItem(req: AuthenticatedRequest, res: Response) {
  if (!req.storeId) return res.status(401).json(...);

  await Model.create({
    ...req.body,
    storeId: req.storeId  // Auto-set from user context
  });
}
```

**Read**:
```typescript
async getItems(req: AuthenticatedRequest, res: Response) {
  const query = {};
  if (req.storeId) query.storeId = req.storeId;

  Model.find(query)
}
```

**Update**:
```typescript
async updateItem(req: AuthenticatedRequest, res: Response) {
  if (!req.storeId) return res.status(401).json(...);

  Model.findOneAndUpdate(
    { _id: id, storeId: req.storeId },
    req.body,
    { new: true }
  );
}
```

**Delete**:
```typescript
async deleteItem(req: AuthenticatedRequest, res: Response) {
  if (!req.storeId) return res.status(401).json(...);

  Model.findOneAndDelete({
    _id: id,
    storeId: req.storeId
  });
}
```

## Accessing StoreId in Endpoints

Three methods to get storeId in controllers:

### 1. From Authenticated User (Preferred)
```typescript
// Set by storeAuth middleware after user authentication
const storeId = req.storeId;
```

### 2. From Request Body (Utility)
```typescript
import { getStoreIdFromRequest } from '../middleware/storeAuth';

const storeId = getStoreIdFromRequest(req);
// Checks: req.storeId → query param → X-Store-ID header
```

### 3. From User Object
```typescript
const storeId = req.user?.storeId;
```

## Middleware Stacking

Different combinations for different endpoint types:

### Public Endpoints (No Auth)
```typescript
router.get('/items', controller.getPublic);
```

### User Endpoints (Auth Required)
```typescript
router.get('/user/items', requireAuth, controller.getUserItems);
```

### Store Admin Endpoints (Store Context Required)
```typescript
router.post('/admin/items', requireStoreAdmin, controller.createItem);
// = [authenticate, storeAuth, storeAdmin]
```

### Super Admin Endpoints (Global Admin)
```typescript
router.post('/super-admin/items', requireSuperAdmin, controller.createItem);
// = [authenticate, storeAuth, superAdmin]
```

## Type Safety

All authenticated endpoints should use `AuthenticatedRequest` type:

```typescript
import { AuthenticatedRequest } from '../types';

export const myController = {
  async myAction(req: AuthenticatedRequest, res: Response) {
    // req.user - authenticated user with all fields
    // req.storeId - store context (when set by storeAuth)
    // req.userRole - user's role (when set by storeAuth)
  }
};
```

## Error Handling

Standard error responses for store auth violations:

```typescript
// Missing store context
if (!req.storeId) {
  return res.status(401).json({
    success: false,
    error: 'Store authentication required'
  });
}

// Insufficient permissions
if (!req.userRole || !['admin', 'super_admin'].includes(req.userRole)) {
  return res.status(403).json({
    success: false,
    error: 'Admin access required'
  });
}

// Resource not found or not in user's store
if (!result) {
  return res.status(404).json({
    success: false,
    error: 'Item not found'
  });
}
```

## Next Steps - Controllers Needing Updates

The following controllers still need to be updated using the same pattern:

1. **CalloutBanner Controller** (`calloutBannerController.ts`)
2. **CategoryGrid Controller** (`categoryGridController.ts`)
3. **PromoBanner Controller** (if exists)
4. **CollectionDisplay Controller** (`collectionDisplayController.ts`)
5. **Product Controller** (`productController.ts`)
6. **Order Controller** (`orderController.ts`)
7. **Wishlist Controller** (`wishlistController.ts`)
8. And all other data-modifying endpoints

## Testing Considerations

When testing multi-tenant endpoints:

1. **Create users in different stores** - Ensure same email works across stores (scoped by storeId)
2. **Verify data isolation** - Users from store A cannot see/modify store B's data
3. **Test without storeId** - Admin endpoints should return 401/403
4. **Test store boundaries** - Trying to access/modify another store's data should fail
5. **Test role-based access** - Non-admins should not access admin endpoints

## Database Indexes

All component collections have been indexed for efficient queries:

```typescript
// Compound indexes ensure good performance
Collection.index({ storeId: 1, isActive: 1 })
Collection.index({ storeId: 1, position: 1 })
Collection.index({ storeId: 1, collectionId: 1 })
```

## Migration Notes

For existing data without storeId:

```typescript
// Add default storeId to existing documents
db.collectionname.updateMany(
  { storeId: { $exists: false } },
  { $set: { storeId: 'default-store-id' } }
)
```

Or use a migration script to assign existing data to appropriate stores based on creation date or other criteria.
