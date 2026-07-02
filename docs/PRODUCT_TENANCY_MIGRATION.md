# Product Tenancy Migration

GitHub issue: #65
Date: 2026-07-02

Products are now tenant-scoped: `Product.storeId` references the owning `Store`, and Shopify identifier uniqueness (`shopifyProductId`, `handle`, `seo.slug`) is enforced per store instead of globally. This document is the runbook for migrating an existing (single-store) deployment safely.

## What changed in code

- `Product.storeId` (`ObjectId`, ref `Store`, indexed) added to the schema. It is **optional at the schema level** until the backfill below has run; every runtime create path (product sync, product webhooks) sets it.
- Field-level `unique: true` removed from `shopifyProductId`, `handle`, and `seo.slug`.
- Store-scoped compound unique indexes added:
  - `{ storeId: 1, shopifyProductId: 1 }` (unique, partial: only documents with `shopifyProductId`)
  - `{ storeId: 1, handle: 1 }` (unique)
  - `{ storeId: 1, 'seo.slug': 1 }` (unique)
- `syncProduct()` requires a `storeId` and refuses to upsert without one (no global fallback); `syncProducts()` resolves the connected store once and passes its id through.
- Product and inventory webhook handlers query and write by `{ storeId, ... }` using the trusted store resolved by webhook tenant mapping (#63).

## Why a backfill is required

Legacy products have no `storeId`. After this change:

- Tenant-scoped webhook and sync lookups (`{ storeId, shopifyProductId }`) will **not match** legacy products until they are backfilled, so product/inventory webhooks would create duplicates or log zero-match warnings instead of updating them.
- MongoDB does not drop existing indexes when the schema stops declaring them. The legacy **global** unique indexes (`shopifyProductId_1`, `handle_1`, `seo.slug_1`) remain in the collection and will keep rejecting cross-store duplicates until dropped manually.

## Runbook (single-store deployment)

1. **Backup** the database: `node scripts/backup-database.js` (or your platform snapshot).
2. **Deploy** this version of the code. Mongoose creates the new compound indexes on startup (this relies on `autoIndex` staying enabled, its current default — if it is ever disabled, run `Product.syncIndexes()` instead). Legacy documents (all under the `null` store key) cannot collide because their values were globally unique before.
3. **Dry run** the backfill and review the output:
   ```
   npx ts-node src/scripts/backfillProductStoreId.ts --dry-run
   ```
4. **Backfill** legacy products to the store. With exactly one store the script auto-detects it; otherwise pass `--store-id`:
   ```
   npx ts-node src/scripts/backfillProductStoreId.ts --store-id <storeId>
   ```
   The script refuses to guess when multiple stores exist.
5. **Drop the legacy global unique indexes** (required before onboarding a second store):
   ```
   npx ts-node src/scripts/backfillProductStoreId.ts --store-id <storeId> --drop-legacy-indexes
   ```
   Verify with `db.products.getIndexes()` that no single-field **unique** index remains on `shopifyProductId`, `handle`, or `seo.slug`. The non-unique single-field lookup indexes declared by the schema are expected and should stay.
6. **Restart the app** (or run `Product.syncIndexes()`) so index state matches the schema.
7. **Verify**:
   - `db.products.countDocuments({ storeId: { $exists: false } })` returns `0`.
   - A product webhook for the store updates the existing product rather than creating a duplicate.

## Rollback

- Code rollback: redeploy the previous version. Legacy reads are unaffected (`storeId` is ignored by old code).
- Data rollback: `storeId` can be removed with `db.products.updateMany({ storeId: <id> }, { $unset: { storeId: 1 } })`, or restore the backup from step 1. Recreate any dropped unique indexes only if rolling back permanently.

## Follow-up (not part of this migration)

- Make `Product.storeId` required at the schema level once all environments are backfilled.
- Store-scope customer/order sync and remaining webhook writes (see `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md` follow-up issues 4-6).
- Store-scope public/local product read paths, which currently query globally.
