import { Get, Route, Tags, Response, Path } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import shopifyStorefront from '../services/shopifyStorefrontService';
import ProductMetrics from '../models/ProductMetrics';
import Product from '../models/Product';
import {
  ProductDetailResponse,
  ProductDetail,
  ProductVariant,
  ProductBadges,
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
   */
  @Get('{productId}')
  @Response(404, 'Product not found')
  @Response(500, 'Internal Server Error')
  public async getProductDetail(
    @Path() productId: string
  ): Promise<ProductDetailResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      // Fetch product from Shopify
      const shopifyResponse = await shopifyStorefront.getProductById(productId);

      if (!shopifyResponse?.data?.product) {
        this.setStatus(404);
        throw new Error('Product not found');
      }

      const shopifyProduct = shopifyResponse.data.product;

      // Extract numeric product ID for MongoDB queries
      const numericProductId = shopifyProduct.id.split('/').pop() || productId;

      // Fetch MongoDB enrichment data in parallel
      const [productMetrics, productData] = await Promise.all([
        ProductMetrics.findOne({ productId: numericProductId }).lean(),
        Product.findOne({ productId: numericProductId }).lean(),
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
