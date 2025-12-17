# Push Notification Diagnostic Report - Backend

## Executive Summary

The Cartaisy backend has a **fully implemented push notification system** using Firebase Admin SDK. The implementation includes:
- Device token registration from mobile apps
- Broadcast notifications with customer segmentation
- Notification history/logging
- Firebase topic subscriptions
- Comprehensive error handling and token cleanup

---

## Token Registration Endpoint (Mobile → Backend)

### Primary Endpoint (Customer Auth)
- **Route**: `POST /api/v1/customer/auth/device-token`
- **File**: `src/controllers/customerAuthController.ts:415-489`
- **Controller method**: `updateDeviceToken`
- **Middleware**: `authenticateCustomer`
- **Request body schema**:
```json
{
  "token": "string (required) - Also accepts 'deviceToken' for mobile compatibility",
  "platform": "ios | android (required)"
}
```

### Secondary Endpoint (Notification Routes)
- **Route**: `POST /api/v1/notifications/register-token`
- **File**: `src/controllers/pushNotificationController.ts:12-94`
- **Controller method**: `registerDeviceToken`
- **Middleware**: `authenticateCustomer`
- **Request body schema**:
```json
{
  "token": "string (required)",
  "platform": "ios | android (required)",
  "deviceId": "string (optional)"
}
```

### Key Difference
- `/customer/auth/device-token` - Simple token storage (recommended for mobile)
- `/notifications/register-token` - Also subscribes to Firebase topic for store

---

## Customer Model - Device Tokens

- **File**: `src/models/Customer.ts:46-97` (interface), `src/models/Customer.ts:128-138` (schema)
- **Schema**:
```typescript
interface IDeviceToken {
  token: string;           // The FCM device token
  platform: 'ios' | 'android';
  deviceId?: string;       // Optional device identifier
  lastUsed: Date;
  active: boolean;         // Whether token is still valid
  createdAt: Date;
}

// On Customer model:
deviceTokens: IDeviceToken[];
notificationPreferences: {
  pushEnabled: boolean;    // Master switch
  orderUpdates: boolean;
  promotions: boolean;
  newProducts: boolean;
};
subscribedToTopics: string[];  // Firebase topics subscribed to
```

### Helper Methods on Customer Model
- `addDeviceToken(token, platform, deviceId?)` - Add or update token
- `removeDeviceToken(token)` - Remove token
- `deactivateDeviceToken(token)` - Mark token inactive
- `getActiveDeviceTokens()` - Get all active token strings
- `getDeviceTokensByPlatform(platform)` - Get tokens by platform

---

## Broadcast Endpoint (Dashboard → Backend → Firebase)

- **Route**: `POST /api/v1/notifications/stores/:storeId/broadcast`
- **File**: `src/controllers/pushNotificationController.ts:268-468`
- **Controller method**: `broadcastStoreNotification`
- **Middleware**: `requireStoreAdmin`
- **Request body schema**:
```json
{
  "title": "string (required)",
  "body": "string (required)",
  "imageUrl": "string (optional)",
  "data": "object (optional) - Custom data payload",
  "segment": "string (optional, default: 'all')"
}
```

### Available Segments (defined in `src/services/segmentationService.ts`)
| Segment ID | Description |
|------------|-------------|
| `all` | All customers with active devices |
| `inactive_30_days` | No orders in 30+ days |
| `active_7_days` | Ordered in last 7 days |
| `first_time_buyers` | Only 1 order |
| `repeat_customers` | 2+ orders |
| `high_value` | $100+ total spent |
| `ios_only` | iOS device users |
| `android_only` | Android device users |

### How Tokens Are Extracted
1. `SegmentationService.getSegmentDeviceTokens(storeId, segmentId)` is called
2. Builds MongoDB query based on segment criteria
3. Finds customers matching query with `'deviceTokens.active': true`
4. Extracts active tokens from each customer's `deviceTokens` array
5. Returns flat array of token strings

---

## Firebase Configuration

### Initialization
- **File**: `src/services/firebaseNotificationService.ts:33-57`
- **Service Account env var**: `FIREBASE_SERVICE_ACCOUNT`
- **Expected format**: JSON string of the Firebase service account

```typescript
// Initialization code (lines 37-57):
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : null;

if (serviceAccount) {
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  isInitialized = true;
  console.log('✅ Firebase Admin SDK initialized successfully');
}
```

### Startup Logs (in `src/app.ts:13-18`)
```typescript
console.log('Firebase Status:', {
  initialized: FirebaseNotificationService.isInitialized(),
  message: FirebaseNotificationService.isInitialized()
    ? 'Push notifications enabled ✅'
    : 'Push notifications disabled (no credentials) ⚠️'
});
```

---

## Notification Service

- **File**: `src/services/firebaseNotificationService.ts`
- **Send method**: `sendEachForMulticast` (line 259)
- **Handles Expo tokens**: **NO** - Expo tokens will FAIL with Firebase Admin SDK
- **Handles native FCM tokens**: **YES**

### Send Flow
1. Filter valid tokens (>20 chars, not empty)
2. Build `MulticastMessage` with:
   - `notification`: title, body, imageUrl
   - `data`: custom payload
   - `android`: high priority, sound, channelId='orders'
   - `apns`: alert, sound, badge, content-available
3. Call `admin.messaging().sendEachForMulticast(message)`
4. Process response, identify failed/invalid tokens
5. Return detailed result with success/failure counts

### Invalid Token Cleanup
- Tokens with error codes `messaging/invalid-registration-token` or `messaging/registration-token-not-registered` are marked for removal
- `removeInvalidTokens()` method removes them from all Customer documents

---

## Notification Logging

- **Model File**: `src/models/NotificationLog.ts`
- **Created in**: `broadcastStoreNotification` controller

### Log Schema
```typescript
{
  storeId: ObjectId;
  title: string;
  body: string;
  data?: object;
  imageUrl?: string;
  segment: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed';
  scheduledFor?: Date;
  sentAt?: Date;
  targetCount: number;
  successCount: number;
  failureCount: number;
  failedTokens?: Array<{ token, error, errorCode }>;  // Max 50
  sentBy?: ObjectId;
  sentByEmail?: string;
}
```

---

## Diagnostic Endpoint

- **Route**: `GET /api/v1/notifications/stores/:storeId/diagnostic`
- **File**: `src/controllers/pushNotificationController.ts:920-1135`
- **Controller method**: `getNotificationDiagnostic`

### Returns
```json
{
  "firebase": {
    "status": "initialized | not_initialized | error",
    "projectId": "string",
    "hasServiceAccount": boolean
  },
  "tokens": {
    "customersWithTokens": number,
    "customersWithActiveTokens": number,
    "totalTokens": number,
    "activeTokens": number,
    "platformBreakdown": { "ios": number, "android": number },
    "tokenTypeBreakdown": {
      "expo": number,
      "nativeFcm": number,
      "warning": "string if expo tokens found"
    },
    "sampleTokens": [{ email, token, type, platform }]
  },
  "recentNotifications": [...],
  "issues": ["string"],
  "recommendations": ["string"]
}
```

---

## Logging Implementation (Already in Place)

### Token Registration (`customerAuthController.ts:425-429`)
```typescript
console.log('📱 [PUSH] Step 1: Received device token registration');
console.log('📱 [PUSH] Step 1a: Customer ID:', customerId);
console.log('📱 [PUSH] Step 1b: Token:', token.substring(0, 40) + '...');
console.log('📱 [PUSH] Step 1c: Platform:', platform);
console.log('📱 [PUSH] Step 1d: Token type:', token?.startsWith('ExponentPushToken') ? 'EXPO' : 'NATIVE_FCM');
```

### Broadcast (`pushNotificationController.ts:278-284, 334-359, 382-407`)
```typescript
console.log('📢 [PUSH] Step 3: Broadcast request received');
console.log('📢 [PUSH] Step 4: Querying customers for segment:', segmentId);
console.log('📢 [PUSH] Step 4a: Customers found with devices, total tokens:', deviceTokens.length);
console.log('🔥 [PUSH] Step 5: Sending to Firebase FCM');
console.log('🔥 [PUSH] Step 6: Firebase response received');
// ... detailed error logs
```

### Firebase Service (`firebaseNotificationService.ts:210-282`)
```typescript
console.log(`📤 Sending push notification to ${validTokens.length} device(s):`);
console.log(`📱 Push notification result:`);
console.log(`   ✅ Success: ${response.successCount}`);
console.log(`   ❌ Failed: ${response.failureCount}`);
// ... per-token error details
```

---

## All Routes Summary

### Customer Routes (require `authenticateCustomer`)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/customer/auth/device-token` | Register device token |
| POST | `/api/v1/notifications/register-token` | Register + topic subscribe |
| POST | `/api/v1/notifications/unregister-token` | Remove device token |
| GET | `/api/v1/notifications/preferences` | Get notification prefs |
| PATCH | `/api/v1/notifications/preferences` | Update notification prefs |

### Admin Routes (require `requireStoreAdmin`)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/notifications/stores/:storeId/broadcast` | Send broadcast |
| POST | `/api/v1/notifications/test` | Send test to customer |
| GET | `/api/v1/notifications/stores/:storeId/stats` | Get statistics |
| GET | `/api/v1/notifications/stores/:storeId/recipients` | List recipients |
| GET | `/api/v1/notifications/stores/:storeId/segments` | List segments |
| GET | `/api/v1/notifications/stores/:storeId/history` | Notification history |
| GET | `/api/v1/notifications/stores/:storeId/history/:id` | Single notification |
| GET | `/api/v1/notifications/stores/:storeId/diagnostic` | System diagnostic |

---

## Known Issues & Critical Warnings

### ⚠️ CRITICAL: Expo Token Incompatibility
**Expo Push Tokens (format: `ExponentPushToken[...]`) WILL NOT work with Firebase Admin SDK!**

The Firebase Admin SDK can only send to:
- Native FCM tokens (Android)
- APNs device tokens registered with Firebase (iOS)

If the mobile app is using Expo's push notification system (`expo-notifications`), it generates Expo tokens that require Expo's push service, NOT Firebase Admin SDK.

**Solution**: Mobile app must use `react-native-firebase` to get native FCM tokens.

### Token Format Check
The system logs token type on registration:
```typescript
console.log('📱 [PUSH] Step 1d: Token type:', token?.startsWith('ExponentPushToken') ? 'EXPO' : 'NATIVE_FCM');
```

---

## Test Checklist

| Step | Expected | How to Verify |
|------|----------|---------------|
| Firebase initialized | ✅ on startup | Check server logs for "Firebase Admin SDK initialized successfully" |
| Token registration works | 200 OK, token in DB | POST to `/customer/auth/device-token`, check Customer in DB |
| Tokens are NOT Expo format | Should NOT start with "ExponentPushToken" | Check diagnostic endpoint `tokenTypeBreakdown` |
| Broadcast endpoint works | 200 OK, notification log created | POST to `/stores/:id/broadcast` |
| Firebase receives tokens | Success count > 0 | Check broadcast response `successCount` |
| Failed tokens logged | Error details in log | Check notification log `failedTokens` array |
| Notifications delivered | Appears on device | Test on real device |

---

## Debugging Workflow

1. **Check Firebase initialization**:
   - Look for startup log: "Firebase Admin SDK initialized successfully"
   - If missing, check `FIREBASE_SERVICE_ACCOUNT` env var

2. **Check token registration**:
   - Look for "📱 [PUSH] Step 1" logs when mobile registers
   - Verify token is NOT Expo format

3. **Check broadcast flow**:
   - Look for "📢 [PUSH] Step 3" through "🔥 [PUSH] Step 6" logs
   - Check token counts and types at each step

4. **Check Firebase response**:
   - Look for success/failure counts
   - Check error codes for failed tokens:
     - `messaging/invalid-registration-token` - Bad token format
     - `messaging/registration-token-not-registered` - Token expired/unregistered
     - `messaging/invalid-argument` - Often indicates Expo token

5. **Use diagnostic endpoint**:
   - `GET /api/v1/notifications/stores/:storeId/diagnostic`
   - Shows complete system status and identifies issues

---

## Environment Variables Required

```env
# Firebase Admin SDK service account (JSON string)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}
```

Get from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key

---

## Recommendations

1. **Verify mobile app uses native FCM tokens**, not Expo push tokens
2. **Test with diagnostic endpoint** before sending broadcasts
3. **Monitor notification logs** for delivery rates
4. **Clean up invalid tokens** (happens automatically, but verify)
5. **Use test endpoint** before mass broadcasts
