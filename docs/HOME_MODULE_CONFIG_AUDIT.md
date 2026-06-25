# Home Module Configuration Audit

## Scope

This audit covers the current backend configuration used to assemble the mobile home screen. It is intentionally documentation-only and does not change API behavior.

Reviewed areas:

- Home screen response assembly in `src/controllers/homescreenController.ts`.
- TSOA home screen response contract in `src/controllers/homescreenTsoaController.ts`.
- Home module API types in `src/types/api/homescreen.ts` and shared action types in `src/types/api/common.ts`.
- Module persistence models for carousel, banners, category grids, collection displays, collection showcases, and layout ordering.
- Admin/public route controllers that create, replace, delete, toggle, and list those module records.

## Current home screen assembly

`GET /api/v1/customer/homescreen` requires a store ID from `X-Store-ID` or `storeId` query parameter. The controller fetches the active records for each module type with `storeId` filters and returns the modules plus a `layout` array. `collectionDisplays` are additionally enriched by fetching the configured Shopify collection ID through the Storefront service before returning the response.

The current response includes these module buckets:

1. `carousel`
2. `promoBanners`
3. `calloutBanners`
4. `categoryGrid`
5. `collectionDisplays`
6. `collectionShowcases`
7. `categoryCollectionGrid`
8. `layout`

## Supported module types and required configuration

| Module type | Storage model | API/admin routes | Required saved fields | Optional/default fields | Shopify IDs / links |
| --- | --- | --- | --- | --- | --- |
| `carousel` | `CarouselItem` | `GET /carousel`, `POST /admin/carousel/item`, `POST /admin/carousel`, `PUT /admin/carousel`, `DELETE /admin/carousel/:id`, `PATCH /admin/carousel/:id/status` | `storeId`, `imageUrl`, `label`, `title`, `subtitle`, `collectionId`, `position` | `ctaText` defaults to `Shop Now`; `endsAt`; `promoTag`; `isActive` defaults to `true` | `collectionId` is a manually supplied string. |
| `promo_banners` / `promoBanners` | `PromoBanner` | `GET /promo-banners`, `POST /admin/promo-banners`, `PUT /admin/promo-banners`, `DELETE /admin/promo-banners/:id`, `PATCH /admin/promo-banners/:id/status` | `storeId`, `image`, `title`, `subtitle`, `ctaText`, `collectionId`, `position` | `backgroundColor`, `textColor`, and `buttonColor` have defaults; `isActive` defaults to `true` | `collectionId` is a manually supplied string. |
| `callout_banners` / `calloutBanners` | `CalloutBanner` | `GET /callout-banners`, `POST /admin/callout-banners`, `PUT /admin/callout-banners`, `DELETE /admin/callout-banners/:id`, `PATCH /admin/callout-banners/:id/status` | `storeId`, `imageUrl`, `title`, `subTitle`, `buttonText`, `action`, `position` | `backgroundColor`, `textColor`, and `buttonColor` have defaults; `isActive` defaults to `true`; top-level numeric `collectionId` is optional/legacy | `action.type` can be `collection` or `navigation`; `action.collectionId` is required by schema when `type=collection`; `action.navigateTo` is required by schema when `type=navigation`. |
| `category_grid` / `categoryGrid` | `CategoryGrid` | `GET /category-grid`, `POST /admin/category-grid`, `PUT /admin/category-grid`, `DELETE /admin/category-grid/:id`, `PATCH /admin/category-grid/:id/status` | `storeId`, `imageUrl`, `title`, `collectionId`, `position` | `isActive` defaults to `true` | `collectionId` is a manually supplied string. |
| `collection_displays` / `collectionDisplays` | `CollectionDisplay` | `GET /collection-displays`, `POST /admin/collection-displays`, `PUT /admin/collection-displays`, `DELETE /admin/collection-displays/:id`, `PATCH /admin/collection-displays/:id/status` | `storeId`, `type`, `collectionId`, `order` | `title`; `isActive` defaults to `true` | `collectionId` is used at read time to fetch Shopify collection data; supported display `type` values are `large_row`, `small_grid`, and `medium_row`. |
| `collection_showcases` / `collectionShowcases` | `CollectionShowcase` | `GET /collection-showcases`, `POST /admin/collection-showcases`, `PUT /admin/collection-showcases`, `DELETE /admin/collection-showcases/:id`, `PATCH /admin/collection-showcases/:id/status` | `storeId`, `type`, `title`, `collections[]`, `position` | `icon`; `isActive` defaults to `true` | Each `collections[]` item requires `image`, `title`, and manually supplied `collectionId`; supported `type` values are `grid` and `circular`. |
| `category_collection_grid` / `categoryCollectionGrid` | `CategoryCollectionGrid` | `GET /category-collection-grids`, `POST /admin/category-collection-grids`, `PUT /admin/category-collection-grids`, `DELETE /admin/category-collection-grids/:id`, `PATCH /admin/category-collection-grids/:id/status` | `storeId`, `title`, `subtitle`, `collections[]`, `position` | `isActive` defaults to `true` | Each `collections[]` item requires `image`, `title`, and manually supplied `collectionId`. |
| `layout` | `HomeLayout` | Read by the home screen controller; no dedicated controller route found in this audit | `storeId`, `sections[]` | Defaults to `DEFAULT_HOME_SECTIONS` when no record exists | `sections[].type` must be one of the supported section enum values; `sections[].position` controls order; `sections[].isVisible` defaults to `true`. |

## Validation observed today

### What is enforced by schemas

- All module records require `storeId` and index by store for tenant-scoped reads.
- Mongoose required fields enforce presence for core text/image/link/order fields during save/insert.
- Enum validation exists for:
  - `CalloutBanner.action.type`: `collection` or `navigation`.
  - `CollectionDisplay.type`: `large_row`, `small_grid`, or `medium_row`.
  - `CollectionShowcase.type`: `grid` or `circular`.
  - `HomeLayout.sections[].type`: supported layout section names.
- Nested collection arrays in `CategoryCollectionGrid` and `CollectionShowcase` require at least one item.
- Conditional schema requirements exist for callout banner actions: collection actions require `action.collectionId`; navigation actions require `action.navigateTo`.

### What controllers validate before saving

- Admin create/update endpoints require store authentication through `req.storeId` before mutating module records.
- Bulk endpoints check that the request body or named wrapper array is a non-empty array before replacing a module set.
- Some controllers perform light required-field checks, such as `collectionId` and `order` for collection displays.
- Delete and status-update endpoints include both `_id` and `storeId` in mutation filters, which prevents cross-store writes for those operations.

### Validation gaps and operational risks

- Most create/update controllers map request bodies directly into models and rely on Mongoose for required-field validation. That means invalid payloads generally surface as `500` responses instead of consistent `400` validation errors.
- Public list endpoints for individual modules only filter by `storeId` when `req.storeId` is present. They can become unscoped if mounted without middleware that always resolves a store ID. The aggregate home screen endpoint is stricter and rejects missing store IDs.
- Shopify `collectionId` values are manually entered strings in most modules. There is no backend pre-save validation that the ID exists in Shopify, belongs to the current store, or matches the expected Storefront/Admin GraphQL ID shape.
- `collectionDisplays` are the only module type enriched against Shopify at home screen read time; invalid IDs are logged and omitted from the response. Other modules can return stale or incorrect IDs directly to clients.
- No current home module stores a product ID. Product picker support would require new schema fields and validation rules if future modules deep-link to products.
- Image fields are plain strings. There is no central validation for URL format, allowed asset host, image dimensions, or whether an image has been uploaded through the approved image pipeline.
- Position/order fields are numeric but not normalized or uniqueness-constrained per store/module, so duplicated or sparse ordering can occur.
- `CalloutBanner` has both `action.collectionId` as a string and a top-level `collectionId` as a number. The top-level field appears inconsistent with the rest of the home module configuration and should be treated carefully before dashboard editing exposes it.
- `HomeLayout` has model-level enum validation, but this audit did not find a dedicated controller for validating or updating dashboard layout sections.

## Shopify collection/product ID usage

Current home module Shopify ID usage is collection-centric:

- `CarouselItem.collectionId`
- `PromoBanner.collectionId`
- `CategoryGrid.collectionId`
- `CalloutBanner.action.collectionId`
- `CollectionDisplay.collectionId`
- `CategoryCollectionGrid.collections[].collectionId`
- `CollectionShowcase.collections[].collectionId`

`CollectionDisplay.collectionId` is used server-side to fetch Shopify collection details and products for the home screen response. The other collection IDs are passed through for client navigation or rendering.

No home module model reviewed in this audit requires or stores a Shopify product ID today.

## Recommendations for safer dashboard management

1. Add shared server-side validators for home module payloads that return `400` responses before Mongoose save/insert calls. These validators should enforce required fields, enum values, string trimming, URL formats, boolean types, and non-negative integer positions/orders.
2. Add a collection picker endpoint for the dashboard that lists Shopify collections from the authenticated store. Persist the selected Shopify collection ID plus useful display metadata, such as title/image snapshot, to reduce manual copy/paste.
3. Validate collection references against store-specific Shopify credentials before publishing active modules. For draft workflows, allow unresolved IDs only in draft state and block publish until validation passes.
4. Store IDs in a consistent format, preferably Shopify GraphQL global IDs if Storefront queries require them, and document conversion rules if Admin REST numeric IDs are accepted anywhere.
5. Add a future product picker only when a module type needs product-level links. It should mirror collection picker behavior by using store-specific Shopify credentials and validating selected product IDs before publish.
6. Normalize `position`/`order` values during replace/update operations and consider a per-store uniqueness rule for each module bucket to prevent ambiguous layout order.
7. Consolidate module type definitions into a single backend source of truth used by models, TSOA types, dashboard validation, and docs so the dashboard cannot publish unsupported module payloads.
8. Clarify or remove the legacy top-level numeric `CalloutBanner.collectionId` before exposing callout editing broadly in the dashboard.

## Suggested future collection/product picker shape

A safe dashboard picker can be added without changing mobile rendering by introducing admin-only endpoints such as:

- `GET /api/v1/admin/shopify/collections?query=&after=`
- `GET /api/v1/admin/shopify/products?query=&after=`

Recommended response fields:

- `id`: canonical Shopify ID used by backend saves.
- `title`: human-readable display name.
- `handle`: optional Shopify handle for search/debugging.
- `imageUrl`: thumbnail for picker display.
- `status` or availability flags when available.

Recommended save flow:

1. Dashboard user selects an item from a store-scoped picker.
2. Backend receives the canonical selected ID in the home module payload.
3. Backend validates the ID against the same store before saving/publishing.
4. Backend stores the ID and optional display snapshot.
5. Mobile continues to receive the current home module response shape.

## No behavior changes

This audit intentionally adds only documentation. It does not modify controllers, models, routes, generated API files, checkout, auth, Shopify client behavior, or mobile response shapes.
