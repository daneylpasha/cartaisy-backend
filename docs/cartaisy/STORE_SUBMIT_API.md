# Store submit API

Dashboard contract for sending a finished store build to App Store Connect or Google Play (backend issue #187, dashboard issue `daneylpasha/cartaisy-dashboard#67`).

The merchant connects Apple and Google in `STORE_CREDENTIALS_API.md`. This API decrypts those keys on the server and calls EAS Submit on Cartaisy's Expo account. It does not change how builds start (`EXPO_TOKEN`, `EAS_PROJECT_ID`, `EAS_WORKFLOW_FILE`, `EAS_GIT_REF`).

Secrets stay on the server. Responses, audit logs, and submit job documents do not include the Apple `.p8`, the Google service-account JSON, ciphertext, or `EXPO_TOKEN`.

## What gets submitted

One platform of one build request. The build for that platform must already be `ready` and must have been produced by Cartaisy's EAS workflow (a server-side EAS build id). A platform that is still `queued`, `building`, `failed`, `waiting_on_merchant`, or `not_requested` cannot be submitted. A `ready` row whose install link was pasted by hand, with no EAS build id, cannot be submitted either.

Android goes to the Play **internal** track. The track is not chosen by the client in this version. iOS uses the store's App Store Connect API key (`ascApiKeyId`, `ascApiKeyIssuerId`, and the `.p8`). `ascAppId` is not stored yet. If Apple or Google rejects the upload, the job becomes `failed` with a fixed message. Expo's error text is not copied.

## Auth

Merchant routes require a store-admin JWT (`admin` or `super_admin` on that store). The store is the authenticated user's store. A body `storeId`, query `storeId`, or `X-Store-ID` does not select another store. Another store's build request id is `404`.

| Action | Method and path | Who |
| --- | --- | --- |
| Start | `POST /api/v1/build-requests/:id/submits` | Store admin |
| Latest per platform | `GET /api/v1/build-requests/:id/submits` | Store admin |
| Latest for one platform | `GET /api/v1/build-requests/:id/submits/:platform` | Store admin. `platform` is `ios` or `android`. |

Customers and signed-out callers cannot use these routes. Missing or invalid tokens use the existing auth envelope (`401`, `status: "error"`). Store-admin rejection uses `{ "success": false, "error": "Admin access required" }` (`403`).

There is no platform-operator submit route. Ops do not submit with a merchant's keys.

## Status

`queued`, `submitting`, `submitted`, or `failed`.

| Status | Meaning | Dashboard |
| --- | --- | --- |
| `queued` | The attempt is stored and EAS has not accepted it yet. | Keep polling. |
| `submitting` | EAS accepted the submission, or the upload is still running. | Keep polling. |
| `submitted` | EAS finished the upload to App Store Connect or Play. | Stop polling. The store may still need review in App Store Connect or Play Console. |
| `failed` | The attempt stopped. `message` is a fixed sentence. | Show `message`. The merchant can start again. |

`message` is omitted unless the status is `failed`. It never contains a private key, a service-account JSON, or the Expo token.

Poll `GET /api/v1/build-requests/:id/submits/:platform` every few seconds while the status is `queued` or `submitting`. That GET asks EAS for the latest status when Cartaisy Expo credentials are configured. The list GET does the same for each latest in-flight job. A background poll also runs about once a minute. There is no push channel.

## Start

`POST /api/v1/build-requests/:id/submits`

```json
{
  "platform": "ios"
}
```

`platform` is `ios` or `android`. The body has no other fields. `storeId` is `400`.

`201` after the attempt is recorded. `data.status` is usually `submitting`. If EAS rejects the call, `201` is still returned and `data.status` is `failed`, so the dashboard can show the same object it polls.

```json
{
  "success": true,
  "data": {
    "id": "66f1c2e0a1b2c3d4e5f60720",
    "buildRequestId": "66f1c2e0a1b2c3d4e5f60718",
    "platform": "ios",
    "status": "submitting",
    "createdAt": "2026-09-28T20:00:00.000Z",
    "updatedAt": "2026-09-28T20:00:00.000Z"
  }
}
```

The response does not include the EAS build id, the EAS submission id, the Expo project id, or any credential field.

List:

```json
{
  "success": true,
  "data": {
    "submits": []
  }
}
```

`submits` has at most one object per platform: the newest attempt. An empty list means this build request has never been submitted. It is `200` when the build request belongs to the store.

`GET /api/v1/build-requests/:id/submits/ios` returns the same object as `data` (not wrapped in `submits`). No attempt yet is `404` with `"Store submit not found"`.

## Errors

Failed starts use `{ "success": false, "error", "code" }`. `error` is safe to show to the merchant.

| HTTP | `code` | When | `error` |
| --- | --- | --- | --- |
| 400 | `SUBMIT_INVALID` | Platform missing or not `ios` / `android`, or any extra body field. | Choose ios or android. |
| 404 | | Build request is missing or belongs to another store. | Build request not found |
| 409 | `SUBMIT_ARTIFACT_MISSING` | That platform has no finished EAS build to submit. | This platform does not have a finished build to submit yet. |
| 409 | `SUBMIT_CREDENTIALS_MISSING` | That platform's credential status is `missing`. | Connect an App Store Connect API key… or Connect a Google Play service account… |
| 409 | `SUBMIT_CREDENTIALS_NEEDS_ATTENTION` | A secret is stored but cannot be decrypted. Same recovery as credential `needsAttention`: upload the key again. | Upload the App Store Connect API key again… or Upload the Google Play service account JSON again… |
| 409 | `SUBMIT_ALREADY_IN_PROGRESS` | The latest attempt for that platform is `queued` or `submitting`. | A submit is already in progress for this platform. |
| 503 | `SUBMIT_NOT_CONFIGURED` | Cartaisy's `EXPO_TOKEN` or `EAS_PROJECT_ID` is missing. The names are not in the response. | Store submit is not available yet. Try again later. |
| 503 | `SUBMIT_UNAVAILABLE` | EAS could not be reached before an attempt was recorded. | The store submit could not be reached. Try again in a few minutes. |

`SUBMIT_ALREADY_IN_PROGRESS` also includes `data` with the in-flight job so the dashboard can poll it.

Credential and artifact failures do not create a submit job. A failed EAS call does. After `failed` or `submitted`, the merchant can start that platform again. That creates a new job. The list and platform GET return the newest one.

If the API process stops after EAS has accepted the upload and before the submission id is stored, that attempt becomes `failed` after about two minutes. Starting again can upload the same build a second time. App Store Connect or Play may reject the duplicate.

iOS reads the Apple credential only. Android reads the Google credential only. The other platform's key is not required.

## Credentials and files

Decrypt happens in the API process for the EAS GraphQL call. The `.p8` and the service-account JSON are written to a private temp file, read back for that call, overwritten, and deleted before the response returns. They are not written to the submit job, the build request, logs, or the response. Query strings that carry `privateKey`, `keyP8`, or `googleServiceAccountKeyJson` are stripped before access logs, the same way credential routes are.

Android maps the stored JSON to EAS `googleServiceAccountKeyJson` and track `INTERNAL`. iOS maps the stored key to EAS `ascApiKey.keyP8`, `ascApiKey.keyIdentifier`, and `ascApiKey.issuerIdentifier`.
