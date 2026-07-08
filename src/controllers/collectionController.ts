import { Get, Route, Tags, Response, Path, Query, Header, Controller } from '@tsoa/runtime';
import mongoose from 'mongoose';
import shopifyStorefront from '../services/shopifyStorefrontService';
import {
  CollectionProductsResponse,
  CollectionProduct,
  ProductCollectionSortKey,
  ProductFilter,
  CollectionFacets,
  FacetOption,
} from '../types/api/collection';
import { ApiError } from '../utils/errors';

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
   * @param storeId - Required Store ID (from x-store-id header) for multi-tenant support
   * @param limit - Number of products per page (default: 20)
   * @param cursor - Pagination cursor for fetching next page
   * @param sortKey - Sort order for products
   * @param reverse - Reverse the sort order (for high to low)
   * @param filters - JSON string of ProductFilter array for filtering products
   */
  @Get('{collectionId}/products')
  @Response(400, 'Bad Request')
  @Response(404, 'Collection not found')
  @Response(500, 'Internal Server Error')
  public async getCollectionProducts(
    @Path() collectionId: string,
    @Header('x-store-id') storeId?: string,
    @Query() limit?: number,
    @Query() cursor?: string,
    @Query() sortKey?: ProductCollectionSortKey,
    @Query() reverse?: boolean,
    @Query() filters?: string
  ): Promise<CollectionProductsResponse> {
    try {
      // Set defaults for optional parameters
      const effectiveLimit = limit || 20;

      // Handle custom DISCOUNT sort key
      const isDiscountSort = sortKey === 'DISCOUNT';
      const effectiveSortKey = isDiscountSort ? 'COLLECTION_DEFAULT' : (sortKey || 'COLLECTION_DEFAULT');

      // Parse filters from JSON string if provided
      let parsedFilters: ProductFilter[] = [];
      if (filters) {
        try {
          parsedFilters = JSON.parse(filters);
          if (!Array.isArray(parsedFilters)) {
            this.setStatus(400);
            throw new Error('Filters must be an array');
          }
          console.log('Parsed filters:', JSON.stringify(parsedFilters, null, 2));
        } catch (error) {
          this.setStatus(400);
          throw new Error('Invalid filters format. Must be valid JSON array.');
        }
      }

      // Remove variantOption filters from Shopify request (handle client-side)
      // Shopify Storefront API may not support variantOption filtering
      const shopifyFilters = parsedFilters.filter(f => !f.variantOption);

      // Require explicit store context so mobile collection reads cannot fall back to
      // process-wide Shopify credentials and accidentally query another tenant.
      if (!storeId) {
        this.setStatus(400);
        throw new Error('x-store-id header is required');
      }

      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        this.setStatus(400);
        throw new Error('Invalid Store ID format');
      }

      const shopifyResponse = await shopifyStorefront.getCollectionProductsForStore(storeId, collectionId, {
        limit: effectiveLimit,
        cursor,
        sortKey: effectiveSortKey,
        reverse: reverse || false,
        filters: shopifyFilters.length > 0 ? shopifyFilters : [],
      });

      // Check for Shopify GraphQL errors
      if (shopifyResponse?.errors) {
        console.error('Shopify GraphQL errors:', JSON.stringify(shopifyResponse.errors, null, 2));
        this.setStatus(500);
        throw new Error(`Shopify API error: ${shopifyResponse.errors[0]?.message || 'Unknown error'}`);
      }

      if (!shopifyResponse?.data?.collection) {
        this.setStatus(404);
        throw new Error('Collection not found');
      }

      const collection = shopifyResponse.data.collection;
      let products = this.transformProducts(collection.products?.edges || []);
      const pageInfo = collection.products?.pageInfo || {
        hasNextPage: false,
        hasPreviousPage: false,
        endCursor: null,
        startCursor: null,
      };

      // Apply custom discount sorting if requested
      if (isDiscountSort) {
        products = this.sortByDiscount(products);
      }

      // Apply client-side color filtering if Shopify doesn't support it
      // Filter by variantOption (color) on backend if present
      const colorFilters = parsedFilters.filter(f => f.variantOption);
      console.log('Color filters found:', colorFilters.length);
      if (colorFilters.length > 0) {
        console.log('Filtering products by variant options:', JSON.stringify(colorFilters, null, 2));
        console.log('Products before filtering:', products.length);
        products = this.filterByVariantOptions(products, colorFilters);
        console.log('Products after filtering:', products.length);
      }

      // Compute facets from the products
      const facets = this.computeFacets(products);

      return {
        success: true,
        data: {
          collectionId: collection.id,
          collectionTitle: collection.title,
          collectionDescription: collection.description || '',
          products,
          facets,
          pageInfo,
          totalCount: products.length,
        },
      };
    } catch (error) {
      console.error(
        'Error fetching collection products:',
        error instanceof Error ? error.message : 'Unknown error'
      );

      if (error instanceof ApiError) {
        this.setStatus(error.statusCode);
      } else if (error instanceof Error && error.message === 'Collection not found') {
        this.setStatus(404);
      } else if (error instanceof Error && (error.message.includes('Invalid filters') || error.message === 'Invalid Store ID format' || error.message === 'x-store-id header is required')) {
        this.setStatus(400);
      } else if (error instanceof Error && (error.message === 'Store not found' || error.message === 'Store is not active')) {
        this.setStatus(404);
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
        selectedOptions: variantEdge.node.selectedOptions || [],
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

  /**
   * Compute facets (filters) from products for dynamic filtering
   * Industry best practice: Facets reflect what's available in current results
   */
  private computeFacets(products: CollectionProduct[]): CollectionFacets {
    // If no products, return empty facets
    if (products.length === 0) {
      return {
        categories: [],
        vendors: [],
        priceRange: { min: 0, max: 0 },
        colors: [],
        tags: [],
      };
    }

    // Aggregate categories (productType) with counts
    const categoryMap = new Map<string, number>();
    products.forEach((product) => {
      if (product.productType) {
        categoryMap.set(product.productType, (categoryMap.get(product.productType) || 0) + 1);
      }
    });

    const categories: FacetOption[] = Array.from(categoryMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    // Aggregate vendors with counts
    const vendorMap = new Map<string, number>();
    products.forEach((product) => {
      if (product.vendor) {
        vendorMap.set(product.vendor, (vendorMap.get(product.vendor) || 0) + 1);
      }
    });

    const vendors: FacetOption[] = Array.from(vendorMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    // Compute price range
    const prices = products.map((p) => p.minPrice).filter((p) => p > 0);
    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
    };

    // Aggregate colors from variant options
    const colorMap = new Map<string, number>();
    products.forEach((product) => {
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach((variant) => {
          if (variant.selectedOptions) {
            const colorOption = variant.selectedOptions.find(
              (opt) => opt.name.toLowerCase() === 'color' || opt.name.toLowerCase() === 'colour'
            );
            if (colorOption && colorOption.value) {
              colorMap.set(colorOption.value, (colorMap.get(colorOption.value) || 0) + 1);
            }
          }
        });
      }
    });

    const colors: FacetOption[] = Array.from(colorMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

    // Aggregate tags with counts (optional, can be heavy)
    const tagMap = new Map<string, number>();
    products.forEach((product) => {
      if (product.tags && product.tags.length > 0) {
        product.tags.forEach((tag) => {
          tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
        });
      }
    });

    const tags: FacetOption[] = Array.from(tagMap.entries())
      .map(([value, count]) => ({ value, count }))
      .filter((tag) => tag.count >= 2) // Only show tags that appear in 2+ products
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit to top 20 tags

    return {
      categories,
      vendors,
      priceRange,
      colors,
      tags,
    };
  }

  /**
   * Sort products by discount percentage (highest first)
   * Discount % = ((compareAtPrice - minPrice) / compareAtPrice) * 100
   */
  private sortByDiscount(products: CollectionProduct[]): CollectionProduct[] {
    return products
      .map((product) => {
        // Calculate discount percentage
        let discountPercent = 0;
        if (product.compareAtPrice && product.compareAtPrice > product.minPrice) {
          discountPercent = ((product.compareAtPrice - product.minPrice) / product.compareAtPrice) * 100;
        }
        return { product, discountPercent };
      })
      .sort((a, b) => b.discountPercent - a.discountPercent) // Sort by discount descending
      .map((item) => item.product); // Extract products
  }

  /**
   * Filter products by variant options (e.g., color, size)
   * This is a client-side filter since Shopify Storefront API doesn't support it
   */
  private filterByVariantOptions(
    products: CollectionProduct[],
    variantFilters: ProductFilter[]
  ): CollectionProduct[] {
    try {
      console.log('=== Starting variant filtering ===');
      console.log('Total products to filter:', products.length);
      console.log('Variant filters:', JSON.stringify(variantFilters, null, 2));

      // Debug: Check first product's variant structure
      if (products.length > 0 && products[0].variants && products[0].variants.length > 0) {
        console.log('Sample variant structure:', JSON.stringify(products[0].variants[0], null, 2));
      }

      const filtered = products.filter((product, index) => {
        try {
          // Check if product has at least one variant matching any of the filters
          const matches = variantFilters.some((filter) => {
            if (!filter.variantOption) return false;

            const { name, value } = filter.variantOption;

            // Check if product has variants
            if (!product.variants || product.variants.length === 0) {
              if (index === 0) console.log('Product has no variants:', product.id);
              return false;
            }

            // Use EXACT same logic as facet computation for consistency
            const hasMatch = product.variants.some((variant) => {
              if (!variant.selectedOptions || variant.selectedOptions.length === 0) {
                if (index === 0) console.log('Variant has no selectedOptions:', variant.id);
                return false;
              }

              // Find the option matching the filter name (case-insensitive for Color/Colour)
              const colorOption = variant.selectedOptions.find(
                (opt) => {
                  const optNameLower = opt.name.toLowerCase();
                  const filterNameLower = name.toLowerCase();
                  return optNameLower === filterNameLower ||
                         optNameLower === 'color' && filterNameLower === 'colour' ||
                         optNameLower === 'colour' && filterNameLower === 'color';
                }
              );

              if (!colorOption) {
                return false;
              }

              // Compare values: case-insensitive and trimmed
              const optionValue = (colorOption.value || '').trim().toLowerCase();
              const filterValue = (value || '').trim().toLowerCase();
              const valueMatch = optionValue === filterValue;

              if (index < 3) {
                console.log(`  Variant ${variant.id}: ${colorOption.name}="${colorOption.value}" vs filter "${name}"="${value}" → ${valueMatch ? 'MATCH' : 'NO MATCH'}`);
              }

              return valueMatch;
            });

            return hasMatch;
          });

          if (index < 5) {
            console.log(`Product ${index + 1} (${product.title}): ${matches ? '✓ MATCH' : '✗ NO MATCH'}`);
          }

          return matches;
        } catch (error) {
          console.error('Error filtering product:', product.id, error);
          return false;
        }
      });

      console.log('Filtered products count:', filtered.length);
      console.log('=== End variant filtering ===');

      return filtered;
    } catch (error) {
      console.error('Error in filterByVariantOptions:', error);
      return products; // Return all products if filtering fails
    }
  }
}
