# Product Tenancy Migration

GitHub issue: #65
Date: 2026-07-02

> Update (2026-07-03, issue #78): migration verification pass. The backfill
> script now reports per-store product counts, a sample of the products it
> would assign, and the presence of the store-scoped compound unique indexes
> on every run (dry or real); its dry-run/fail-closed behavior is covered by
> `tests/backfillProductStoreId.test.ts`, and sample output recorded against
> a seeded local database is included below. Release gates for this
> migration are in `docs/RELEASE_CHECKLIST.md`.

> Update (2026-07-13, issue #108): no operator-provided staging backup,
> dry-run, backfill, verification, or rollback evidence was present in the
> issue body or comments. This docs pass did not run staging database reads,
> staging database writes, migrations, deployments, or Shopify actions.
> Staging remains pending until the project owner/operator records sanitized
> evidence from the target staging environment.

## Execution status

| Environment | Dry run | Backfill | Verified |
| --- | --- | --- | --- |
| Local (seeded test DB) | ✅ 2026-07-03 (recorded below) | ✅ 2026-07-03 (throwaway DB) | ✅ via script output + Jest suite |
| Staging | ⏳ pending operator output (issue #108; see staging evidence table below) | ⏳ pending operator approval/output (issue #108) | ⏳ pending operator output (issue #108) |
| Production | ❌ not run | ❌ not run | ❌ |

**Staging/production execution is operator work**: it must be run by the
project owner/operator with a database backup and access to the target
environment. AI agents must never run it against shared environments.

### Staging execution evidence (issue #108)

No staging database output was provided in issue #108, and this docs update did
not run staging database reads, writes, migrations, Shopify actions, or
deployments. The staging gates therefore remain pending until the project
owner/operator records the outputs from the target staging environment.
Customer/User/Order legacy `storeId` gates are tracked only in
`docs/RELEASE_CHECKLIST.md` to keep that evidence in one authoritative table.

| Gate | Staging status | Recorded result |
| --- | --- | --- |
| Database backup recorded before migration gates | Pending operator execution | Not provided in issue #108. Record backup/snapshot identifier or storage location without credentials. |
| Product `storeId` dry run (`backfillProductStoreId.ts --dry-run`) | Pending operator execution | Not provided in issue #108. Record target store, storeless product count, sample review result, product counts by store, legacy index status, and compound index status. |
| Product real backfill | Pending operator approval/execution | Not provided in issue #108. Run only after operator approval and backup; record update count and target store. |
| Storeless Product count | Pending operator verification | Not provided in issue #108. Expected after successful backfill: `0` for products with missing/null `storeId`. |
| Product counts by store | Pending operator verification | Not provided in issue #108. Expected: post-run counts match the reviewed dry-run before-picture. |
| Product store-scoped compound unique indexes | Pending operator verification | Not provided in issue #108. Expected: unique `{ storeId, shopifyProductId }`, `{ storeId, handle }`, and `{ storeId, "seo.slug" }` indexes present. |
| Legacy global unique Product indexes | Pending operator verification | Not provided in issue #108. Expected: no single-field unique indexes remain on `shopifyProductId`, `handle`, or `seo.slug`. |
| Product rollback notes | Pending operator record | Not provided in issue #108. Record backup restore path and any approved product `storeId`/index rollback notes after staging execution. |

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

## Runbook (single-store deployment) — operator work

Every step below runs against the target environment's database and is
**operator-only**. Run against staging first, verify, then repeat against
production. `MONGODB_URI` must point at the target environment when invoking
the script.

1. **Backup** the database: `node scripts/backup-database.js` (or your platform snapshot). Record where the backup lives before continuing.
2. **Deploy** this version of the code. Mongoose creates the new compound indexes on startup (this relies on `autoIndex` staying enabled, its current default — if it is ever disabled, run `Product.syncIndexes()` instead). Legacy documents (all under the `null` store key) cannot collide because their values were globally unique before.
3. **Dry run** the backfill and review the output:
   ```
   npx ts-node src/scripts/backfillProductStoreId.ts --dry-run
   ```
   The dry run never writes. Review, in its output:
   - the resolved **target store** (name + id) is the store that owns the legacy products;
   - the count and **sample of products that would be assigned** look like that store's catalog;
   - the **"Product counts by store"** table — record these numbers, they are the before-picture for gate verification;
   - which **legacy unique indexes** are still present and whether the **compound store-scoped indexes** are reported present.
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
7. **Verify** (release-gate evidence — record the outputs):
   - Storeless product count returns `0`:
     ```
     db.products.countDocuments({
       $or: [{ storeId: { $exists: false } }, { storeId: null }]
     })
     ```
   - Per-store product counts match the dry-run before-picture (legacy count moved onto the target store, no other store's count changed):
     ```
     db.products.aggregate([
       { $group: { _id: "$storeId", count: { $sum: 1 } } },
       { $sort: { count: -1 } }
     ])
     ```
     (also printed by the script as "Product counts by store" on any run, including `--dry-run`.)
   - Store-scoped compound unique product indexes are present:
     ```
     db.products.getIndexes().filter(index =>
       index.unique === true &&
       [
         JSON.stringify({ storeId: 1, shopifyProductId: 1 }),
         JSON.stringify({ storeId: 1, handle: 1 }),
         JSON.stringify({ storeId: 1, "seo.slug": 1 })
       ].includes(JSON.stringify(index.key))
     )
     ```
     Expected: three indexes.
   - Legacy global unique product indexes are absent:
     ```
     db.products.getIndexes().filter(index =>
       index.unique === true &&
       [
         JSON.stringify({ shopifyProductId: 1 }),
         JSON.stringify({ handle: 1 }),
         JSON.stringify({ "seo.slug": 1 })
       ].includes(JSON.stringify(index.key))
     )
     ```
     Expected: `[]`. Non-unique single-field lookup indexes on those fields are expected and should stay.
   - A product webhook for the store updates the existing product rather than creating a duplicate.
8. **Update the "Execution status" table** at the top of this document and check off the gates in `docs/RELEASE_CHECKLIST.md`.

## Sample output (recorded 2026-07-03 against a seeded local test database)

Seeded with one store, three legacy products without `storeId`, and the
pre-tenancy `handle_1` unique index. Dry run, recorded with
`--dry-run --drop-legacy-indexes` (exit 0, nothing written). With plain
`--dry-run` (runbook step 3) the index line reads
`⚠️ Legacy unique index still present: handle_1 (re-run with --drop-legacy-indexes to drop; ...)`
instead:

```
🔄 Starting Product.storeId backfill (dry run)...

✅ Connected to MongoDB

🎯 Target store (single store detected): Demo Store (6a47da63d76f9369e618d98c)

📦 Products without storeId: 3
   Sample of products that would be assigned to 6a47da63d76f9369e618d98c:
   - 6a47da63d76f9369e618d98d | Legacy Product 1 | handle=legacy-product-1 | shopifyProductId=900001
   - 6a47da63d76f9369e618d98e | Legacy Product 2 | handle=legacy-product-2 | shopifyProductId=900002
   - 6a47da63d76f9369e618d98f | Legacy Product 3 | handle=legacy-product-3 | shopifyProductId=900003
💡 Dry run: no documents were modified

📊 Product counts by store:
   - (no storeId - legacy): 3

💡 Dry run: would drop legacy unique index: handle_1
⚠️ Store-scoped compound unique index MISSING: {"storeId":1,"shopifyProductId":1} (restart the app or run Product.syncIndexes())
⚠️ Store-scoped compound unique index MISSING: {"storeId":1,"handle":1} (restart the app or run Product.syncIndexes())
⚠️ Store-scoped compound unique index MISSING: {"storeId":1,"seo.slug":1} (restart the app or run Product.syncIndexes())

💡 After dropping legacy indexes, restart the app (or run Product.syncIndexes()) so the store-scoped compound indexes are created.
🏁 Backfill complete
```

Real run with `--store-id <id> --drop-legacy-indexes` (exit 0):

```
📦 Products without storeId: 3
   Sample of products being assigned to 6a47da63d76f9369e618d98c:
   - ...
✅ Backfilled storeId on 3 products

📊 Product counts by store:
   - Demo Store (6a47da63d76f9369e618d98c): 3

🗑️ Dropped legacy unique index: handle_1
```

The "compound index MISSING" warnings in the sample are expected on a bare
seeded database where the app never started; after step 6 (app restart /
`Product.syncIndexes()`) the script reports
`✅ Store-scoped compound unique indexes present`, which is asserted by
`tests/backfillProductStoreId.test.ts`.

## Rollback

- Code rollback: redeploy the previous version. Legacy reads are unaffected (`storeId` is ignored by old code).
- Data rollback: `storeId` can be removed with `db.products.updateMany({ storeId: <id> }, { $unset: { storeId: 1 } })`, or restore the backup from step 1. Recreate any dropped unique indexes only if rolling back permanently.

## Follow-up (not part of this migration)

- Make `Product.storeId` required at the schema level once all environments are backfilled.
- Store-scope customer/order sync and remaining webhook writes (see `docs/SHOPIFY_ADMIN_WEBHOOK_TENANT_AUDIT.md` follow-up issues 4-6).
- Store-scope public/local product read paths, which currently query globally.
