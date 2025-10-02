# API Documentation

## Base URL
```
Development: http://localhost:3000/api/v1
Production: https://your-api.com/api/v1
```

## Interactive Documentation
- **Swagger UI:** http://localhost:3000/api-docs
- **OpenAPI Spec:** http://localhost:3000/api-docs.json

---

## Authentication

### JWT Token
Protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

Token is returned from login/register endpoints.

---

## Endpoints

### Homescreen API
**GET** `/customer/homescreen`

Returns all data for mobile app home screen.

**Response:**
```json
{
  "success": true,
  "data": {
    "carousel": [
      {
        "imageUrl": "string",
        "title": "string",
        "subtitle": "string",
        "ctaText": "string",
        "collectionId": "string",
        "endsAt": "2025-10-10T00:00:00Z",
        "promoTag": {
          "text": "50% OFF",
          "backgroundColor": "#FF0000"
        }
      }
    ],
    "categoryGrid": [...],
    "calloutBanners": [...],
    "promoBanners": [...],
    "collectionDisplays": [
      {
        "type": "large_row",
        "order": 1,
        "collection": {
          "collectionId": "123456",
          "title": "Summer Collection",
          "products": [
            {
              "productId": "gid://shopify/Product/123",
              "title": "Product Name",
              "images": ["url1", "url2"],
              "price": 29.99,
              "compareAtPrice": 39.99,
              "inStock": true,
              "availableQuantity": 10,
              "rating": 4.5,
              "reviewsCount": 24
            }
          ]
        }
      }
    ],
    "metadata": {
      "carouselItemsCount": 3,
      "lastUpdated": "2025-10-03T00:00:00Z"
    }
  }
}
```

---

### Favorites API (Protected)

#### Get Favorites
**GET** `/customer/favorites`

Returns array of favorited product IDs.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productIds": ["123", "456", "789"]
  }
}
```

#### Add Favorite
**POST** `/customer/favorites`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Body:**
```json
{
  "productId": "123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Product added to favorites"
}
```

#### Remove Favorite
**DELETE** `/customer/favorites/:productId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Product removed from favorites"
}
```

---

## Data Models

### Product
```typescript
{
  productId: string;           // Shopify GID
  title: string;
  images: string[];
  price: number;
  compareAtPrice?: number;     // Original price (for discounts)
  currency: string;
  inStock: boolean;
  availableQuantity: number;
  totalQuantity: number;
  rating: number;              // From MongoDB
  reviewsCount: number;        // From MongoDB
  vendor?: string;
  productType?: string;
  tags?: string[];
}
```

### Collection
```typescript
{
  collectionId: string;
  title: string;
  description: string;
  handle: string;
  imageUrl?: string;
  products: Product[];
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid product ID format"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "No token provided"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Favorite not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "data": { /* empty data structure */ }
}
```

---

## Shopify Integration

### Data Source
- Products and collections from **Shopify Storefront API**
- Ratings and reviews from **MongoDB**
- Merged in `productEnrichmentService`

### Graceful Degradation
If Shopify is not configured or unavailable:
- `collectionDisplays` returns empty array
- Other homescreen data still works
- No errors thrown

---

## Type Generation for Clients

### Using Orval (React Native/React)

1. Install Orval:
```bash
npm install --save-dev orval
```

2. Create `orval.config.ts`:
```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: 'http://localhost:3000/api-docs.json',
    output: {
      target: 'src/api/generated.ts',
      client: 'react-query',
    },
  },
});
```

3. Generate:
```bash
npx orval
```

This creates type-safe React Query hooks for all endpoints.

---

## Rate Limiting

- **Window:** 15 minutes
- **Max Requests:** 100 per IP
- Returns 429 if exceeded

---

## Performance

### Response Times
- Homescreen: ~500-800ms (with Shopify)
- Favorites: ~50-100ms (MongoDB only)

### Caching
Currently no caching. Consider Redis for production:
- Homescreen: 5-10 min TTL
- Product data: 15 min TTL

---

## Testing Endpoints

### cURL Examples

```bash
# Homescreen
curl http://localhost:3000/api/v1/customer/homescreen

# Get Favorites (requires token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/customer/favorites

# Add Favorite
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":"123"}' \
  http://localhost:3000/api/v1/customer/favorites

# Remove Favorite
curl -X DELETE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/customer/favorites/123
```

---

For detailed architecture and code conventions, see `CLAUDE.md`.
