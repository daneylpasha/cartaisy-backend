# Merchant store membership

One dashboard user can belong to many stores. `User.storeId` is the active store. `User.storeIds` is the membership. Switching does not sign the user out and does not return a new access token or refresh token.

Shopify tokens and Expo tokens are never included in these responses.

## List stores

`GET /api/v1/auth/stores`

Authenticated. Returns only stores in the caller's membership.

```json
{
  "status": "success",
  "data": {
    "activeStoreId": "507f1f77bcf86cd799439011",
    "stores": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "Northwind",
        "slug": "northwind",
        "logoUrl": "https://cdn.example.com/logo.png",
        "iconUrl": "https://cdn.example.com/icon.png"
      }
    ]
  }
}
```

`logoUrl` and `iconUrl` are omitted unless the stored value is an absolute `http` or `https` URL and is not token-shaped (`shpat_`, `shpss_`, `shpca_`, `shpct_`, `shpua_`, `access_token`, bearer). A missing store document is skipped.

If `storeIds` is empty and `storeId` is set, the API treats and saves membership as `[storeId]` before listing.

## Switch active store

`POST /api/v1/auth/stores/switch`

```json
{ "storeId": "507f1f77bcf86cd799439012" }
```

Sets `User.storeId` when that id is in `storeIds`. The response is the updated store fields:

```json
{
  "status": "success",
  "message": "Active store updated",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439099",
      "storeId": "507f1f77bcf86cd799439012",
      "storeIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
      "storeName": "Second app"
    }
  }
}
```

There is no `token` or `refreshToken`. The caller's current access token still works, and the next profile, login, Google sign-in, or refresh response uses this active `storeId`.

A store id outside membership returns `403` with `Store access denied`. The active store is left unchanged. An invalid id returns `400`. A membership id whose store document is gone returns `404`. If another user already has this email on that active store, the switch returns `409` and does not change the active store.

`admin` and `moderator` routes that check store ownership still require the requested store to be the active store. After a switch, that active store is the one those routes allow. A store-owner `super_admin` may open a store in `storeIds` on those admin routes. Platform operators are unchanged and may still open a store outside membership.

## Create another store

`POST /api/v1/auth/stores`

Store owners only (`role` `super_admin`). Team `admin` and `moderator` users receive `403`.

```json
{ "storeName": "Second app" }
```

`name` is accepted when `storeName` is omitted. The name must be 2 to 100 characters. The API creates a store the same way signup does for name and slug only (active, free plan record, default settings, Shopify not connected). It appends the new id to `storeIds`, sets it active, and does not create another user.

```json
{
  "status": "success",
  "message": "Store created",
  "data": {
    "store": {
      "id": "507f1f77bcf86cd799439012",
      "name": "Second app",
      "slug": "second-app-abc123"
    },
    "user": {
      "id": "507f1f77bcf86cd799439099",
      "storeId": "507f1f77bcf86cd799439012",
      "storeIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
      "storeName": "Second app"
    }
  }
}
```

No tokens are returned. The existing access token remains valid.

## Session payloads

`POST /api/v1/auth/login`, `POST /api/v1/auth/google`, `POST /api/v1/auth/refresh-token`, and `GET /api/v1/auth/profile` still return the active `storeId` and `storeName`. They also return `storeIds` for the same user. `PATCH /api/v1/auth/profile` cannot change `storeId` or `storeIds`.
