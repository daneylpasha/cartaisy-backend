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
import { RecommendationsController } from './../controllers/recommendationsTsoaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProductDetailController } from './../controllers/productDetailController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { PaymentMethodsController } from './../controllers/paymentMethodsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { HomescreenTsoaController } from './../controllers/homescreenTsoaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { FavoritesController } from './../controllers/favoritesController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CustomerAuthTsoaController } from './../controllers/customerAuthTsoaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CustomerAddressTsoaController } from './../controllers/customerAddressTsoaController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CollectionController } from './../controllers/collectionController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CheckoutController } from './../controllers/checkoutController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CartController } from './../controllers/cartController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuthController } from './../controllers/authTsoaController';
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
            "productId": {"dataType":"string"},
            "collectionId": {"dataType":"string"},
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
            "productId": {"dataType":"string"},
            "collectionId": {"dataType":"string"},
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
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"metadata":{"dataType":"nestedObjectLiteral","nestedProperties":{"isFallback":{"dataType":"nestedObjectLiteral","nestedProperties":{"trendingSearches":{"dataType":"boolean","required":true},"products":{"dataType":"boolean","required":true}},"required":true},"lastUpdated":{"dataType":"string","required":true},"timeframe":{"dataType":"double","required":true},"productsCount":{"dataType":"double","required":true},"trendingSearchesCount":{"dataType":"double","required":true},"recentSearchesCount":{"dataType":"double","required":true},"isAuthenticated":{"dataType":"boolean","required":true}},"required":true},"trendingProducts":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedProduct"},"required":true},"trendingSearches":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedTrendingSearch"},"required":true},"recentSearches":{"dataType":"array","array":{"dataType":"refObject","ref":"EnrichedSearchItem"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RecommendationProductImage": {
        "dataType": "refObject",
        "properties": {
            "url": {"dataType":"string","required":true},
            "alt": {"dataType":"string","required":true},
            "position": {"dataType":"double","required":true},
            "width": {"dataType":"double"},
            "height": {"dataType":"double"},
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
    "RecommendedProduct": {
        "dataType": "refObject",
        "properties": {
            "_id": {"dataType":"string","required":true},
            "shopifyProductId": {"dataType":"string"},
            "title": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "handle": {"dataType":"string","required":true},
            "vendor": {"dataType":"string","required":true},
            "productType": {"dataType":"string","required":true},
            "tags": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "status": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "compareAtPrice": {"dataType":"double"},
            "images": {"dataType":"array","array":{"dataType":"refObject","ref":"RecommendationProductImage"},"required":true},
            "variants": {"dataType":"array","array":{"dataType":"refObject","ref":"ProductVariant"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ProductRecommendationsResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "error": {"dataType":"string"},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"sourceProductId":{"dataType":"string","required":true},"basedOn":{"dataType":"enum","enums":["product"],"required":true},"recommendedProducts":{"dataType":"array","array":{"dataType":"refObject","ref":"RecommendedProduct"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartRecommendationsResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "error": {"dataType":"string"},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"cartItemsCount":{"dataType":"double","required":true},"basedOn":{"dataType":"enum","enums":["cart"],"required":true},"recommendedProducts":{"dataType":"array","array":{"dataType":"refObject","ref":"RecommendedProduct"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CartRecommendationsRequest": {
        "dataType": "refObject",
        "properties": {
            "cartItems": {"dataType":"array","array":{"dataType":"string"},"required":true},
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
    "StoredPaymentCard": {
        "dataType": "refObject",
        "properties": {
            "brand": {"dataType":"string","required":true},
            "last4": {"dataType":"string","required":true},
            "exp_month": {"dataType":"double","required":true},
            "exp_year": {"dataType":"double","required":true},
            "country": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StoredPaymentMethod": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
            "card": {"ref":"StoredPaymentCard"},
            "isDefault": {"dataType":"boolean","required":true},
            "created": {"dataType":"double","required":true},
            "allow_redisplay": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ListStoredPaymentMethodsResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"count":{"dataType":"double","required":true},"defaultPaymentMethodId":{"dataType":"string"},"paymentMethods":{"dataType":"array","array":{"dataType":"refObject","ref":"StoredPaymentMethod"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StorePaymentMethodResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"paymentMethod":{"ref":"StoredPaymentMethod","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "StorePaymentMethodRequest": {
        "dataType": "refObject",
        "properties": {
            "paymentMethodId": {"dataType":"string","required":true},
            "setAsDefault": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeleteStoredPaymentMethodResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateDefaultPaymentMethodResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"paymentMethodId":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateDefaultPaymentMethodRequest": {
        "dataType": "refObject",
        "properties": {
            "paymentMethodId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetDefaultStoredPaymentMethodResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"paymentMethod":{"ref":"StoredPaymentMethod","required":true}}},
            "message": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CarouselItemResponse": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "ctaText": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
            "endsAt": {"dataType":"string"},
            "promoTag": {"dataType":"nestedObjectLiteral","nestedProperties":{"textColor":{"dataType":"string","required":true},"backgroundColor":{"dataType":"string","required":true},"text":{"dataType":"string","required":true}}},
            "isActive": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryGridItemResponse": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CalloutBannerItemResponse": {
        "dataType": "refObject",
        "properties": {
            "imageUrl": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subTitle": {"dataType":"string","required":true},
            "buttonText": {"dataType":"string","required":true},
            "action": {"dataType":"nestedObjectLiteral","nestedProperties":{"value":{"dataType":"string","required":true},"type":{"dataType":"string","required":true}},"required":true},
            "backgroundColor": {"dataType":"string"},
            "textColor": {"dataType":"string"},
            "buttonColor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PromoBannerItemResponse": {
        "dataType": "refObject",
        "properties": {
            "image": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "ctaText": {"dataType":"string","required":true},
            "collectionId": {"dataType":"string","required":true},
            "backgroundColor": {"dataType":"string"},
            "textColor": {"dataType":"string"},
            "buttonColor": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionDisplayResponse": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["large_row"]},{"dataType":"enum","enums":["small_grid"]},{"dataType":"enum","enums":["medium_row"]}],"required":true},
            "order": {"dataType":"double","required":true},
            "collection": {"dataType":"any","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CategoryCollectionGridResponse": {
        "dataType": "refObject",
        "properties": {
            "title": {"dataType":"string","required":true},
            "subtitle": {"dataType":"string","required":true},
            "collections": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"collectionId":{"dataType":"string","required":true},"title":{"dataType":"string","required":true},"image":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CollectionShowcaseResponse": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["grid"]},{"dataType":"enum","enums":["circular"]}],"required":true},
            "title": {"dataType":"string","required":true},
            "icon": {"dataType":"string"},
            "collections": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"collectionId":{"dataType":"string","required":true},"title":{"dataType":"string","required":true},"image":{"dataType":"string","required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LayoutSectionResponse": {
        "dataType": "refObject",
        "properties": {
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["carousel"]},{"dataType":"enum","enums":["promo_banners"]},{"dataType":"enum","enums":["callout_banners"]},{"dataType":"enum","enums":["category_grid"]},{"dataType":"enum","enums":["collection_displays"]},{"dataType":"enum","enums":["collection_showcases"]},{"dataType":"enum","enums":["category_collection_grid"]}],"required":true},
            "position": {"dataType":"double","required":true},
            "isVisible": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HomescreenMetadataResponse": {
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
    "HomescreenDataResponse": {
        "dataType": "refObject",
        "properties": {
            "carousel": {"dataType":"array","array":{"dataType":"refObject","ref":"CarouselItemResponse"},"required":true},
            "categoryGrid": {"dataType":"array","array":{"dataType":"refObject","ref":"CategoryGridItemResponse"},"required":true},
            "calloutBanners": {"dataType":"array","array":{"dataType":"refObject","ref":"CalloutBannerItemResponse"},"required":true},
            "promoBanners": {"dataType":"array","array":{"dataType":"refObject","ref":"PromoBannerItemResponse"},"required":true},
            "collectionDisplays": {"dataType":"array","array":{"dataType":"refObject","ref":"CollectionDisplayResponse"},"required":true},
            "categoryCollectionGrid": {"dataType":"array","array":{"dataType":"refObject","ref":"CategoryCollectionGridResponse"},"required":true},
            "collectionShowcases": {"dataType":"array","array":{"dataType":"refObject","ref":"CollectionShowcaseResponse"},"required":true},
            "layout": {"dataType":"array","array":{"dataType":"refObject","ref":"LayoutSectionResponse"},"required":true},
            "metadata": {"ref":"HomescreenMetadataResponse","required":true},
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
    "Record_string.any_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"any"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DetailedFavoritesResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"pagination":{"dataType":"nestedObjectLiteral","nestedProperties":{"totalProducts":{"dataType":"double","required":true},"count":{"dataType":"double","required":true},"total":{"dataType":"double","required":true},"current":{"dataType":"double","required":true}},"required":true},"products":{"dataType":"array","array":{"dataType":"refAlias","ref":"Record_string.any_"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerData": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "avatar": {"dataType":"string"},
            "gender": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["male"]},{"dataType":"enum","enums":["female"]},{"dataType":"enum","enums":["other"]},{"dataType":"enum","enums":["prefer_not_to_say"]}]},
            "dateOfBirth": {"dataType":"datetime"},
            "country": {"dataType":"string"},
            "storeId": {"dataType":"string","required":true},
            "addresses": {"dataType":"array","array":{"dataType":"any"},"required":true},
            "preferences": {"dataType":"any","required":true},
            "isVerified": {"dataType":"boolean","required":true},
            "isActive": {"dataType":"boolean","required":true},
            "createdAt": {"dataType":"datetime","required":true},
            "lastLoginAt": {"dataType":"datetime"},
            "shopifyCartId": {"dataType":"string"},
            "totalSpent": {"dataType":"double"},
            "totalOrdersCount": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerRegisterRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
            "name": {"dataType":"string"},
            "phone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerLoginRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerRefreshTokenRequest": {
        "dataType": "refObject",
        "properties": {
            "refreshToken": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerForgotPasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerResetPasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "newPassword": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerChangePasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "currentPassword": {"dataType":"string","required":true},
            "newPassword": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerUpdateProfileRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "fullName": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "phoneNumber": {"dataType":"string"},
            "avatar": {"dataType":"string"},
            "gender": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["male"]},{"dataType":"enum","enums":["female"]},{"dataType":"enum","enums":["other"]},{"dataType":"enum","enums":["prefer_not_to_say"]}]},
            "dateOfBirth": {"dataType":"string"},
            "country": {"dataType":"string"},
            "preferences": {"dataType":"nestedObjectLiteral","nestedProperties":{"notifications":{"dataType":"nestedObjectLiteral","nestedProperties":{"orderUpdates":{"dataType":"boolean"},"promotions":{"dataType":"boolean"},"sms":{"dataType":"boolean"},"push":{"dataType":"boolean"},"email":{"dataType":"boolean"}}},"language":{"dataType":"string"},"currency":{"dataType":"string"}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerLogoutRequest": {
        "dataType": "refObject",
        "properties": {
            "deviceToken": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerDeviceTokenRequest": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string"},
            "deviceToken": {"dataType":"string"},
            "platform": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["ios"]},{"dataType":"enum","enums":["android"]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerDeleteAccountRequest": {
        "dataType": "refObject",
        "properties": {
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerAddressResponse": {
        "dataType": "refObject",
        "properties": {
            "_id": {"dataType":"string"},
            "label": {"dataType":"string"},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "address1": {"dataType":"string","required":true},
            "address2": {"dataType":"string"},
            "city": {"dataType":"string"},
            "province": {"dataType":"string","required":true},
            "country": {"dataType":"string","required":true},
            "countryCode": {"dataType":"string"},
            "zip": {"dataType":"string"},
            "deliveryInstructions": {"dataType":"string"},
            "isDefault": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerAddAddressRequest": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "address1": {"dataType":"string","required":true},
            "address2": {"dataType":"string"},
            "city": {"dataType":"string"},
            "province": {"dataType":"string","required":true},
            "country": {"dataType":"string","required":true},
            "countryCode": {"dataType":"string"},
            "zip": {"dataType":"string"},
            "deliveryInstructions": {"dataType":"string"},
            "isDefault": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CustomerUpdateAddressRequest": {
        "dataType": "refObject",
        "properties": {
            "label": {"dataType":"string"},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["billing"]},{"dataType":"enum","enums":["shipping"]},{"dataType":"enum","enums":["both"]}]},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "address1": {"dataType":"string"},
            "address2": {"dataType":"string"},
            "city": {"dataType":"string"},
            "province": {"dataType":"string"},
            "country": {"dataType":"string"},
            "countryCode": {"dataType":"string"},
            "zip": {"dataType":"string"},
            "deliveryInstructions": {"dataType":"string"},
            "isDefault": {"dataType":"boolean"},
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
    "InitCheckoutResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"expiresAt":{"dataType":"string","required":true},"itemCount":{"dataType":"double","required":true},"currency":{"dataType":"string","required":true},"subtotal":{"dataType":"double","required":true},"cartId":{"dataType":"string","required":true},"sessionId":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "InitCheckoutRequest": {
        "dataType": "refObject",
        "properties": {
            "cartId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ShippingRate": {
        "dataType": "refObject",
        "properties": {
            "handle": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "currencyCode": {"dataType":"string","required":true},
            "description": {"dataType":"string"},
            "estimatedDelivery": {"dataType":"string"},
            "deliveryMethodType": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddressSummary": {
        "dataType": "refObject",
        "properties": {
            "address1": {"dataType":"string","required":true},
            "address2": {"dataType":"string"},
            "city": {"dataType":"string","required":true},
            "province": {"dataType":"string","required":true},
            "country": {"dataType":"string","required":true},
            "zip": {"dataType":"string","required":true},
            "phone": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetShippingRatesResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"address":{"ref":"AddressSummary","required":true},"shippingRates":{"dataType":"array","array":{"dataType":"refObject","ref":"ShippingRate"},"required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SaveShippingResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"estimatedDelivery":{"dataType":"string"},"shippingCost":{"dataType":"double","required":true},"completedSteps":{"dataType":"array","array":{"dataType":"double"},"required":true},"currentStep":{"dataType":"double","required":true},"status":{"dataType":"string","required":true},"sessionId":{"dataType":"string","required":true}},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SaveShippingRequest": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
            "shippingAddressId": {"dataType":"double","required":true},
            "deliveryInstructions": {"dataType":"string"},
            "contactNumber": {"dataType":"string","required":true},
            "shippingRateHandle": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SaveStep2Response": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"paymentMethod":{"dataType":"nestedObjectLiteral","nestedProperties":{"type":{"dataType":"string","required":true},"displayName":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},"completedSteps":{"dataType":"array","array":{"dataType":"double"},"required":true},"currentStep":{"dataType":"double","required":true},"status":{"dataType":"string","required":true},"sessionId":{"dataType":"string","required":true}},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SaveStep2Request": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
            "paymentMethodId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DiscountInfo": {
        "dataType": "refObject",
        "properties": {
            "code": {"dataType":"string","required":true},
            "amount": {"dataType":"double","required":true},
            "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["percentage"]},{"dataType":"enum","enums":["fixed_amount"]}],"required":true},
            "applicable": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PricingBreakdown": {
        "dataType": "refObject",
        "properties": {
            "subtotal": {"dataType":"double","required":true},
            "shippingCost": {"dataType":"double","required":true},
            "discountAmount": {"dataType":"double","required":true},
            "couponDiscount": {"dataType":"double","required":true},
            "tax": {"dataType":"double","required":true},
            "grandTotal": {"dataType":"double","required":true},
            "currency": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApplyPromoResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"pricing":{"ref":"PricingBreakdown","required":true},"discount":{"ref":"DiscountInfo","required":true}},"required":true},
            "message": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ApplyPromoRequest": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
            "promoCode": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RemovePromoResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"pricing":{"ref":"PricingBreakdown","required":true}},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RemovePromoRequest": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutSummaryResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"expiresAt":{"dataType":"string","required":true},"paymentError":{"dataType":"string"},"status":{"dataType":"string","required":true},"promoCode":{"dataType":"string"},"deliveryInstructions":{"dataType":"string"},"pricing":{"ref":"PricingBreakdown","required":true},"paymentMethod":{"dataType":"nestedObjectLiteral","nestedProperties":{"last4":{"dataType":"string"},"type":{"dataType":"string","required":true},"displayName":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true},"shippingMethod":{"dataType":"nestedObjectLiteral","nestedProperties":{"estimatedDelivery":{"dataType":"string"},"price":{"dataType":"double","required":true},"title":{"dataType":"string","required":true}},"required":true},"shippingAddress":{"dataType":"intersection","subSchemas":[{"ref":"AddressSummary"},{"dataType":"nestedObjectLiteral","nestedProperties":{"lastName":{"dataType":"string"},"firstName":{"dataType":"string"}}}],"required":true},"items":{"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"total":{"dataType":"double","required":true},"quantity":{"dataType":"double","required":true},"price":{"dataType":"double","required":true},"image":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"variantTitle":{"dataType":"string"},"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},"sessionId":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CompleteCheckoutResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"payment":{"dataType":"nestedObjectLiteral","nestedProperties":{"clientSecret":{"dataType":"string"},"paymentIntentId":{"dataType":"string","required":true},"status":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["succeeded"]},{"dataType":"enum","enums":["requires_action"]},{"dataType":"enum","enums":["processing"]}],"required":true}},"required":true},"order":{"dataType":"nestedObjectLiteral","nestedProperties":{"timeline":{"dataType":"any"},"paymentInfo":{"dataType":"any"},"shippingMethod":{"dataType":"any"},"billingAddress":{"dataType":"any"},"shippingAddress":{"dataType":"any"},"discount":{"dataType":"any"},"pricing":{"dataType":"any"},"products":{"dataType":"array","array":{"dataType":"any"}},"estimatedDelivery":{"dataType":"string"},"status":{"dataType":"string","required":true},"currency":{"dataType":"string","required":true},"totalPrice":{"dataType":"double","required":true},"phone":{"dataType":"string"},"email":{"dataType":"string"},"confirmationNumber":{"dataType":"string"},"shopifyOrderId":{"dataType":"string"},"orderNumber":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"additionalProperties":{"dataType":"any"},"required":true}},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CheckoutRequiresActionResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"enum","enums":[true],"required":true},
            "requiresAction": {"dataType":"enum","enums":[true],"required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"nextAction":{"dataType":"nestedObjectLiteral","nestedProperties":{"redirectUrl":{"dataType":"string"},"type":{"dataType":"string","required":true}},"required":true},"clientSecret":{"dataType":"string","required":true},"paymentIntentId":{"dataType":"string","required":true}},"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CompleteCheckoutRequest": {
        "dataType": "refObject",
        "properties": {
            "sessionId": {"dataType":"string","required":true},
            "paymentIntentId": {"dataType":"string"},
            "paymentMethodId": {"dataType":"string"},
        },
        "additionalProperties": false,
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
            "metafields": {"dataType":"array","array":{"dataType":"refObject","ref":"ProductMetafield"},"required":true},
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
    "SaveCartResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"string","required":true},
            "message": {"dataType":"string","required":true},
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
    "RegisterResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"refreshToken":{"dataType":"string","required":true},"token":{"dataType":"string","required":true},"user":{"dataType":"nestedObjectLiteral","nestedProperties":{"createdAt":{"dataType":"datetime","required":true},"isActive":{"dataType":"boolean","required":true},"isEmailVerified":{"dataType":"boolean","required":true},"role":{"dataType":"string","required":true},"email":{"dataType":"string","required":true},"name":{"dataType":"string"},"id":{"dataType":"string","required":true}},"required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RegisterRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"refreshToken":{"dataType":"string","required":true},"token":{"dataType":"string","required":true},"user":{"dataType":"nestedObjectLiteral","nestedProperties":{"lastLoginAt":{"dataType":"datetime"},"avatar":{"dataType":"string"},"isActive":{"dataType":"boolean","required":true},"isEmailVerified":{"dataType":"boolean","required":true},"storeName":{"dataType":"string"},"storeId":{"dataType":"string"},"role":{"dataType":"string","required":true},"email":{"dataType":"string","required":true},"name":{"dataType":"string"},"id":{"dataType":"string","required":true}},"required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LoginRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
            "password": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ForgotPasswordResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ForgotPasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResetPasswordResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"token":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ResetPasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
            "newPassword": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RefreshTokenResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"refreshToken":{"dataType":"string","required":true},"token":{"dataType":"string","required":true},"user":{"dataType":"nestedObjectLiteral","nestedProperties":{"avatar":{"dataType":"string"},"isActive":{"dataType":"boolean","required":true},"isEmailVerified":{"dataType":"boolean","required":true},"storeName":{"dataType":"string"},"storeId":{"dataType":"string"},"role":{"dataType":"string","required":true},"email":{"dataType":"string","required":true},"name":{"dataType":"string"},"id":{"dataType":"string","required":true}},"required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RefreshTokenRequest": {
        "dataType": "refObject",
        "properties": {
            "refreshToken": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetProfileResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string"},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"user":{"dataType":"nestedObjectLiteral","nestedProperties":{"lastLoginAt":{"dataType":"datetime"},"createdAt":{"dataType":"datetime","required":true},"totalSpent":{"dataType":"double"},"totalOrdersCount":{"dataType":"double"},"preferences":{"dataType":"any"},"addresses":{"dataType":"array","array":{"dataType":"any"}},"avatar":{"dataType":"string"},"isActive":{"dataType":"boolean","required":true},"isEmailVerified":{"dataType":"boolean","required":true},"storeName":{"dataType":"string"},"storeId":{"dataType":"string"},"role":{"dataType":"string","required":true},"defaultAddress":{"dataType":"union","subSchemas":[{"dataType":"any"},{"dataType":"enum","enums":[null]}],"required":true},"dateOfBirth":{"dataType":"string","required":true},"gender":{"dataType":"string","required":true},"country":{"dataType":"string","required":true},"phoneNumber":{"dataType":"string","required":true},"email":{"dataType":"string","required":true},"fullName":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}},"required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateProfileResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"updatedFields":{"dataType":"array","array":{"dataType":"string"},"required":true},"user":{"dataType":"any","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.string_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"string"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddressData": {
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
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Record_string.boolean_": {
        "dataType": "refAlias",
        "type": {"dataType":"nestedObjectLiteral","nestedProperties":{},"additionalProperties":{"dataType":"boolean"},"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateProfileRequest": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string"},
            "firstName": {"dataType":"string"},
            "lastName": {"dataType":"string"},
            "phone": {"dataType":"string"},
            "avatar": {"dataType":"string"},
            "dateOfBirth": {"dataType":"union","subSchemas":[{"dataType":"datetime"},{"dataType":"string"}]},
            "gender": {"dataType":"string"},
            "country": {"dataType":"string"},
            "interests": {"dataType":"array","array":{"dataType":"string"}},
            "bio": {"dataType":"string"},
            "occupation": {"dataType":"string"},
            "company": {"dataType":"string"},
            "website": {"dataType":"string"},
            "socialLinks": {"ref":"Record_string.string_"},
            "address": {"ref":"AddressData"},
            "addressIndex": {"dataType":"double"},
            "addresses": {"dataType":"array","array":{"dataType":"any"}},
            "currency": {"dataType":"string"},
            "language": {"dataType":"string"},
            "theme": {"dataType":"string"},
            "notifications": {"ref":"Record_string.boolean_"},
        },
        "additionalProperties": {"dataType":"any"},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChangePasswordResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"token":{"dataType":"string","required":true}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ChangePasswordRequest": {
        "dataType": "refObject",
        "properties": {
            "currentPassword": {"dataType":"string","required":true},
            "newPassword": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeleteAccountResponse": {
        "dataType": "refObject",
        "properties": {
            "status": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["success"]},{"dataType":"enum","enums":["error"]}],"required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DeleteAccountRequest": {
        "dataType": "refObject",
        "properties": {
            "password": {"dataType":"string","required":true},
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


    
        const argsShopifySearchController_shopifyGetSearchSuggestions: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/search/suggestions',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.shopifyGetSearchSuggestions)),

            async function ShopifySearchController_shopifyGetSearchSuggestions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_shopifyGetSearchSuggestions, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'shopifyGetSearchSuggestions',
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
        const argsShopifySearchController_shopifyGetPopularSearches: Record<string, TsoaRoute.ParameterSchema> = {
                limit: {"in":"query","name":"limit","dataType":"double"},
                days: {"in":"query","name":"days","dataType":"double"},
        };
        app.get('/api/v1/search/popular',
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController)),
            ...(fetchMiddlewares<RequestHandler>(ShopifySearchController.prototype.shopifyGetPopularSearches)),

            async function ShopifySearchController_shopifyGetPopularSearches(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsShopifySearchController_shopifyGetPopularSearches, request, response });

                const controller = new ShopifySearchController();

              await templateService.apiHandler({
                methodName: 'shopifyGetPopularSearches',
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
            authenticateMiddleware([{"jwt-optional":[]}]),
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
        const argsSearchController_logSearch: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"sessionId":{"dataType":"string"},"resultsCount":{"dataType":"double"},"selectedCollectionId":{"dataType":"string"},"selectedProductId":{"dataType":"string"},"searchType":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["text"]},{"dataType":"enum","enums":["product"]},{"dataType":"enum","enums":["collection"]}],"required":true},"query":{"dataType":"string","required":true}}},
        };
        app.post('/api/v1/customer/search/log',
            authenticateMiddleware([{"jwt-optional":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.logSearch)),

            async function SearchController_logSearch(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_logSearch, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'logSearch',
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
        const argsRecommendationsController_getProductRecommendations: Record<string, TsoaRoute.ParameterSchema> = {
                shopifyProductId: {"in":"path","name":"shopifyProductId","required":true,"dataType":"string"},
                limit: {"default":6,"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/recommendations/product/:shopifyProductId',
            ...(fetchMiddlewares<RequestHandler>(RecommendationsController)),
            ...(fetchMiddlewares<RequestHandler>(RecommendationsController.prototype.getProductRecommendations)),

            async function RecommendationsController_getProductRecommendations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecommendationsController_getProductRecommendations, request, response });

                const controller = new RecommendationsController();

              await templateService.apiHandler({
                methodName: 'getProductRecommendations',
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
        const argsRecommendationsController_getCartRecommendations: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CartRecommendationsRequest"},
                limit: {"default":6,"in":"query","name":"limit","dataType":"double"},
        };
        app.post('/api/v1/recommendations/cart',
            ...(fetchMiddlewares<RequestHandler>(RecommendationsController)),
            ...(fetchMiddlewares<RequestHandler>(RecommendationsController.prototype.getCartRecommendations)),

            async function RecommendationsController_getCartRecommendations(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsRecommendationsController_getCartRecommendations, request, response });

                const controller = new RecommendationsController();

              await templateService.apiHandler({
                methodName: 'getCartRecommendations',
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
                country: {"in":"query","name":"country","dataType":"string"},
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
        const argsPaymentMethodsController_listPaymentMethods: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/payment-methods',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController.prototype.listPaymentMethods)),

            async function PaymentMethodsController_listPaymentMethods(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentMethodsController_listPaymentMethods, request, response });

                const controller = new PaymentMethodsController();

              await templateService.apiHandler({
                methodName: 'listPaymentMethods',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentMethodsController_addPaymentMethod: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"StorePaymentMethodRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/payment-methods',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController.prototype.addPaymentMethod)),

            async function PaymentMethodsController_addPaymentMethod(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentMethodsController_addPaymentMethod, request, response });

                const controller = new PaymentMethodsController();

              await templateService.apiHandler({
                methodName: 'addPaymentMethod',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentMethodsController_removePaymentMethod: Record<string, TsoaRoute.ParameterSchema> = {
                paymentMethodId: {"in":"path","name":"paymentMethodId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/payment-methods/:paymentMethodId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController.prototype.removePaymentMethod)),

            async function PaymentMethodsController_removePaymentMethod(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentMethodsController_removePaymentMethod, request, response });

                const controller = new PaymentMethodsController();

              await templateService.apiHandler({
                methodName: 'removePaymentMethod',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentMethodsController_setDefaultPaymentMethod: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateDefaultPaymentMethodRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.put('/api/v1/payment-methods/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController.prototype.setDefaultPaymentMethod)),

            async function PaymentMethodsController_setDefaultPaymentMethod(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentMethodsController_setDefaultPaymentMethod, request, response });

                const controller = new PaymentMethodsController();

              await templateService.apiHandler({
                methodName: 'setDefaultPaymentMethod',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsPaymentMethodsController_getDefaultPaymentMethod: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/payment-methods/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController)),
            ...(fetchMiddlewares<RequestHandler>(PaymentMethodsController.prototype.getDefaultPaymentMethod)),

            async function PaymentMethodsController_getDefaultPaymentMethod(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsPaymentMethodsController_getDefaultPaymentMethod, request, response });

                const controller = new PaymentMethodsController();

              await templateService.apiHandler({
                methodName: 'getDefaultPaymentMethod',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsHomescreenTsoaController_getHomescreenData: Record<string, TsoaRoute.ParameterSchema> = {
                storeId: {"in":"header","name":"x-store-id","dataType":"string"},
                storeIdQuery: {"in":"query","name":"storeId","dataType":"string"},
        };
        app.get('/api/v1/customer/homescreen',
            ...(fetchMiddlewares<RequestHandler>(HomescreenTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(HomescreenTsoaController.prototype.getHomescreenData)),

            async function HomescreenTsoaController_getHomescreenData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsHomescreenTsoaController_getHomescreenData, request, response });

                const controller = new HomescreenTsoaController();

              await templateService.apiHandler({
                methodName: 'getHomescreenData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
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
        const argsFavoritesController_getDetailedFavorites: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
                page: {"default":1,"in":"query","name":"page","dataType":"double"},
                limit: {"default":20,"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/customer/favorites/detailed',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController)),
            ...(fetchMiddlewares<RequestHandler>(FavoritesController.prototype.getDetailedFavorites)),

            async function FavoritesController_getDetailedFavorites(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsFavoritesController_getDetailedFavorites, request, response });

                const controller = new FavoritesController();

              await templateService.apiHandler({
                methodName: 'getDetailedFavorites',
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
        const argsCustomerAuthTsoaController_customerRegister: Record<string, TsoaRoute.ParameterSchema> = {
                storeId: {"in":"header","name":"x-store-id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerRegisterRequest"},
        };
        app.post('/api/v1/customer/auth/register',
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerRegister)),

            async function CustomerAuthTsoaController_customerRegister(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerRegister, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerRegister',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerLogin: Record<string, TsoaRoute.ParameterSchema> = {
                storeId: {"in":"header","name":"x-store-id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerLoginRequest"},
        };
        app.post('/api/v1/customer/auth/login',
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerLogin)),

            async function CustomerAuthTsoaController_customerLogin(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerLogin, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerLogin',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerRefreshToken: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerRefreshTokenRequest"},
        };
        app.post('/api/v1/customer/auth/refresh-token',
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerRefreshToken)),

            async function CustomerAuthTsoaController_customerRefreshToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerRefreshToken, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerRefreshToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerForgotPassword: Record<string, TsoaRoute.ParameterSchema> = {
                storeId: {"in":"header","name":"x-store-id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerForgotPasswordRequest"},
        };
        app.post('/api/v1/customer/auth/forgot-password',
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerForgotPassword)),

            async function CustomerAuthTsoaController_customerForgotPassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerForgotPassword, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerForgotPassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerResetPassword: Record<string, TsoaRoute.ParameterSchema> = {
                storeId: {"in":"header","name":"x-store-id","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerResetPasswordRequest"},
        };
        app.post('/api/v1/customer/auth/reset-password',
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerResetPassword)),

            async function CustomerAuthTsoaController_customerResetPassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerResetPassword, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerResetPassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerChangePassword: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerChangePasswordRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/auth/change-password',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerChangePassword)),

            async function CustomerAuthTsoaController_customerChangePassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerChangePassword, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerChangePassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerGetProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/customer/auth/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerGetProfile)),

            async function CustomerAuthTsoaController_customerGetProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerGetProfile, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerGetProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerUpdateProfile: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerUpdateProfileRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/customer/auth/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerUpdateProfile)),

            async function CustomerAuthTsoaController_customerUpdateProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerUpdateProfile, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerUpdateProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerLogout: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerLogoutRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/auth/logout',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerLogout)),

            async function CustomerAuthTsoaController_customerLogout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerLogout, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerLogout',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerUpdateDeviceToken: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerDeviceTokenRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/auth/device-token',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerUpdateDeviceToken)),

            async function CustomerAuthTsoaController_customerUpdateDeviceToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerUpdateDeviceToken, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerUpdateDeviceToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAuthTsoaController_customerDeleteAccount: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerDeleteAccountRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/customer/auth/account',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAuthTsoaController.prototype.customerDeleteAccount)),

            async function CustomerAuthTsoaController_customerDeleteAccount(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAuthTsoaController_customerDeleteAccount, request, response });

                const controller = new CustomerAuthTsoaController();

              await templateService.apiHandler({
                methodName: 'customerDeleteAccount',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerGetAddresses: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/customer/addresses',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerGetAddresses)),

            async function CustomerAddressTsoaController_customerGetAddresses(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerGetAddresses, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerGetAddresses',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerAddAddress: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerAddAddressRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/customer/addresses',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerAddAddress)),

            async function CustomerAddressTsoaController_customerAddAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerAddAddress, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerAddAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerUpdateAddress: Record<string, TsoaRoute.ParameterSchema> = {
                addressId: {"in":"path","name":"addressId","required":true,"dataType":"string"},
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CustomerUpdateAddressRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/customer/addresses/:addressId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerUpdateAddress)),

            async function CustomerAddressTsoaController_customerUpdateAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerUpdateAddress, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerUpdateAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerDeleteAddress: Record<string, TsoaRoute.ParameterSchema> = {
                addressId: {"in":"path","name":"addressId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/customer/addresses/:addressId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerDeleteAddress)),

            async function CustomerAddressTsoaController_customerDeleteAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerDeleteAddress, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerDeleteAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerSetDefaultAddress: Record<string, TsoaRoute.ParameterSchema> = {
                addressId: {"in":"path","name":"addressId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/customer/addresses/:addressId/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerSetDefaultAddress)),

            async function CustomerAddressTsoaController_customerSetDefaultAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerSetDefaultAddress, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerSetDefaultAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCustomerAddressTsoaController_customerGetDefaultAddress: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/customer/addresses/default',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController)),
            ...(fetchMiddlewares<RequestHandler>(CustomerAddressTsoaController.prototype.customerGetDefaultAddress)),

            async function CustomerAddressTsoaController_customerGetDefaultAddress(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCustomerAddressTsoaController_customerGetDefaultAddress, request, response });

                const controller = new CustomerAddressTsoaController();

              await templateService.apiHandler({
                methodName: 'customerGetDefaultAddress',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsCollectionController_getCollectionProducts: Record<string, TsoaRoute.ParameterSchema> = {
                collectionId: {"in":"path","name":"collectionId","required":true,"dataType":"string"},
                storeId: {"in":"header","name":"x-store-id","dataType":"string"},
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
        const argsCheckoutController_initializeCheckout: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"InitCheckoutRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/checkout/init',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.initializeCheckout)),

            async function CheckoutController_initializeCheckout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_initializeCheckout, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'initializeCheckout',
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
        const argsCheckoutController_getShippingRates: Record<string, TsoaRoute.ParameterSchema> = {
                sessionId: {"in":"query","name":"sessionId","required":true,"dataType":"string"},
                addressId: {"in":"query","name":"addressId","required":true,"dataType":"double"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/checkout/shipping-rates',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.getShippingRates)),

            async function CheckoutController_getShippingRates(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_getShippingRates, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'getShippingRates',
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
        const argsCheckoutController_saveShipping: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"SaveShippingRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/checkout/save-shipping',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.saveShipping)),

            async function CheckoutController_saveShipping(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_saveShipping, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'saveShipping',
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
        const argsCheckoutController_saveStep2: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"SaveStep2Request"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/checkout/step2',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.saveStep2)),

            async function CheckoutController_saveStep2(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_saveStep2, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'saveStep2',
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
        const argsCheckoutController_applyPromoCode: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"ApplyPromoRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/checkout/apply-promo',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.applyPromoCode)),

            async function CheckoutController_applyPromoCode(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_applyPromoCode, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'applyPromoCode',
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
        const argsCheckoutController_removePromoCode: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"RemovePromoRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/checkout/remove-promo',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.removePromoCode)),

            async function CheckoutController_removePromoCode(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_removePromoCode, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'removePromoCode',
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
        const argsCheckoutController_getCheckoutSummary: Record<string, TsoaRoute.ParameterSchema> = {
                sessionId: {"in":"path","name":"sessionId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/checkout/summary/:sessionId',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.getCheckoutSummary)),

            async function CheckoutController_getCheckoutSummary(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_getCheckoutSummary, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'getCheckoutSummary',
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
        const argsCheckoutController_completeCheckout: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"CompleteCheckoutRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/checkout/complete',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController)),
            ...(fetchMiddlewares<RequestHandler>(CheckoutController.prototype.completeCheckout)),

            async function CheckoutController_completeCheckout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCheckoutController_completeCheckout, request, response });

                const controller = new CheckoutController();

              await templateService.apiHandler({
                methodName: 'completeCheckout',
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
                country: {"in":"query","name":"country","dataType":"string"},
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
                country: {"in":"query","name":"country","dataType":"string"},
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
        const argsCartController_clearSavedCart: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/cart/saved',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.clearSavedCart)),

            async function CartController_clearSavedCart(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_clearSavedCart, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'clearSavedCart',
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
        const argsCartController_saveCartToProfileBody: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"dataType":"nestedObjectLiteral","nestedProperties":{"cartId":{"dataType":"string","required":true}}},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/cart/saved',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.saveCartToProfileBody)),

            async function CartController_saveCartToProfileBody(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_saveCartToProfileBody, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'saveCartToProfileBody',
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
        const argsCartController_saveCartToProfile: Record<string, TsoaRoute.ParameterSchema> = {
                cartId: {"in":"path","name":"cartId","required":true,"dataType":"string"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/cart/:cartId/save',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(CartController)),
            ...(fetchMiddlewares<RequestHandler>(CartController.prototype.saveCartToProfile)),

            async function CartController_saveCartToProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsCartController_saveCartToProfile, request, response });

                const controller = new CartController();

              await templateService.apiHandler({
                methodName: 'saveCartToProfile',
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
        const argsAuthController_register: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"RegisterRequest"},
        };
        app.post('/api/v1/auth/register',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.register)),

            async function AuthController_register(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_register, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'register',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_login: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"LoginRequest"},
        };
        app.post('/api/v1/auth/login',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.login)),

            async function AuthController_login(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_login, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'login',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_forgotPassword: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"ForgotPasswordRequest"},
        };
        app.post('/api/v1/auth/forgot-password',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.forgotPassword)),

            async function AuthController_forgotPassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_forgotPassword, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'forgotPassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_resetPassword: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"ResetPasswordRequest"},
        };
        app.post('/api/v1/auth/reset-password',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.resetPassword)),

            async function AuthController_resetPassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_resetPassword, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'resetPassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_refreshToken: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"RefreshTokenRequest"},
        };
        app.post('/api/v1/auth/refresh-token',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.refreshToken)),

            async function AuthController_refreshToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_refreshToken, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'refreshToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_getProfile: Record<string, TsoaRoute.ParameterSchema> = {
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.get('/api/v1/auth/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.getProfile)),

            async function AuthController_getProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_getProfile, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'getProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_updateProfile: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"UpdateProfileRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/auth/profile',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.updateProfile)),

            async function AuthController_updateProfile(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_updateProfile, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'updateProfile',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_changePassword: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"ChangePasswordRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.post('/api/v1/auth/change-password',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.changePassword)),

            async function AuthController_changePassword(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_changePassword, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'changePassword',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_deleteAccount: Record<string, TsoaRoute.ParameterSchema> = {
                requestBody: {"in":"body","name":"requestBody","required":true,"ref":"DeleteAccountRequest"},
                request: {"in":"request","name":"request","required":true,"dataType":"object"},
        };
        app.delete('/api/v1/auth/account',
            authenticateMiddleware([{"jwt":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.deleteAccount)),

            async function AuthController_deleteAccount(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_deleteAccount, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'deleteAccount',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
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
