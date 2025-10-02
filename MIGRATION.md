# React Native Migration Guide

## Overview

The backend now integrates with Shopify Storefront API. Your React Native app needs updates to consume the new data structure and add type-safe API client generation.

---

## Breaking Changes

### Field Renames
```typescript
// CarouselItem
subTitle → subtitle
buttonText → ctaText

// Product
availableForSale → inStock
stockQuantity → availableQuantity
```

### Type Changes
```typescript
// All collectionId fields
collectionId: number → string  // Now supports Shopify GID format
```

### New Fields
```typescript
// CarouselItem
endsAt?: string;              // ISO timestamp for countdown
promoTag?: {                  // Promotional badge
  text?: string;
  imageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
};

// Product
rating: number;               // From MongoDB
reviewsCount: number;         // From MongoDB
compareAtPrice?: number;      // Original price for discounts
images: string[];             // Multiple images
vendor?: string;
productType?: string;
tags?: string[];
```

### JWT Secret Changed

**IMPORTANT:** The backend's JWT secret was regenerated. All existing users need to re-authenticate.

**Action Required:**
1. Clear any cached JWT tokens on app startup
2. Redirect users to login screen
3. Users must log in again to get new valid tokens

```typescript
// Add this to your app initialization
AsyncStorage.removeItem('jwt_token');
```

---

## Setup Orval for Type Generation

### 1. Install Dependencies

```bash
npm install --save-dev orval
npm install axios @tanstack/react-query
```

### 2. Copy OpenAPI Spec to Your Project

Since your React Native project is on a different machine, copy the OpenAPI spec file:

1. **Copy from backend:** `public/swagger.json`
2. **Paste to React Native:** `api-spec/swagger.json` (create the folder)

**Note:** The localhost URL inside swagger.json doesn't matter - Orval only reads type definitions. You'll configure the actual API URL in `apiClient.ts` (Step 4).

### 3. Create `orval.config.ts`

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  cartaisy: {
    input: {
      target: './api-spec/swagger.json', // Local file instead of URL
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/api.ts',
      schemas: 'src/api/generated/models',
      client: 'react-query',
      override: {
        mutator: {
          path: 'src/api/apiClient.ts',
          name: 'customInstance',
        },
      },
    },
  },
});
```

**Alternative:** If backend is deployed, use the deployed URL:
```typescript
target: 'https://your-api.com/api-docs.json',
```

### 4. Create `src/api/apiClient.ts`

**IMPORTANT:** The localhost URL in `swagger.json` doesn't matter. Orval only reads schemas/types. You configure the actual API URL here:

```typescript
import axios, { AxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure your actual backend URL here (not from swagger.json)
const API_BASE_URL = __DEV__
  ? 'http://YOUR_BACKEND_IP:3000/api/v1'  // Update with your backend machine IP
  : 'https://your-deployed-api.com/api/v1';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Add JWT token
axiosInstance.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('jwt_token');
      // Navigate to login
    }
    return Promise.reject(error);
  }
);

export const customInstance = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance.request<T>(config).then((res) => res.data);
};
```

### 5. Add Script to package.json

```json
{
  "scripts": {
    "generate:api": "orval"
  }
}
```

### 6. Generate Client

```bash
npm run generate:api
```

---

## Update Components

### Before: Manual API Calls

```typescript
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch('http://localhost:3000/api/v1/customer/homescreen')
    .then(res => res.json())
    .then(setData)
    .finally(() => setLoading(false));
}, []);

return (
  <View>
    {data?.carousel?.map(item => (
      <Card subtitle={item.subTitle} buttonText={item.buttonText} />
    ))}
  </View>
);
```

### After: Type-Safe Hooks

```typescript
import { useGetHomescreenData } from '@/api/generated/api';

const { data, isLoading } = useGetHomescreenData();

return (
  <View>
    {data?.data.carousel?.map(item => (
      <Card
        subtitle={item.subtitle}    // Updated field name
        ctaText={item.ctaText}      // Updated field name
        endsAt={item.endsAt}        // NEW: countdown timer
        promoTag={item.promoTag}    // NEW: promo badge
      />
    ))}
  </View>
);
```

---

## Add Favorites Feature

### FavoriteButton Component

```typescript
import React from 'react';
import { TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  useGetFavorites,
  useAddFavorite,
  useRemoveFavorite,
} from '@/api/generated/api';

export const FavoriteButton = ({ productId }: { productId: string }) => {
  const { data } = useGetFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const isFavorite = data?.data.productIds?.includes(productId);

  const toggle = () => {
    if (isFavorite) {
      removeFavorite.mutate({ productId });
    } else {
      addFavorite.mutate({ data: { productId } });
    }
  };

  return (
    <TouchableOpacity onPress={toggle}>
      <Icon
        name={isFavorite ? 'favorite' : 'favorite-border'}
        size={24}
        color={isFavorite ? '#FF0000' : '#666'}
      />
    </TouchableOpacity>
  );
};
```

### Add to ProductCard

```typescript
export const ProductCard = ({ product }: { product: Product }) => {
  const hasDiscount = product.compareAtPrice && product.compareAtPrice > product.price;
  const discount = hasDiscount
    ? Math.round(((product.compareAtPrice! - product.price) / product.compareAtPrice!) * 100)
    : 0;

  return (
    <View>
      <Image source={{ uri: product.images[0] }} />

      <FavoriteButton productId={product.productId} />

      <Text>{product.title}</Text>

      <View>
        <Text>${product.price}</Text>
        {hasDiscount && (
          <>
            <Text style={styles.strikethrough}>${product.compareAtPrice}</Text>
            <Text>-{discount}%</Text>
          </>
        )}
      </View>

      {product.rating > 0 && (
        <Text>⭐ {product.rating.toFixed(1)} ({product.reviewsCount})</Text>
      )}

      {!product.inStock && <Text>Out of Stock</Text>}
    </View>
  );
};
```

---

## Migration Checklist

- [ ] Install Orval, React Query, Axios
- [ ] Create `orval.config.ts`
- [ ] Create `src/api/apiClient.ts`
- [ ] Generate API client: `npm run generate:api`
- [ ] Setup QueryClientProvider in App.tsx
- [ ] Update field names: `subtitle`, `ctaText`, `inStock`, `availableQuantity`
- [ ] Update `collectionId` from number to string
- [ ] Add PromoTag rendering
- [ ] Add countdown timer for `endsAt`
- [ ] Display product ratings and reviews
- [ ] Display discount badges with `compareAtPrice`
- [ ] Create FavoriteButton component
- [ ] Test favorites add/remove
- [ ] Test JWT authentication
- [ ] Test on iOS and Android

---

## Paste This Into Claude Code

When you open your React Native project in Claude Code, paste this:

```
I have a React Native app consuming APIs from my Node.js backend. The backend was updated with Shopify integration and I need to migrate my app.

BACKEND CHANGES:
1. New Favorites API (JWT protected):
   - GET /api/v1/customer/favorites
   - POST /api/v1/customer/favorites
   - DELETE /api/v1/customer/favorites/:productId

2. Breaking changes:
   - CarouselItem: subTitle→subtitle, buttonText→ctaText, collectionId:number→string
   - Product: availableForSale→inStock, stockQuantity→availableQuantity
   - New fields: endsAt, promoTag, rating, reviewsCount, compareAtPrice

3. JWT Secret changed - all users must re-authenticate

4. OpenAPI spec: I have the swagger.json file in api-spec/swagger.json
   (Note: The localhost URL in swagger.json is ignored - Orval only reads schemas/types)

TASKS:
1. Setup Orval for type-safe API client generation using local swagger.json
2. Create apiClient.ts with correct backend URL (my backend is at: [YOUR_BACKEND_IP]:3000)
3. Replace manual API calls with generated React Query hooks
4. Update field names throughout the app
5. Add Favorites feature with heart button
6. Display product ratings and discount badges
7. Handle JWT authentication and force re-login

Please help me:
1. Setup Orval configuration (use local file: ./api-spec/swagger.json)
2. Create apiClient.ts with my backend URL
3. Generate API client
4. Migrate components systematically
5. Add new UI features

Start by setting up Orval with the local swagger.json file, then show me what was generated.
```

Claude will guide you through the migration step-by-step.

---

## Troubleshooting

### Orval generation fails
```bash
# Make sure swagger.json exists
ls api-spec/swagger.json

# If missing, copy from backend repo
# Then generate
npm run generate:api
```

### TypeScript errors
```bash
# Clear cache and restart TS server
rm -rf node_modules/.cache
# In VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

### 401 errors
```typescript
// Check token is present
const token = await AsyncStorage.getItem('jwt_token');
console.log('Token:', token ? 'Present' : 'Missing');
```

---

## Documentation

- **README.md** - Quick start and setup instructions
- **API.md** - Complete API reference with endpoints and data models
- **MIGRATION.md** - This file (React Native migration guide)
- **CLAUDE.md** - Backend architecture and development guide
