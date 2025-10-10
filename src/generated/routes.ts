/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
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
import { expressAuthentication } from './../authentication';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';

const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
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
            "variants": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"quantityAvailable":{"dataType":"double","required":true},"availableForSale":{"dataType":"boolean","required":true},"price":{"dataType":"double","required":true},"title":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
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
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["BEST_SELLING"]},{"dataType":"enum","enums":["COLLECTION_DEFAULT"]},{"dataType":"enum","enums":["CREATED"]},{"dataType":"enum","enums":["ID"]},{"dataType":"enum","enums":["MANUAL"]},{"dataType":"enum","enums":["PRICE"]},{"dataType":"enum","enums":["RELEVANCE"]},{"dataType":"enum","enums":["TITLE"]}],"validators":{}},
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
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################


    
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
