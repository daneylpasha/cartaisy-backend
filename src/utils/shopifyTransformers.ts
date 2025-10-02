import { Product, Collection } from '../types/api/products';
import {
  ShopifyProduct,
  ShopifyCollection,
  ShopifyProductEdge,
} from '../types/shopify/storefront';

/**
 * Extract numeric ID from Shopify GID
 * e.g., "gid://shopify/Product/123456" -> "123456"
 */
function extractShopifyId(gid: string): string {
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * Transform Shopify Product to our API Product format (without enrichment)
 */
export function transformShopifyProduct(shopifyProduct: ShopifyProduct): Omit<Product, 'rating' | 'reviewsCount'> {
  const images = shopifyProduct.images?.edges.map(edge => edge.node.url) || [];
  const price = parseFloat(shopifyProduct.priceRange.minVariantPrice.amount);
  const compareAtPrice = shopifyProduct.compareAtPriceRange?.minVariantPrice.amount
    ? parseFloat(shopifyProduct.compareAtPriceRange.minVariantPrice.amount)
    : undefined;

  // Calculate total and available quantity from variants
  let availableQuantity = 0;
  let totalQuantity = shopifyProduct.totalInventory || 0;

  if (shopifyProduct.variants?.edges) {
    shopifyProduct.variants.edges.forEach(edge => {
      if (edge.node.quantityAvailable !== undefined) {
        availableQuantity += edge.node.quantityAvailable;
      }
    });
  }

  return {
    productId: extractShopifyId(shopifyProduct.id),
    title: shopifyProduct.title,
    description: shopifyProduct.description,
    images,
    price,
    compareAtPrice,
    currency: shopifyProduct.priceRange.minVariantPrice.currencyCode,
    inStock: shopifyProduct.availableForSale,
    availableQuantity,
    totalQuantity,
    handle: shopifyProduct.handle,
    vendor: shopifyProduct.vendor,
    tags: shopifyProduct.tags || [],
  };
}

/**
 * Transform Shopify Collection to our API Collection format
 */
export function transformShopifyCollection(
  shopifyCollection: ShopifyCollection,
  includeProducts: boolean = true
): Omit<Collection, 'products'> & { products?: Omit<Product, 'rating' | 'reviewsCount'>[] } {
  const transformed: any = {
    id: extractShopifyId(shopifyCollection.id),
    title: shopifyCollection.title,
    description: shopifyCollection.description,
    handle: shopifyCollection.handle,
    image: shopifyCollection.image?.url,
  };

  if (includeProducts && shopifyCollection.products) {
    transformed.products = shopifyCollection.products.edges.map(edge =>
      transformShopifyProduct(edge.node)
    );
  }

  return transformed;
}

/**
 * Transform multiple Shopify products from a connection
 */
export function transformShopifyProductEdges(
  edges: ShopifyProductEdge[]
): Omit<Product, 'rating' | 'reviewsCount'>[] {
  return edges.map(edge => transformShopifyProduct(edge.node));
}
