import { Get, Route, Tags, Response, Path, Query } from 'tsoa';
import { Controller } from '@tsoa/runtime';
import shopifyStorefront from '../services/shopifyStorefrontService';
import {
  CollectionProductsResponse,
  CollectionProduct,
  ProductCollectionSortKey,
  ProductFilter,
} from '../types/api/collection';

/**
 * Collection Controller
 * Manages collection and product listing operations
 */
@Route('collections')
@Tags('Collections')
export class CollectionController extends Controller {
  /**
   * Get products from a collection with pagination, filtering, and sorting
   * @param collectionId - Shopify collection ID (numeric or GID format)
   * @param limit - Number of products per page (default: 20)
   * @param cursor - Pagination cursor for fetching next page
   * @param sortKey - Sort order for products
   * @param filters - JSON string of ProductFilter array for filtering products
   */
  @Get('{collectionId}/products')
  @Response(400, 'Bad Request')
  @Response(404, 'Collection not found')
  @Response(500, 'Internal Server Error')
  public async getCollectionProducts(
    @Path() collectionId: string,
    @Query() limit?: number,
    @Query() cursor?: string,
    @Query() sortKey?: ProductCollectionSortKey,
    @Query() filters?: string
  ): Promise<CollectionProductsResponse> {
    try {
      if (!shopifyStorefront.isConfigured()) {
        this.setStatus(500);
        throw new Error('Shopify not configured');
      }

      // Set defaults for optional parameters
      const effectiveLimit = limit || 20;
      const effectiveSortKey = sortKey || 'COLLECTION_DEFAULT';

      // Parse filters from JSON string if provided
      let parsedFilters: ProductFilter[] = [];
      if (filters) {
        try {
          parsedFilters = JSON.parse(filters);
          if (!Array.isArray(parsedFilters)) {
            this.setStatus(400);
            throw new Error('Filters must be an array');
          }
        } catch (error) {
          this.setStatus(400);
          throw new Error('Invalid filters format. Must be valid JSON array.');
        }
      }

      const shopifyResponse = await shopifyStorefront.getCollectionProducts(collectionId, {
        limit: effectiveLimit,
        cursor,
        sortKey: effectiveSortKey,
        filters: parsedFilters,
      });

      if (!shopifyResponse?.data?.collection) {
        this.setStatus(404);
        throw new Error('Collection not found');
      }

      const collection = shopifyResponse.data.collection;
      const products = this.transformProducts(collection.products?.edges || []);
      const pageInfo = collection.products?.pageInfo || {
        hasNextPage: false,
        hasPreviousPage: false,
        endCursor: null,
        startCursor: null,
      };

      return {
        success: true,
        data: {
          collectionId: collection.id,
          collectionTitle: collection.title,
          collectionDescription: collection.description || '',
          products,
          pageInfo,
          totalCount: products.length,
        },
      };
    } catch (error) {
      console.error(
        'Error fetching collection products:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof Error && error.message === 'Collection not found') {
        this.setStatus(404);
      } else if (error instanceof Error && error.message.includes('Invalid filters')) {
        this.setStatus(400);
      } else if (!this.getStatus || this.getStatus() === 200) {
        this.setStatus(500);
      }

      throw error;
    }
  }

  /**
   * Transform Shopify product edges to API format
   */
  private transformProducts(edges: any[]): CollectionProduct[] {
    return edges.map((edge: any) => {
      const node = edge.node;
      const images = (node.images?.edges || []).map((imgEdge: any) => ({
        url: imgEdge.node.url,
        altText: imgEdge.node.altText || null,
      }));

      const variants = (node.variants?.edges || []).map((variantEdge: any) => ({
        id: variantEdge.node.id,
        title: variantEdge.node.title,
        price: parseFloat(variantEdge.node.price?.amount || '0'),
        availableForSale: variantEdge.node.availableForSale,
        quantityAvailable: variantEdge.node.quantityAvailable || 0,
      }));

      return {
        id: node.id,
        title: node.title,
        description: node.description || '',
        handle: node.handle,
        vendor: node.vendor || '',
        productType: node.productType || '',
        tags: node.tags || [],
        availableForSale: node.availableForSale,
        totalInventory: node.totalInventory || 0,
        minPrice: parseFloat(node.priceRange?.minVariantPrice?.amount || '0'),
        maxPrice: parseFloat(node.priceRange?.maxVariantPrice?.amount || '0'),
        compareAtPrice: node.compareAtPriceRange?.minVariantPrice?.amount
          ? parseFloat(node.compareAtPriceRange.minVariantPrice.amount)
          : null,
        currency: node.priceRange?.minVariantPrice?.currencyCode || 'USD',
        images,
        variants,
      };
    });
  }
}
