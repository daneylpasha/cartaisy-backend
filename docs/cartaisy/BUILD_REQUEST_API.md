# Build request API

Dashboard contract for "Build my app" (dashboard issue `daneylpasha/cartaisy-dashboard#17`, backend issue #155, parent epic #152). Platform ops queue: backend issue #164, dashboard `daneylpasha/cartaisy-dashboard#24`. Store owners are not platform operators: backend issue #170. Ops branding handoff for EAS: backend issue #177.

v1 stores a request and live per-platform status. When Cartaisy Expo credentials are set on the API process, create also starts an EAS Workflow build for each requested platform and a background poll writes the Expo install URL. Android and iOS are independent: Android can be `ready` while iOS is still `waiting_on_merchant`. Store-owner Apple/Google connect and EAS Submit are not part of this API. App Store Connect and Play Console are not started here.

Poll `GET /api/v1/build-requests/:id` for status. There is no push channel in v1. Platform ops list every store with `GET /api/v1/admin/build-requests`.

## Auth

Merchant routes require a store-admin JWT (`admin` or `super_admin` on that store). The store is the authenticated user's store. A body `storeId`, query `storeId`, or `X-Store-ID` does not select another store.

| Action | Method and path | Who |
| --- | --- | --- |
| Create | `POST /api/v1/build-requests` | Store admin |
| List own store | `GET /api/v1/build-requests` | Store admin. Newest first, at most 50. |
| Get one | `GET /api/v1/build-requests/:id` | Store admin. Another store's id is `404`. |
| Update checklist | `PATCH /api/v1/build-requests/:id` | Store admin. Access notes only. |
| List all stores | `GET /api/v1/admin/build-requests` | Platform operator only. Newest first, paginated. |
| Update status | `PATCH /api/v1/admin/build-requests/:id/status` | Platform operator only. |

Customers and signed-out callers cannot use these routes. A store admin, including a store owner whose role is `super_admin`, who calls the list-all or status route gets `403` with `"Platform admin access required"`. That body does not include another store's notes or ids.

Missing or invalid tokens use the existing auth envelope (`401`, `status: "error"`). Store-admin rejection on merchant routes uses `{ "success": false, "error": "Admin access required" }` (`403`).

### Granting platform ops (issue #170)

Both admin build routes use the same gate. It does **not** check `role === "super_admin"`. A caller is a platform operator only when at least one of these is true:

1. `User.isPlatformOperator` is `true` on that account.
2. The account email is verified (`isVerified: true`) and matches an entry in the `PLATFORM_OPS_EMAILS` environment variable.

If neither matches, the request fails closed with `403`. An unset, empty, or whitespace-only allowlist matches nobody. An unverified account does not match the allowlist. Role `super_admin` stays the store-owner role for store-scoped admin routes. That role alone does not unlock these two routes.

Signup never grants platform ops. New-store registration still creates the owner as `super_admin` and sets `isPlatformOperator: false`, even if the body asks for the flag or another role. Google sign-in does not create accounts and does not set the flag. Shopify customer import does not set it. `PATCH /api/v1/auth/profile` rejects `isPlatformOperator`.

How to grant access:

- **Manual flag.** Set `isPlatformOperator` to `true` on that user document in the database. This is the grant for one specific account. Do not do it through signup.
- **Allowlist.** Set `PLATFORM_OPS_EMAILS` on the API process to a comma-separated list of operator emails, then restart so the process sees it. Matching ignores case and surrounding spaces. Example: `PLATFORM_OPS_EMAILS=ops@cartaisy.com, other@cartaisy.com`. The signed-in account's email must already be verified. The same verified email on more than one account would match each of those accounts, so prefer the flag when an address is shared across stores.

Merchant create, list, get, and checklist routes are unchanged. They still use store-admin auth (`admin` or `super_admin` on that store).

## Eligibility

Create calls `assertBuildEligible(storeId)` from `src/services/catalogSyncService.ts` before it inserts a request. On failure the response is HTTP 409 and `buildEligibilityErrorBody(error)`. There is no second eligibility check.

Issue #154 owns durable sync status on `Store.catalogSync` (`idle | syncing | succeeded | failed`). This API does not write that field. `shopify.lastSyncAt` is not success. Connect does not write it; a catalog sync does. Do not enable the button from `lastSyncAt`. Connect starts the first sync automatically (issue #166). Sync again remains the manual rerun. The build button stays off until `catalogSync.status` is `succeeded`.

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

Requested platforms start as `queued`. The other starts as `not_requested`. The merchant cannot set status. When EAS automation is configured, the 201 response may already show `building` or `failed` for a requested platform. See "Automated EAS builds". When it is not configured, requested platforms stay `queued` and may include `message`.

While automation is configured, a second create is `409` `BUILD_ALREADY_IN_PROGRESS` if this store already has `queued` or `building` on a platform included in the new request. Another store is not affected. After the in-flight platform is `ready`, `failed`, or `not_requested`, a new request is allowed. When automation is not configured, more than one queued request is still allowed.

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

Send one platform or both. The omitted platform is unchanged. Each platform object may include `status`, `installUrl`, or both. `installUrl` is an https URL on `expo.dev` or `expo.io` with no credentials and no token-shaped text, or `null` to clear it. Omitting `installUrl` leaves the stored URL in place. `ready` does not require one. A manual edit also stops EAS automation for that platform (see below).

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

Platform operator only. The gate matches the status update: `isPlatformOperator: true`, or a verified email in `PLATFORM_OPS_EMAILS`. Role `super_admin`, `admin`, `moderator`, and `customer` receive `403` with `"Platform admin access required"` when they have neither marker. A missing token receives the existing `401` auth envelope. A store owner created by signup cannot call this route. See "Granting platform ops" above (issue #170).

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
          "domain": "northwind.myshopify.com",
          "appName": "Northwind",
          "iconUrl": "https://cdn.example.com/northwind-icon.png",
          "splashUrl": "https://cdn.example.com/northwind-splash.png"
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

Each item is the same build-request object as create and get, plus `store`. `store.id` equals `storeId`. `store.name` is the Cartaisy store name. `store.domain` is the Shopify shop domain (`shopify.shop`), or null when the store has no shop. A request whose store record is gone stays in the list with `store.name`, `store.domain`, `store.appName`, `store.iconUrl`, and `store.splashUrl` null. A platform is requested when its status is not `not_requested`. `checklist.accessNotes` is the merchant note ops need for a manual build.

### Store branding for EAS (issue #177)

`store.appName`, `store.iconUrl`, and `store.splashUrl` are on this ops list so a platform operator can set EAS env (`SPLASH_IMAGE_URL`, and the icon URL) without opening Mongo or the dashboard Settings page. This route still does not start EAS.

`store.appName` is the Cartaisy store name, the same string as `store.name`. There is no separate stored app-display-name field.

`store.iconUrl` and `store.splashUrl` are read from `Store.branding.iconUrl` and `Store.branding.splashUrl`. Those are the same stored fields as `GET /api/v1/admin/stores/:storeId/branding` (`iconUrl` / `appIconUrl`, `splashUrl` / `splashImageUrl`) and public `GET /api/v1/store/config`. The list query selects `name`, `shopify.shop`, `branding.iconUrl`, and `branding.splashUrl` only. It does not select Shopify Admin tokens, OAuth secrets, or signed-upload credentials.

A URL is returned only when it is an absolute `https` URL and is not token-shaped. The same markers as branding GET and public store config apply (`shpat_`, `shpss_`, `shpca_`, `shpct_`, `shpua_`, `access_token`, bearer), including when they sit in the path or query. `api_secret`, `client_secret`, `refresh_token`, and `api_key` are dropped too. An `https` URL with a username or password is dropped. `http`, relative paths, and other schemes are `null` on this route even when branding GET would still return an already-stored `http` URL. Missing branding, a blank value, and an unsafe value are `null`. The API does not invent a Cartaisy CDN URL.

Merchant create, list, get, and checklist responses do not include `appName`, `iconUrl`, or `splashUrl`. The platform-ops gate (issue #170) is unchanged.

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

## Automated EAS builds (issue #182)

Create is the trigger. There is no separate start endpoint. One EAS Workflow run is dispatched per requested platform, on Cartaisy's Expo project, after the request is stored. The merchant still cannot send a status or an install URL.

Required environment variables on the API process (see `.env.example`):

| Variable | Role |
| --- | --- |
| `EXPO_TOKEN` | Robot access token for Cartaisy's Expo account. Authorization header only. |
| `EAS_PROJECT_ID` | Expo project UUID (`extra.eas.projectId`). Not taken from the request. |
| `EAS_WORKFLOW_FILE` | Workflow file name only, such as `store-build.yml`. |
| `EAS_GIT_REF` | Git branch, tag, or commit. Defaults to `main`. |

The workflow file lives in that Expo project's git repository. It must declare `workflow_dispatch` inputs `platform` and `storeId` (strings). Optional string inputs, sent only when safe: `appName`, `storeSlug`, `iconUrl`, `splashUrl`. `platform` is `android` or `ios`. A run should include one `type: build` job for that platform. Icon and splash are omitted unless they are absolute `https` URLs with no token-shaped text. Shopify tokens are not selected and are not inputs.

Dispatch calls `POST https://api.expo.dev/v2/workflows/dispatch`. About once a minute the API polls `GET /v2/workflows/runs/:id` and, on success, the build's Expo `artifacts.buildUrl` (or an expo.dev archive URL). The token is not written to logs or responses. EAS ids are stored on the platform and are not returned.

| Outcome | Platform status | `installUrl` | `message` |
| --- | --- | --- | --- |
| Credentials missing or invalid | `queued` | unchanged | Automated builds are not configured yet. An operator can still attach an install link. |
| EAS accepted the run | `building` | unchanged | omitted |
| Workflow succeeded and the install link is an https expo.dev or expo.io URL for this project and platform | `ready` | that URL | omitted |
| Dispatch failed, workflow failed, or no safe install link | `failed` | unchanged | A fixed merchant-safe sentence. Expo's error body is not copied. |

`message` is omitted when empty. A value that contains a token marker is omitted too. `ready` still does not require an install URL when ops set the status themselves.

Platform ops `PATCH` of status or `installUrl` clears automation tracking for that platform. The poller will not replace a link ops already pasted. The manual paste rules below stay in force.

Per-store bundle ids, Apple Developer connect, Google Play connect, and EAS Submit are follow-up work. This route does not create an Expo project per store.

## Out of scope

- EAS Submit, App Store Connect, and Play Console automation.
- Store-owner Apple Developer or Google Play credential connect.
- Merchant dashboard UI (issue #17 in the dashboard repo consumes the store-admin contract).
- Ops queue UI (dashboard issue #24 consumes the platform list and the existing status PATCH).
