# Build request API

Dashboard contract for "Build my app" (dashboard issue `daneylpasha/cartaisy-dashboard#17`, backend issue #155, parent epic #152).

v1 stores a request and live per-platform status. It does not start EAS, App Store Connect, or Play Console. Android and iOS are independent: Android can be `ready` while iOS is still `waiting_on_merchant`.

Poll `GET /api/v1/build-requests/:id` for status. There is no push channel in v1.

## Auth

Merchant routes require a store-admin JWT (`admin` or `super_admin` on that store). The store is the authenticated user's store. A body `storeId`, query `storeId`, or `X-Store-ID` does not select another store.

| Action | Method and path | Who |
| --- | --- | --- |
| Create | `POST /api/v1/build-requests` | Store admin |
| List own store | `GET /api/v1/build-requests` | Store admin. Newest first, at most 50. |
| Get one | `GET /api/v1/build-requests/:id` | Store admin. Another store's id is `404`. |
| Update checklist | `PATCH /api/v1/build-requests/:id` | Store admin. Access notes only. |
| Update status | `PATCH /api/v1/admin/build-requests/:id/status` | Platform admin (`super_admin`) only. |

Customers and signed-out callers cannot use these routes. A store admin who calls the status route gets `403` with `"Platform admin access required"`.

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

## UI rules for dashboard #17

- One screen: platform checkboxes (Android, iOS, or both) and the short access note. No build log, EAS id, or runbook.
- Disable submit when the latest sync status is not succeeded, or when Shopify is disconnected. Offer the next step from `reason` above. Primary sync label is **Sync again**.
- After submit, show both platform statuses from `platforms.android` and `platforms.ios`.
- Refresh by polling get or list. A few seconds apart is enough. Stop polling when both requested platforms are `ready` or `failed`, and keep polling while either is `queued`, `building`, or `waiting_on_merchant`.

## Out of scope

- Starting or hiding an EAS build.
- App Store Connect or Play Console automation.
- Dashboard UI (issue #17 in the dashboard repo consumes this contract).
