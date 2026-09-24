# Build request API

Dashboard contract for "Build my app" (dashboard issue `daneylpasha/cartaisy-dashboard#17`, backend issue #155, parent epic #152). Platform ops queue: backend issue #164, dashboard `daneylpasha/cartaisy-dashboard#24`.

v1 stores a request and live per-platform status. It does not start EAS, App Store Connect, or Play Console. Android and iOS are independent: Android can be `ready` while iOS is still `waiting_on_merchant`.

Poll `GET /api/v1/build-requests/:id` for status. There is no push channel in v1. Platform ops list every store with `GET /api/v1/admin/build-requests`.

## Auth

Merchant routes require a store-admin JWT (`admin` or `super_admin` on that store). The store is the authenticated user's store. A body `storeId`, query `storeId`, or `X-Store-ID` does not select another store.

| Action | Method and path | Who |
| --- | --- | --- |
| Create | `POST /api/v1/build-requests` | Store admin |
| List own store | `GET /api/v1/build-requests` | Store admin. Newest first, at most 50. |
| Get one | `GET /api/v1/build-requests/:id` | Store admin. Another store's id is `404`. |
| Update checklist | `PATCH /api/v1/build-requests/:id` | Store admin. Access notes only. |
| List all stores | `GET /api/v1/admin/build-requests` | Platform admin (`super_admin`) only. Newest first, paginated. |
| Update status | `PATCH /api/v1/admin/build-requests/:id/status` | Platform admin (`super_admin`) only. |

Customers and signed-out callers cannot use these routes. A store admin who calls the list-all or status route gets `403` with `"Platform admin access required"`. That body does not include another store's notes.

Missing or invalid tokens use the existing auth envelope (`401`, `status: "error"`). Store-admin rejection uses `{ "success": false, "error": "Admin access required" }` (`403`).

## Eligibility

Create calls `assertBuildEligible(storeId)` from `src/services/catalogSyncService.ts` before it inserts a request. On failure the response is HTTP 409 and `buildEligibilityErrorBody(error)`. There is no second eligibility check.

Issue #154 owns durable sync status on `Store.catalogSync` (`idle | syncing | succeeded | failed`). This API does not write that field. `shopify.lastSyncAt` is not success: connect writes that timestamp before a catalog sync. Do not enable the button from `lastSyncAt`. The next step is still Connect Shopify or Sync again.

Ineligible create response (`409`):

```json
{
  "success": false,
  "error": "Sync the catalog successfully before requesting a build. Use Sync again.",
  "code": "BUILD_NOT_ELIGIBLE",
  "reason": "catalog_sync_not_succeeded"
}
```

| `reason` | `error` | Dashboard next step |
| --- | --- | --- |
| `shopify_not_connected` | Connect Shopify before requesting a build. | Connect Shopify |
| `catalog_sync_not_succeeded` | Sync the catalog successfully before requesting a build. Use Sync again. | Sync again |

`code` is always `BUILD_NOT_ELIGIBLE`. Checklist updates and status updates do not re-check eligibility. An existing request stays readable if the store later disconnects.

## Create

```json
{
  "android": true,
  "ios": false,
  "checklist": {
    "accessNotes": "Apple developer invite sent."
  }
}
```

- `android` and `ios` are optional booleans. At least one must be `true`.
- Omitted platform means not requested.
- `checklist.accessNotes` is optional, trimmed, and at most 280 characters. This is the only checklist field. Do not send a runbook.
- `storeId` is ignored.
- Any other field is `400` `BUILD_REQUEST_INVALID`.

Requested platforms start as `queued`. The other starts as `not_requested`. The merchant cannot set status.

`201`:

```json
{
  "success": true,
  "data": {
    "id": "66f1c2e0a1b2c3d4e5f60718",
    "storeId": "66f1c2e0a1b2c3d4e5f60710",
    "requestedBy": "66f1c2e0a1b2c3d4e5f60711",
    "platforms": {
      "android": {
        "status": "queued",
        "updatedAt": "2026-09-23T20:00:00.000Z"
      },
      "ios": {
        "status": "not_requested",
        "updatedAt": "2026-09-23T20:00:00.000Z"
      }
    },
    "checklist": {
      "accessNotes": "Apple developer invite sent."
    },
    "createdAt": "2026-09-23T20:00:00.000Z",
    "updatedAt": "2026-09-23T20:00:00.000Z"
  }
}
```

Choose neither platform:

```json
{
  "success": false,
  "error": "Choose Android, iOS, or both.",
  "code": "BUILD_REQUEST_INVALID"
}
```

## List and get

`GET /api/v1/build-requests`:

```json
{
  "success": true,
  "data": {
    "requests": [],
    "count": 0
  }
}
```

`requests[0]` is the newest. Use its `id` when polling one request. A request from another store is absent here and `GET` of its id is `404` with `{ "success": false, "error": "Build request not found" }`. The body does not include the other store's notes.

## Checklist update

`PATCH /api/v1/build-requests/:id`

```json
{
  "checklist": {
    "accessNotes": "Play Console access granted."
  }
}
```

`checklist.accessNotes: null` clears the note. Sending `android`, `ios`, or `status` is `400`. Platform fields in the response stay as they were.

## Platform status

`PATCH /api/v1/admin/build-requests/:id/status`

```json
{
  "android": { "status": "ready" },
  "ios": { "status": "waiting_on_merchant" }
}
```

Send one platform or both. The omitted platform is unchanged.

Status values:

| API `status` | Suggested merchant label |
| --- | --- |
| `not_requested` | Not requested |
| `queued` | Queued |
| `building` | Building |
| `ready` | Ready |
| `failed` | Failed |
| `waiting_on_merchant` | Waiting on you |

For iOS, show `waiting_on_merchant` as **Waiting on Apple** when the blocker is the Apple developer account. The API value stays `waiting_on_merchant`. Android uses **Waiting on you** for the same value (for example Play Console access).

Invalid status is `400` `BUILD_REQUEST_INVALID` and names the allowed values.

## Platform queue

`GET /api/v1/admin/build-requests`

Platform admin only. The gate matches the status update: `req.user.role` must be `super_admin`. Role `admin`, `moderator`, and `customer` receive `403` with `"Platform admin access required"`. A missing token receives the existing `401` auth envelope. New-store registration still creates the store owner as `super_admin`, so that account can call this route, the same as the status update.

The list is every store, newest first (`createdAt`, then id). `X-Store-ID` and a query `storeId` do not select a store. Unknown query keys are `400` `BUILD_REQUEST_INVALID`.

| Query | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Positive integer, at most 1000. |
| `limit` | `20` | Positive integer, at most 50. |
| `status` | omitted | One status, or a comma-separated list. A request matches when Android or iOS has one of those statuses. |
| `platform` | omitted | `android` or `ios`. With `status`, only that platform is compared. Without `status`, the request matches when that platform was requested (its status is not `not_requested`). |

Work queue for manual builds:

`GET /api/v1/admin/build-requests?status=queued,building,waiting_on_merchant`

Android builds that are queued:

`GET /api/v1/admin/build-requests?platform=android&status=queued`

`200`:

```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": "66f1c2e0a1b2c3d4e5f60718",
        "storeId": "66f1c2e0a1b2c3d4e5f60710",
        "store": {
          "id": "66f1c2e0a1b2c3d4e5f60710",
          "name": "Northwind",
          "domain": "northwind.myshopify.com"
        },
        "requestedBy": "66f1c2e0a1b2c3d4e5f60711",
        "platforms": {
          "android": {
            "status": "queued",
            "updatedAt": "2026-09-23T20:00:00.000Z"
          },
          "ios": {
            "status": "waiting_on_merchant",
            "updatedAt": "2026-09-23T21:00:00.000Z"
          }
        },
        "checklist": {
          "accessNotes": "Apple developer invite sent."
        },
        "createdAt": "2026-09-23T20:00:00.000Z",
        "updatedAt": "2026-09-23T21:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "pages": 1
    }
  }
}
```

Each item is the same build-request object as create and get, plus `store`. `store.id` equals `storeId`. `store.name` is the Cartaisy store name. `store.domain` is the Shopify shop domain (`shopify.shop`), or null when the store has no shop. A request whose store record is gone stays in the list with `store.name` and `store.domain` null. A platform is requested when its status is not `not_requested`. `checklist.accessNotes` is the merchant note ops need for a manual build.

Empty queue:

```json
{
  "success": true,
  "data": {
    "requests": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "pages": 0
    }
  }
}
```

A page past the end returns `requests: []` and the real `total`. This route does not start a build. Status changes stay on `PATCH /api/v1/admin/build-requests/:id/status`.

## UI rules for dashboard #17

- One screen: platform checkboxes (Android, iOS, or both) and the short access note. No build log, EAS id, or runbook.
- Disable submit when the latest sync status is not succeeded, or when Shopify is disconnected. Offer the next step from `reason` above. Primary sync label is **Sync again**.
- After submit, show both platform statuses from `platforms.android` and `platforms.ios`.
- Refresh by polling get or list. A few seconds apart is enough. Stop polling when both requested platforms are `ready` or `failed`, and keep polling while either is `queued`, `building`, or `waiting_on_merchant`.

## Out of scope

- Starting or hiding an EAS build.
- App Store Connect or Play Console automation.
- Merchant dashboard UI (issue #17 in the dashboard repo consumes the store-admin contract).
- Ops queue UI (dashboard issue #24 consumes the platform list and the existing status PATCH).
