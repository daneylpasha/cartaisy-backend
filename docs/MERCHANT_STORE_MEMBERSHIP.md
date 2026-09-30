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

This route ships with list and switch. It is how a merchant adds another app.

Only a store owner may call it: account role `super_admin` and at least one store already in membership (including the backfill from `storeId`). Invited `admin` and `moderator` users receive `403`. A `super_admin` with no store receives `403`. There is no per-store role matrix in v1.

An account can hold 10 stores. The next create returns `400`. An empty or whitespace name returns `400`. A name must be 2 to 100 characters.

```json
{ "name": "Second app" }
```

`storeName` is also accepted. The API creates a new store the same way signup does for name and slug only (active, free plan record, default settings, Shopify not connected). The slug is unique and a collision is retried. Nothing is copied from the current store: no Shopify connection or tokens, no branding assets, no home layout, and no Apple or Google credentials. It appends the new id to `storeIds`, sets that id as the active `storeId`, and does not create another user. Onboarding after this call targets the new store.

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

## Remove a store

`DELETE /api/v1/auth/stores/:storeId`

```json
{ "name": "Second app" }
```

`name` must match the stored store name after trim. A missing or different name returns `400` with `code: "NAME_MISMATCH"` and changes nothing.

Only a store owner may call it: account role `super_admin` and the store already in that caller's membership. Anyone else who is a member receives `403` with `code: "NOT_OWNER"`. A store id outside membership receives `403` with `Store access denied` and no code, and that store is not read for the caller. An invalid id returns `400`. A membership id whose store document is gone returns `404`.

The caller's last remaining store cannot be removed. That returns `409` with `code: "LAST_STORE"` and changes nothing. Create still requires at least one membership, so removing the last app would leave the account unable to add another.

On success the store is turned off (`isActive: false`), not hard-deleted. Shopify is disconnected first, through the same revoke-and-clear path as `POST /api/v1/shopify/disconnect`: the Admin token is revoked when a shop domain is stored, then local Shopify credentials are cleared and the shop domain is kept on `shopify.complianceShop` for compliance webhooks. If that disconnect fails, membership is left unchanged and the response is `502` with `code: "SHOPIFY_DISCONNECT_FAILED"`. Orders, customers, home layouts, and Apple or Google credentials are not cascade-deleted. User documents are not deleted.

The store id is removed from every user's `storeIds`. A user whose active `storeId` was that store is moved to their next remaining membership id, including when that id was only the active store and not listed in `storeIds`. A user with no store left has `storeId` unset, `storeIds` set to `[]`, and `isActive` set to `false` in the same transaction. An active account is never left with empty membership: a `super_admin` with no `storeId` and no `storeIds` is allowed to open any store. The user document is not deleted. The caller's response is the updated active store, same shape as switch, plus `removedStoreId`. No access token or refresh token is returned. The existing access token stays valid. If moving any affected user's active store would hit the unique `{ storeId, email }` index, including clearing `storeId` when another account with that email already has no store, the response is `409` with `code: "ACTIVE_STORE_CONFLICT"`. That check runs before Shopify disconnect, so the store, membership, and Shopify connection are left unchanged.

Removals are limited to 20 per hour per client.

```json
{
  "status": "success",
  "message": "Store removed",
  "data": {
    "removedStoreId": "507f1f77bcf86cd799439012",
    "user": {
      "id": "507f1f77bcf86cd799439099",
      "storeId": "507f1f77bcf86cd799439011",
      "storeIds": ["507f1f77bcf86cd799439011"],
      "storeName": "Northwind"
    }
  }
}
```

## Session payloads

`POST /api/v1/auth/login`, `POST /api/v1/auth/google`, `POST /api/v1/auth/refresh-token`, and `GET /api/v1/auth/profile` still return the active `storeId` and `storeName`. They also return `storeIds` for the same user. `PATCH /api/v1/auth/profile` cannot change `storeId` or `storeIds`.
