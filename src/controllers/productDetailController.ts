import { Get, Route, Tags, Response, Path, Query, Header } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import mongoose from 'mongoose';
import shopifyStorefront from '../services/shopifyStorefrontService';
import ProductMetrics from '../models/ProductMetrics';
import Product from '../models/Product';
import {
  ProductDetailResponse,
  ProductDetail,
  ProductVariant,
  ProductBadges,
  ProductMetafield,
} from '../types/api/productDetail';

/**
 * Product Detail Controller
 * Provides detailed product information with variants
 */
@Route('products')
@Tags('Products')
export class ProductDetailController extends Controller {
  /**
   * Get detailed product information by ID
   * @param productId - Shopify product ID (numeric or GID format)
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant support
   * @param country - ISO 3166-1 alpha-2 country code for multi-currency pricing (e.g., 'US', 'GB', 'CA')
   */
  @Get('{productId}')
  @Response(400, 'Bad Request')
  @Response(404, 'Product not found')
  @Response(500, 'Internal Server Error')
  public async getProductDetail(
    @Path() productId: string,
    @Header('x-store-id') storeId?: string,
    @Query() country?: string
  ): Promise<ProductDetailResponse> {
    try {
      // Require explicit store context so mobile product reads cannot fall back to
      // process-wide Shopify credentials and accidentally query another tenant.
      if (!storeId) {
        this.setStatus(400);
        throw new Error('x-store-id header is required');
      }

      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        this.setStatus(400);
        throw new Error('Invalid Store ID format');
      }

      // Fetch product from Shopify with store-specific credentials and country context.
      const shopifyResponse = await shopifyStorefront.getProductByIdForStore(storeId, productId, country);

      if (!shopifyResponse?.data?.product) {
        this.setStatus(404);
        throw new Error('Product not found');
      }

      const shopifyProduct = shopifyResponse.data.product;

      // Extract numeric product ID for MongoDB queries
      const numericProductId = shopifyProduct.id.split('/').pop() || productId;

      // Fetch MongoDB enrichment data and Admin API metafields in parallel
      const [productMetrics, productData, metafieldsResponse] = await Promise.all([
        ProductMetrics.findOne({ productId: numericProductId }).lean(),
        Product.findOne({ productId: numericProductId }).lean(),
        // Avoid the process-wide Admin API client in tenant-scoped mobile reads.
        // Store-scoped metafield hydration should be added with a tenant-specific Admin client.
        Promise.resolve({ data: { product: { metafields: { edges: [] } } } }),
      ]);

      // Transform Shopify product data
      const productDetail: ProductDetail = {
        productId: numericProductId,
        title: shopifyProduct.title,
        description: shopifyProduct.description || '',
        descriptionHtml: shopifyProduct.descriptionHtml || '',
        images: shopifyProduct.images?.edges.map((edge: any) => edge.node.url) || [],
        price: parseFloat(shopifyProduct.priceRange.minVariantPrice.amount),
        compareAtPrice: shopifyProduct.compareAtPriceRange?.minVariantPrice?.amount
          ? parseFloat(shopifyProduct.compareAtPriceRange.minVariantPrice.amount)
          : undefined,
        currency: shopifyProduct.priceRange.minVariantPrice.currencyCode,
        vendor: shopifyProduct.vendor || '',
        productType: shopifyProduct.productType || '',
        tags: shopifyProduct.tags || [],
        handle: shopifyProduct.handle,

        // Stock
        availableForSale: shopifyProduct.availableForSale,
        totalInventory: shopifyProduct.totalInventory || 0,
        inStock: shopifyProduct.availableForSale && shopifyProduct.totalInventory > 0,

        // Variants
        variants: this.transformVariants(shopifyProduct.variants?.edges || []),

        // Metafields (custom fields from Admin API)
        metafields: this.transformMetafields(metafieldsResponse?.data?.product?.metafields?.edges || []),

        // MongoDB enrichment
        rating: productData?.reviews?.averageRating || 0,
        reviewsCount: productData?.reviews?.count || 0,
        soldThisMonth: productMetrics?.soldThisMonth || 0,

        // Badges
        badges: this.calculateBadges(
          productMetrics?.isBestSeller || false,
          parseFloat(shopifyProduct.priceRange.minVariantPrice.amount),
          shopifyProduct.compareAtPriceRange?.minVariantPrice?.amount
            ? parseFloat(shopifyProduct.compareAtPriceRange.minVariantPrice.amount)
            : undefined
        ),
      };

      return {
        success: true,
        data: productDetail,
      };
    } catch (error) {
      console.error(
        'Error fetching product detail:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof Error && error.message === 'Product not found') {
        this.setStatus(404);
      } else {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Transform Shopify variants to API format
   */
  private transformVariants(variantEdges: any[]): ProductVariant[] {
    return variantEdges.map((edge) => {
      const variant = edge.node;
      return {
        id: variant.id.split('/').pop() || variant.id,
        title: variant.title,
        price: parseFloat(variant.price.amount),
        compareAtPrice: variant.compareAtPrice?.amount
          ? parseFloat(variant.compareAtPrice.amount)
          : undefined,
        availableForSale: variant.availableForSale,
        quantityAvailable: variant.quantityAvailable || 0,
        selectedOptions: variant.selectedOptions || [],
        image: variant.image?.url,
      };
    });
  }

  /**
   * Transform Shopify metafields to API format
   * Includes custom and shopify metafields (namespaces: "custom", "shopify")
   * Shopify namespace contains category metafields like color-pattern, material, etc.
   * Resolves metaobject references to display values
   */
  private transformMetafields(metafieldEdges: any[]): ProductMetafield[] {
    return metafieldEdges
      .map((edge) => edge.node)
      .filter((metafield) => metafield.namespace === 'custom' || metafield.namespace === 'shopify')
      .map((metafield) => {
        // Check if this is a metaobject reference type
        const isMetaobjectReference = metafield.type?.includes('metaobject_reference');

        let displayKey = metafield.key;
        let displayValue = metafield.value;

        // If it's a metaobject reference and we have resolved metaobjects, use them
        if (isMetaobjectReference && metafield.resolvedMetaobjects && metafield.resolvedMetaobjects.length > 0) {
          // Convert key from kebab-case to Title Case (e.g., "color-pattern" -> "Color Pattern")
          displayKey = metafield.key
            .split('-')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          // Extract display names from resolved metaobjects
          const displayNames = metafield.resolvedMetaobjects
            .map((mo: any) => mo.displayName)
            .filter((name: string) => name)
            .join(', ');

          displayValue = displayNames || metafield.value;
        }

        return {
          namespace: metafield.namespace,
          key: displayKey,
          value: displayValue,
          type: metafield.type,
          description: metafield.description,
        };
      });
  }

  /**
   * Calculate product badges
   */
  private calculateBadges(
    isBestSeller: boolean,
    price: number,
    compareAtPrice?: number
  ): ProductBadges {
    let discountPercentage: number | undefined;

    if (compareAtPrice && compareAtPrice > price) {
      discountPercentage = Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
    }

    return {
      isBestSeller,
      discountPercentage,
    };
  }
}
