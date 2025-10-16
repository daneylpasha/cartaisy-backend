/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ShopifySearchController } from './../controllers/shopifySearchController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SearchController } from './../controllers/searchController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProductDetailController } from './../controllers/productDetailController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HomescreenController } from './../controllers/homescreenController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FavoritesController } from './../controllers/favoritesController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CollectionController } from './../controllers/collectionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CartController } from './../controllers/cartController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AddressController } from './../controllers/addressController';
import { expressAuthentication } from './../authentication';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "PredictiveSearchProduct": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "handle": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "productType": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "featuredImage": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"altText":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"url":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},
            "priceRange": {"dataType":"nestedObjectLiteral","nestedProperties":{"minVariantPrice":{"dataType":"nestedObjectLiteral","nestedProperties":{"currencyCode":{"dataType":"string","required":true},"amount":{"dataType":"string","required":true}},"required":true}},"required":true},
            "compareAtPriceRange": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"minVariantPrice":{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"currencyCode":{"dataType":"string","required":true},"amount":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}],"required":true}}},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PredictiveSearchCollection": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "handle": {"dataType":"string","required":true},
            "image": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"altText":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"url":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PredictiveSearchResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"totalResults":{"dataType":"double","required":true},"collections":{"dataType":"array","array":{"dataType":"refObject","ref":"PredictiveSearchCollection"},"required":true},"products":{"dataType":"array","array":{"dataType":"refObject","ref":"PredictiveSearchProduct"},"required":true},"query":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchProduct": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "handle": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "productType": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "availableForSale": {"dataType":"boolean","required":true},
            "totalInventory": {"dataType":"double","required":true},
            "minPrice": {"dataType":"double","required":true},
            "maxPrice": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "currency": {"dataType":"string","required":true},
            "images": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"altText":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"url":{"dataType":"string","required":true}}},"required":true},
            "variants": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"selectedOptions":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"value":{"dataType":"string","required":true},"name":{"dataType":"string","required":true}}},"required":true},"quantityAvailable":{"dataType":"double","required":true},"availableForSale":{"dataType":"boolean","required":true},"price":{"dataType":"double","required":true},"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchPageInfo": {
        "dataType": "refObject",
        "properties": {
            "hasNextPage": {"dataType":"boolean","required":true},
            "hasPreviousPage": {"dataType":"boolean","required":true},
            "endCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "startCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchSortKey": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["RELEVANCE"]},{"dataType":"enum","enums":["PRICE"]},{"dataType":"enum","enums":["BEST_SELLING"]},{"dataType":"enum","enums":["CREATED_AT"]},{"dataType":"enum","enums":["TITLE"]},{"dataType":"enum","enums":["PRODUCT_TYPE"]},{"dataType":"enum","enums":["VENDOR"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchProductsResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"reverse":{"dataType":"boolean","required":true},"sortKey":{"ref":"SearchSortKey","required":true},"totalCount":{"dataType":"double","required":true},"pageInfo":{"ref":"SearchPageInfo","required":true},"products":{"dataType":"array","array":{"dataType":"refObject","ref":"SearchProduct"},"required":true},"query":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PopularSearchItem": {
        "dataType": "refObject",
        "properties": {
            "query": {"dataType":"string","required":true},
            "searchCount": {"dataType":"double","required":true},
            "avgResultsCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PopularSearchesResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"searches":{"dataType":"array","array":{"dataType":"refObject","ref":"PopularSearchItem"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecentSearchesResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"searches":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"searchedAt":{"dataType":"datetime","required":true},"resultsCount":{"dataType":"double","required":true},"query":{"dataType":"string","required":true}}},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EnrichedProduct": {
        "dataType": "refObject",
        "properties": {
            "productId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "images": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
            "inStock": {"dataType":"boolean","required":true},
            "availableQuantity": {"dataType":"double","required":true},
            "totalQuantity": {"dataType":"double","required":true},
            "handle": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "rating": {"dataType":"double","required":true},
            "reviewsCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionWithProducts": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "handle": {"dataType":"string","required":true},
            "image": {"dataType":"string"},
            "products": {"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedProduct"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InitialSearchScreenResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"metadata":{"dataType":"nestedObjectLiteral","nestedProperties":{"isFallback":{"dataType":"nestedObjectLiteral","nestedProperties":{"collections":{"dataType":"boolean","required":true},"products":{"dataType":"boolean","required":true}},"required":true},"lastUpdated":{"dataType":"string","required":true},"collectionsCount":{"dataType":"double","required":true},"productsCount":{"dataType":"double","required":true},"timeframe":{"dataType":"double","required":true}},"required":true},"trendingCollections":{"dataType":"array","array":{"dataType":"refObject","ref":"CollectionWithProducts"},"required":true},"trendingProducts":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedProduct"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EnrichedSearchItem": {
        "dataType": "refObject",
        "properties": {
            "query": {"dataType":"string","required":true},
            "searchedAt": {"dataType":"datetime","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["product"]},{"dataType":"enum","enums":["collection"]}],"required":true},
            "product": {"ref":"EnrichedProduct"},
            "collection": {"ref":"CollectionWithProducts"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "EnrichedTrendingSearch": {
        "dataType": "refObject",
        "properties": {
            "query": {"dataType":"string","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["product"]},{"dataType":"enum","enums":["collection"]}],"required":true},
            "recentCount": {"dataType":"double","required":true},
            "growthRate": {"dataType":"double","required":true},
            "product": {"ref":"EnrichedProduct"},
            "collection": {"ref":"CollectionWithProducts"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SearchContextResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"metadata":{"dataType":"nestedObjectLiteral","nestedProperties":{"isFallback":{"dataType":"nestedObjectLiteral","nestedProperties":{"products":{"dataType":"boolean","required":true}},"required":true},"lastUpdated":{"dataType":"string","required":true},"timeframe":{"dataType":"double","required":true},"productsCount":{"dataType":"double","required":true},"trendingSearchesCount":{"dataType":"double","required":true},"recentSearchesCount":{"dataType":"double","required":true},"isAuthenticated":{"dataType":"boolean","required":true}},"required":true},"trendingProducts":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedProduct"},"required":true},"trendingSearches":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedTrendingSearch"},"required":true},"recentSearches":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedSearchItem"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductOption": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "value": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductVariant": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"double"},
            "availableForSale": {"dataType":"boolean","required":true},
            "quantityAvailable": {"dataType":"double","required":true},
            "selectedOptions": {"dataType":"array","array":{"dataType":"refObject","ref":"ProductOption"},"required":true},
            "image": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductMetafield": {
        "dataType": "refObject",
        "properties": {
            "namespace": {"dataType":"string","required":true},
            "key": {"dataType":"string","required":true},
            "value": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductBadges": {
        "dataType": "refObject",
        "properties": {
            "isBestSeller": {"dataType":"boolean","required":true},
            "discountPercentage": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductDetail": {
        "dataType": "refObject",
        "properties": {
            "productId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "descriptionHtml": {"dataType":"string","required":true},
            "images": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"double"},
            "currency": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "productType": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "handle": {"dataType":"string","required":true},
            "availableForSale": {"dataType":"boolean","required":true},
            "totalInventory": {"dataType":"double","required":true},
            "inStock": {"dataType":"boolean","required":true},
            "variants": {"dataType":"array","array":{"dataType":"refObject","ref":"ProductVariant"},"required":true},
            "metafields": {"dataType":"array","array":{"dataType":"refObject","ref":"ProductMetafield"},"required":true},
            "rating": {"dataType":"double","required":true},
            "reviewsCount": {"dataType":"double","required":true},
            "soldThisMonth": {"dataType":"double","required":true},
            "badges": {"ref":"ProductBadges","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductDetailResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"ref":"ProductDetail","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PromoTag": {
        "dataType": "refObject",
        "properties": {
            "text": {"dataType":"string"},
            "imageUrl": {"dataType":"string"},
            "backgroundColor": {"dataType":"string"},
            "textColor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CarouselItem": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "ctaText": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
            "endsAt": {"dataType":"string"},
            "promoTag": {"ref":"PromoTag"},
            "isActive": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryGridItem": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
            "isActive": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Action": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["collection"]},{"dataType":"enum","enums":["navigation"]}],"required":true},
            "collectionId": {"dataType":"string"},
            "navigateTo": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CalloutBannerItem": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subTitle": {"dataType":"string","required":true},
            "buttonText": {"dataType":"string","required":true},
            "action": {"ref":"Action","required":true},
            "position": {"dataType":"double","required":true},
            "isActive": {"dataType":"boolean","required":true},
            "backgroundColor": {"dataType":"string"},
            "textColor": {"dataType":"string"},
            "buttonColor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PromoBannerItem": {
        "dataType": "refObject",
        "properties": {
            "image": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "ctaText": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
            "position": {"dataType":"double","required":true},
            "isActive": {"dataType":"boolean","required":true},
            "backgroundColor": {"dataType":"string"},
            "textColor": {"dataType":"string"},
            "buttonColor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Product": {
        "dataType": "refObject",
        "properties": {
            "productId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "images": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"double"},
            "currency": {"dataType":"string","required":true},
            "inStock": {"dataType":"boolean","required":true},
            "availableQuantity": {"dataType":"double","required":true},
            "totalQuantity": {"dataType":"double","required":true},
            "rating": {"dataType":"double","required":true},
            "reviewsCount": {"dataType":"double","required":true},
            "handle": {"dataType":"string"},
            "vendor": {"dataType":"string"},
            "tags": {"dataType":"array","array":{"dataType":"string"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Collection": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "handle": {"dataType":"string"},
            "image": {"dataType":"string"},
            "products": {"dataType":"array","array":{"dataType":"refObject","ref":"Product"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionDisplay": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["large_row"]},{"dataType":"enum","enums":["small_grid"]},{"dataType":"enum","enums":["medium_row"]}],"required":true},
            "order": {"dataType":"double","required":true},
            "collection": {"ref":"Collection","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryCollectionItem": {
        "dataType": "refObject",
        "properties": {
            "image": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryCollectionGridItem": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "collections": {"dataType":"array","array":{"dataType":"refObject","ref":"CategoryCollectionItem"},"required":true},
            "position": {"dataType":"double","required":true},
            "isActive": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShowcaseCollectionItem": {
        "dataType": "refObject",
        "properties": {
            "image": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionShowcaseItem": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["grid"]},{"dataType":"enum","enums":["circular"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "icon": {"dataType":"string"},
            "collections": {"dataType":"array","array":{"dataType":"refObject","ref":"ShowcaseCollectionItem"},"required":true},
            "position": {"dataType":"double","required":true},
            "isActive": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HomescreenMetadata": {
        "dataType": "refObject",
        "properties": {
            "carouselItemsCount": {"dataType":"double","required":true},
            "categoryGridItemsCount": {"dataType":"double","required":true},
            "calloutBannersCount": {"dataType":"double","required":true},
            "promoBannersCount": {"dataType":"double","required":true},
            "collectionDisplaysCount": {"dataType":"double","required":true},
            "categoryCollectionGridCount": {"dataType":"double","required":true},
            "collectionShowcasesCount": {"dataType":"double","required":true},
            "lastUpdated": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HomescreenData": {
        "dataType": "refObject",
        "properties": {
            "carousel": {"dataType":"array","array":{"dataType":"refObject","ref":"CarouselItem"},"required":true},
            "categoryGrid": {"dataType":"array","array":{"dataType":"refObject","ref":"CategoryGridItem"},"required":true},
            "calloutBanners": {"dataType":"array","array":{"dataType":"refObject","ref":"CalloutBannerItem"},"required":true},
            "promoBanners": {"dataType":"array","array":{"dataType":"refObject","ref":"PromoBannerItem"},"required":true},
            "collectionDisplays": {"dataType":"array","array":{"dataType":"refObject","ref":"CollectionDisplay"},"required":true},
            "categoryCollectionGrid": {"dataType":"array","array":{"dataType":"refObject","ref":"CategoryCollectionGridItem"},"required":true},
            "collectionShowcases": {"dataType":"array","array":{"dataType":"refObject","ref":"CollectionShowcaseItem"},"required":true},
            "metadata": {"ref":"HomescreenMetadata","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HomescreenResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"ref":"HomescreenData","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FavoritesResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"productIds":{"dataType":"array","array":{"dataType":"string"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FavoriteOperationResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FavoriteRequest": {
        "dataType": "refObject",
        "properties": {
            "productId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionProduct": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "handle": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "productType": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "availableForSale": {"dataType":"boolean","required":true},
            "totalInventory": {"dataType":"double","required":true},
            "minPrice": {"dataType":"double","required":true},
            "maxPrice": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "currency": {"dataType":"string","required":true},
            "images": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"altText":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"url":{"dataType":"string","required":true}}},"required":true},
            "variants": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"selectedOptions":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"value":{"dataType":"string","required":true},"name":{"dataType":"string","required":true}}}},"quantityAvailable":{"dataType":"double","required":true},"availableForSale":{"dataType":"boolean","required":true},"price":{"dataType":"double","required":true},"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "FacetOption": {
        "dataType": "refObject",
        "properties": {
            "value": {"dataType":"string","required":true},
            "count": {"dataType":"double","required":true},
            "label": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PriceRangeFacet": {
        "dataType": "refObject",
        "properties": {
            "min": {"dataType":"double","required":true},
            "max": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionFacets": {
        "dataType": "refObject",
        "properties": {
            "categories": {"dataType":"array","array":{"dataType":"refObject","ref":"FacetOption"},"required":true},
            "vendors": {"dataType":"array","array":{"dataType":"refObject","ref":"FacetOption"},"required":true},
            "priceRange": {"ref":"PriceRangeFacet","required":true},
            "colors": {"dataType":"array","array":{"dataType":"refObject","ref":"FacetOption"}},
            "tags": {"dataType":"array","array":{"dataType":"refObject","ref":"FacetOption"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionProductsData": {
        "dataType": "refObject",
        "properties": {
            "collectionId": {"dataType":"string","required":true},
            "collectionTitle": {"dataType":"string","required":true},
            "collectionDescription": {"dataType":"string","required":true},
            "products": {"dataType":"array","array":{"dataType":"refObject","ref":"CollectionProduct"},"required":true},
            "facets": {"ref":"CollectionFacets","required":true},
            "pageInfo": {"dataType":"nestedObjectLiteral","nestedProperties":{"startCursor":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"endCursor":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"hasPreviousPage":{"dataType":"boolean","required":true},"hasNextPage":{"dataType":"boolean","required":true}},"required":true},
            "totalCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionProductsResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"ref":"CollectionProductsData","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductCollectionSortKey": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["BEST_SELLING"]},{"dataType":"enum","enums":["COLLECTION_DEFAULT"]},{"dataType":"enum","enums":["CREATED"]},{"dataType":"enum","enums":["ID"]},{"dataType":"enum","enums":["MANUAL"]},{"dataType":"enum","enums":["PRICE"]},{"dataType":"enum","enums":["RELEVANCE"]},{"dataType":"enum","enums":["TITLE"]},{"dataType":"enum","enums":["DISCOUNT"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartLineItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "merchandiseId": {"dataType":"string","required":true},
            "productId": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "variantTitle": {"dataType":"string","required":true},
            "image": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "quantity": {"dataType":"double","required":true},
            "quantityAvailable": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartData": {
        "dataType": "refObject",
        "properties": {
            "cartId": {"dataType":"string","required":true},
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"CartLineItem"},"required":true},
            "totalQuantity": {"dataType":"double","required":true},
            "subtotal": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"ref":"CartData","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartItemInput": {
        "dataType": "refObject",
        "properties": {
            "merchandiseId": {"dataType":"string","required":true},
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartCreateRequest": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"CartItemInput"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddItemsRequest": {
        "dataType": "refObject",
        "properties": {
            "items": {"dataType":"array","array":{"dataType":"refObject","ref":"CartItemInput"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateItemQuantityRequest": {
        "dataType": "refObject",
        "properties": {
            "quantity": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ClearCartResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "IAddress": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "company": {"dataType":"string"},
            "address1": {"dataType":"string","required":true},
            "address2": {"dataType":"string"},
            "city": {"dataType":"string"},
            "province": {"dataType":"string","required":true},
            "country": {"dataType":"string","required":true},
            "countryCode": {"dataType":"string"},
            "zip": {"dataType":"string","required":true},
            "phone": {"dataType":"string"},
            "deliveryInstructions": {"dataType":"string"},
            "isDefault": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
        const argsShopifySearchController_getSearchSuggestions: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/search/suggestions',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.getSearchSuggestions)),

            async function ShopifySearchController_getSearchSuggestions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_getSearchSuggestions, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'getSearchSuggestions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopifySearchController_searchProducts: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                sortKey: {"in":"query","name":"sortKey","ref":"SearchSortKey"},
                reverse: {"in":"query","name":"reverse","dataType":"boolean"},
        };
        app.get('/api/v1/search/products',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.searchProducts)),

            async function ShopifySearchController_searchProducts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_searchProducts, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'searchProducts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopifySearchController_trackProductClick: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"productId":{"dataType":"string","required":true},"query":{"dataType":"string","required":true}}},
        };
        app.post('/api/v1/search/track-click',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.trackProductClick)),

            async function ShopifySearchController_trackProductClick(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_trackProductClick, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'trackProductClick',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopifySearchController_getPopularSearches: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                days: {"in":"query","name":"days","dataType":"double"},
        };
        app.get('/api/v1/search/popular',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.getPopularSearches)),

            async function ShopifySearchController_getPopularSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_getPopularSearches, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'getPopularSearches',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopifySearchController_getRecentSearches: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/search/history',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.getRecentSearches)),

            async function ShopifySearchController_getRecentSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_getRecentSearches, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'getRecentSearches',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsShopifySearchController_clearSearchHistory: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/search/history/clear',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.clearSearchHistory)),

            async function ShopifySearchController_clearSearchHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_clearSearchHistory, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'clearSearchHistory',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getInitialSearchScreen: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                timeframe: {"in":"query","name":"timeframe","dataType":"double"},
        };
        app.get('/api/v1/customer/search/initial-screen',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getInitialSearchScreen)),

            async function SearchController_getInitialSearchScreen(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getInitialSearchScreen, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getInitialSearchScreen',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getSearchContext: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                timeframe: {"in":"query","name":"timeframe","dataType":"double"},
        };
        app.get('/api/v1/customer/search/context',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getSearchContext)),

            async function SearchController_getSearchContext(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getSearchContext, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getSearchContext',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_search: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                page: {"in":"query","name":"page","dataType":"double"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                category: {"in":"query","name":"category","dataType":"string"},
                priceMin: {"in":"query","name":"priceMin","dataType":"double"},
                priceMax: {"in":"query","name":"priceMax","dataType":"double"},
                brand: {"in":"query","name":"brand","dataType":"string"},
                rating: {"in":"query","name":"rating","dataType":"double"},
                inStock: {"in":"query","name":"inStock","dataType":"string"},
                sortBy: {"in":"query","name":"sortBy","dataType":"string"},
        };
        app.get('/api/v1/customer/search',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.search)),

            async function SearchController_search(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_search, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'search',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getSearchSuggestions: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/customer/search/suggestions',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getSearchSuggestions)),

            async function SearchController_getSearchSuggestions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getSearchSuggestions, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getSearchSuggestions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getPopularSearches: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                days: {"in":"query","name":"days","dataType":"double"},
        };
        app.get('/api/v1/customer/search/popular',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getPopularSearches)),

            async function SearchController_getPopularSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getPopularSearches, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getPopularSearches',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getTrendingSearches: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/customer/search/trending',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getTrendingSearches)),

            async function SearchController_getTrendingSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getTrendingSearches, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getTrendingSearches',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getFailedSearches: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                days: {"in":"query","name":"days","dataType":"double"},
        };
        app.get('/api/v1/customer/search/failed',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getFailedSearches)),

            async function SearchController_getFailedSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getFailedSearches, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getFailedSearches',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_trackSearchClick: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"position":{"dataType":"double"},"productId":{"dataType":"string","required":true},"searchId":{"dataType":"string","required":true}}},
        };
        app.post('/api/v1/customer/search/track-click',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.trackSearchClick)),

            async function SearchController_trackSearchClick(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_trackSearchClick, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'trackSearchClick',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getUserSearchHistory: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/customer/search/history',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getUserSearchHistory)),

            async function SearchController_getUserSearchHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getUserSearchHistory, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getUserSearchHistory',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_clearUserSearchHistory: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/search/history/clear',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.clearUserSearchHistory)),

            async function SearchController_clearUserSearchHistory(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_clearUserSearchHistory, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'clearUserSearchHistory',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getSearchAnalytics: Record<string, TsoaRoute.ParameterSchema> = {
                timeframe: {"in":"query","name":"timeframe","dataType":"double"},
        };
        app.get('/api/v1/customer/search/analytics',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getSearchAnalytics)),

            async function SearchController_getSearchAnalytics(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getSearchAnalytics, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getSearchAnalytics',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_getTrendingCollections: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                timeframe: {"in":"query","name":"timeframe","dataType":"double"},
        };
        app.get('/api/v1/customer/search/collections/trending',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.getTrendingCollections)),

            async function SearchController_getTrendingCollections(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_getTrendingCollections, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'getTrendingCollections',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_trackCollectionView: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"deviceInfo":{"dataType":"any"},"sessionId":{"dataType":"string"},"searchQuery":{"dataType":"string"},"viewContext":{"dataType":"string"},"interactions":{"dataType":"any"},"scrollDepth":{"dataType":"double"},"viewDuration":{"dataType":"double"},"collectionTitle":{"dataType":"string"},"collectionHandle":{"dataType":"string"},"collectionId":{"dataType":"string","required":true}}},
        };
        app.post('/api/v1/customer/search/collections/track-view',
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.trackCollectionView)),

            async function SearchController_trackCollectionView(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_trackCollectionView, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'trackCollectionView',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsProductDetailController_getProductDetail: Record<string, TsoaRoute.ParameterSchema> = {
                productId: {"in":"path","name":"productId","required":true,"dataType":"string"},
        };
        app.get('/api/v1/products/:productId',
            ...(fetchMiddlewares<RequestHandler>(ProductDetailController)),
            ...(fetchMiddlewares<RequestHandler>(ProductDetailController.prototype.getProductDetail)),

            async function ProductDetailController_getProductDetail(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsProductDetailController_getProductDetail, request, response });

                const controller = new ProductDetailController();

              await templateService.apiHandler({
                methodName: 'getProductDetail',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsHomescreenController_getHomescreenData: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/customer/homescreen',
            ...(fetchMiddlewares<RequestHandler>(HomescreenController)),
            ...(fetchMiddlewares<RequestHandler>(HomescreenController.prototype.getHomescreenData)),

            async function HomescreenController_getHomescreenData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHomescreenController_getHomescreenData, request, response });

                const controller = new HomescreenController();

              await templateService.apiHandler({
                methodName: 'getHomescreenData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFavoritesController_getFavorites: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/customer/favorites',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController)),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController.prototype.getFavorites)),

            async function FavoritesController_getFavorites(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFavoritesController_getFavorites, request, response });

                const controller = new FavoritesController();

              await templateService.apiHandler({
                methodName: 'getFavorites',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFavoritesController_addFavorite: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"FavoriteRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/favorites',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController)),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController.prototype.addFavorite)),

            async function FavoritesController_addFavorite(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFavoritesController_addFavorite, request, response });

                const controller = new FavoritesController();

              await templateService.apiHandler({
                methodName: 'addFavorite',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsFavoritesController_removeFavorite: Record<string, TsoaRoute.ParameterSchema> = {
                productId: {"in":"path","name":"productId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/customer/favorites/:productId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController)),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController.prototype.removeFavorite)),

            async function FavoritesController_removeFavorite(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFavoritesController_removeFavorite, request, response });

                const controller = new FavoritesController();

              await templateService.apiHandler({
                methodName: 'removeFavorite',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCollectionController_getCollectionProducts: Record<string, TsoaRoute.ParameterSchema> = {
                collectionId: {"in":"path","name":"collectionId","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                sortKey: {"in":"query","name":"sortKey","ref":"ProductCollectionSortKey"},
                reverse: {"in":"query","name":"reverse","dataType":"boolean"},
                filters: {"in":"query","name":"filters","dataType":"string"},
        };
        app.get('/api/v1/collections/:collectionId/products',
            ...(fetchMiddlewares<RequestHandler>(CollectionController)),
            ...(fetchMiddlewares<RequestHandler>(CollectionController.prototype.getCollectionProducts)),

            async function CollectionController_getCollectionProducts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCollectionController_getCollectionProducts, request, response });

                const controller = new CollectionController();

              await templateService.apiHandler({
                methodName: 'getCollectionProducts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_createCart: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","ref":"CartCreateRequest"},
        };
        app.post('/api/v1/cart/create',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.createCart)),

            async function CartController_createCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_createCart, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'createCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_getCart: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
        };
        app.get('/api/v1/cart/:cartId',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.getCart)),

            async function CartController_getCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_getCart, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'getCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_addItems: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"AddItemsRequest"},
        };
        app.post('/api/v1/cart/:cartId/items',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.addItems)),

            async function CartController_addItems(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_addItems, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'addItems',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_updateItemQuantity: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                lineItemId: {"in":"path","name":"lineItemId","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateItemQuantityRequest"},
        };
        app.put('/api/v1/cart/:cartId/items/:lineItemId',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.updateItemQuantity)),

            async function CartController_updateItemQuantity(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_updateItemQuantity, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'updateItemQuantity',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_removeItem: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                lineItemId: {"in":"path","name":"lineItemId","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/cart/:cartId/items/:lineItemId',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.removeItem)),

            async function CartController_removeItem(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_removeItem, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'removeItem',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_clearCart: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/cart/:cartId',
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.clearCart)),

            async function CartController_clearCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_clearCart, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'clearCart',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCartController_associateWithCustomer: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/cart/:cartId/associate',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.associateWithCustomer)),

            async function CartController_associateWithCustomer(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_associateWithCustomer, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'associateWithCustomer',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_getAddresses: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/addresses',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.getAddresses)),

            async function AddressController_getAddresses(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_getAddresses, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'getAddresses',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_addAddress: Record<string, TsoaRoute.ParameterSchema> = {
                addressData: {"in":"body","name":"addressData","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"isDefault":{"dataType":"boolean"},"deliveryInstructions":{"dataType":"string"},"phone":{"dataType":"string"},"zip":{"dataType":"string","required":true},"countryCode":{"dataType":"string"},"country":{"dataType":"string","required":true},"province":{"dataType":"string","required":true},"city":{"dataType":"string"},"address2":{"dataType":"string"},"address1":{"dataType":"string","required":true},"company":{"dataType":"string"},"lastName":{"dataType":"string"},"firstName":{"dataType":"string"},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},"label":{"dataType":"string"}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/addresses',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.addAddress)),

            async function AddressController_addAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_addAddress, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'addAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_updateAddress: Record<string, TsoaRoute.ParameterSchema> = {
                index: {"in":"path","name":"index","required":true,"dataType":"double"},
                addressData: {"in":"body","name":"addressData","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"deliveryInstructions":{"dataType":"string"},"phone":{"dataType":"string"},"zip":{"dataType":"string"},"countryCode":{"dataType":"string"},"country":{"dataType":"string"},"province":{"dataType":"string"},"city":{"dataType":"string"},"address2":{"dataType":"string"},"address1":{"dataType":"string"},"company":{"dataType":"string"},"lastName":{"dataType":"string"},"firstName":{"dataType":"string"},"type":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},"label":{"dataType":"string"}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/addresses/:index',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.updateAddress)),

            async function AddressController_updateAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_updateAddress, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'updateAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_deleteAddress: Record<string, TsoaRoute.ParameterSchema> = {
                index: {"in":"path","name":"index","required":true,"dataType":"double"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/addresses/:index',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.deleteAddress)),

            async function AddressController_deleteAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_deleteAddress, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'deleteAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_setDefaultAddress: Record<string, TsoaRoute.ParameterSchema> = {
                index: {"in":"path","name":"index","required":true,"dataType":"double"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/addresses/:index/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.setDefaultAddress)),

            async function AddressController_setDefaultAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_setDefaultAddress, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'setDefaultAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAddressController_getDefaultAddress: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/addresses/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AddressController)),
            ...(fetchMiddlewares<RequestHandler>(AddressController.prototype.getDefaultAddress)),

            async function AddressController_getDefaultAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAddressController_getDefaultAddress, request, response });

                const controller = new AddressController();

              await templateService.apiHandler({
                methodName: 'getDefaultAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: undefined,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
