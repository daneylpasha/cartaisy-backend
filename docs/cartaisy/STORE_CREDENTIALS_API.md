# Store credentials API

Dashboard contract for connecting a store's own Apple App Store Connect and Google Play accounts (backend issue #185, dashboard issue `daneylpasha/cartaisy-dashboard#63`).

This API stores credentials and reports status. It does not submit to App Store Connect or Google Play, and it does not change Expo build dispatch (`easBuildService`, `EXPO_TOKEN`, or the build-request workflow).

Secrets stay on the server after save. Responses and logs do not include the Apple private key or the Google service-account JSON.

## Credential shape

One record per store. Each platform is independent.

### Apple — App Store Connect API key

MVP is an App Store Connect API key, not an Apple ID password.

| Field | What the merchant copies from App Store Connect |
| --- | --- |
| `keyId` | Key ID. Exactly 10 letters or digits. |
| `issuerId` | Issuer ID. A UUID. |
| `privateKey` | Contents of the `.p8` file (`AuthKey_<keyId>.p8`). PKCS#8 PEM, `-----BEGIN PRIVATE KEY-----`. |

A later EAS Submit step can map these to `ascApiKeyId`, `ascApiKeyIssuerId`, and the `.p8` file. The App Store app id (`ascAppId`) is not stored here.

### Google Play — service account JSON

The JSON key from Google Cloud / Play Console, the same file EAS Submit expects as `serviceAccountKeyPath`.

Required fields inside that JSON:

- `type` is `service_account`
- `project_id`
- `private_key_id`
- `private_key` (PKCS#8 PEM)
- `client_email`

Other string fields from the downloaded file (`client_id`, `token_uri`, certificate URLs, `universe_domain`) are kept inside the encrypted blob so a later submit step can use the original key. The Play track and package name are not stored here.

## Encryption

Ciphertext uses the existing helper in `src/utils/encryption.ts` (AES-256-GCM). The key is `ENCRYPTION_KEY` (at least 32 characters). See `.env.example`. The same key already protects Shopify access tokens.

The database stores only the `iv:ciphertext:authTag` blob (`select: false`) plus safe metadata: Apple key id last 4, issuer id last 4, Google service-account email, and private key id last 4. The plaintext JSON is not stored and is not logged.

## Auth

Merchant routes require a store-admin JWT (`admin` or `super_admin` on that store). The store is the authenticated user's store. A body `storeId`, query `storeId`, or `X-Store-ID` does not select another store.

| Action | Method and path | Who |
| --- | --- | --- |
| Status | `GET /api/v1/store-credentials` | Store admin |
| Upsert Apple | `POST /api/v1/store-credentials/apple` | Store admin |
| Upsert Google | `POST /api/v1/store-credentials/google` | Store admin |
| Disconnect Apple | `DELETE /api/v1/store-credentials/apple` | Store admin |
| Disconnect Google | `DELETE /api/v1/store-credentials/google` | Store admin |
| Status for one store | `GET /api/v1/admin/store-credentials/:storeId` | Platform operator only |

Customers and signed-out callers cannot use these routes. A store admin, including a store owner whose role is `super_admin`, who calls the platform status route gets `403` with `"Platform admin access required"`.

Missing or invalid tokens use the existing auth envelope (`401`, `status: "error"`). Store-admin rejection uses `{ "success": false, "error": "Admin access required" }` (`403`).

Platform operator access matches build-request ops (issue #170): `User.isPlatformOperator` is true, or the account email is verified and listed in `PLATFORM_OPS_EMAILS`. The admin read uses the store id in the path. `X-Store-ID` does not change it.

## Status

`connected`, `missing`, or `needsAttention`. `needsAttention` means a secret is stored but could not be decrypted or no longer matches the saved shape (for example after `ENCRYPTION_KEY` changes). Upload the key again. Disconnect removes it.

`GET /api/v1/store-credentials` when nothing is saved:

```json
{
  "success": true,
  "data": {
    "apple": { "status": "missing" },
    "google": { "status": "missing" }
  }
}
```

After both platforms are saved:

```json
{
  "success": true,
  "data": {
    "apple": {
      "status": "connected",
      "keyIdLast4": "34EF",
      "issuerIdLast4": "072a",
      "updatedAt": "2026-09-28T18:00:00.000Z"
    },
    "google": {
      "status": "connected",
      "clientEmail": "play-submit@example-store.iam.gserviceaccount.com",
      "privateKeyIdLast4": "abcd",
      "updatedAt": "2026-09-28T18:00:00.000Z"
    }
  }
}
```

`needsAttention` adds a fixed `message` and still omits the private key. The full key id, issuer id, service-account JSON, and ciphertext are never returned.

Upsert and delete respond `200` with the same `data` shape. Delete is idempotent: deleting a missing platform stays `missing`.

The platform read adds `storeId` and the same platform objects. It does not add secrets.

## Upsert Apple

`POST /api/v1/store-credentials/apple`

Prefer `multipart/form-data`:

| Part | Required | Contents |
| --- | --- | --- |
| `keyId` | yes | 10-character Key ID |
| `issuerId` | yes | Issuer ID UUID |
| `privateKey` | yes | The `.p8` file |

JSON is also accepted, with those three string fields. The file wins when both a file and a `privateKey` field are sent. Do not put the key in the query string.

Invalid input is `400`:

```json
{
  "success": false,
  "error": "Check the key ID and issuer ID, then upload the App Store Connect API key (.p8) again.",
  "code": "STORE_CREDENTIALS_INVALID"
}
```

The error text does not echo the uploaded key.

## Upsert Google

`POST /api/v1/store-credentials/google`

Prefer `multipart/form-data` with one file field, `serviceAccount`, containing the JSON file.

JSON is also accepted: the service-account object itself, or `{ "serviceAccount": { } }`. A `storeId` on that wrapper is ignored.

Invalid input is `400` `STORE_CREDENTIALS_INVALID` with `error` "Upload the Google Play service account JSON file again."

Files larger than 64KB are rejected with a fixed message.

## Disconnect

`DELETE /api/v1/store-credentials/apple` and `DELETE /api/v1/store-credentials/google` remove that platform only. When both are gone, the credential document is removed.

## Failures

Save, load, and delete failures use a short message and no stack trace. A missing `ENCRYPTION_KEY` fails the save. It does not return the key that was uploaded.
