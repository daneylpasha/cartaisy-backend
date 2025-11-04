import axios from 'axios';
import { tenantConfig } from '../config/tenant';
import shopifyStorefront from './shopifyStorefrontService';

/**
 * Recommendations Service
 *
 * Integrates with Shopify's Recommendations API to provide:
 * - Product Detail Page (PDP) recommendations
 * - Cart-based recommendations
 *
 * Uses Shopify Storefront API for accessing recommendations and product data
 */

interface ShopifyRecommendation {
  id: string;
  handle: string;
}

interface ShopifyRecommendationsResponse {
  products?: ShopifyRecommendation[];
}

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  priceRange: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  compareAtPriceRange: {
    minVariantPrice: {
      amount: string;
    };
  };
  images: {
    edges: Array<{
      node: {
        url: string;
        altText: string;
        width: number;
        height: number;
      };
    }>;
  };
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        price: {
          amount: string;
        };
        compareAtPrice?: {
          amount: string;
        };
        availableForSale: boolean;
        quantityAvailable: number;
      };
    }>;
  };
}

/**
 * Get product recommendations from Shopify for a specific product (PDP)
 * Uses Shopify's Recommendations API and Storefront API
 *
 * @param shopifyProductId - Shopify product ID (e.g., "14819881320820")
 * @param limit - Number of recommendations to return
 */
export const getProductRecommendations = async (
  shopifyProductId: string,
  limit: number = 6
): Promise<any[]> => {
  try {
    // Validate Shopify product ID
    if (!shopifyProductId || shopifyProductId.trim() === '') {
      console.warn('Invalid Shopify product ID provided');
      return [];
    }

    // Check if Shopify Storefront is configured
    if (!shopifyStorefront.isConfigured()) {
      console.warn('Shopify Storefront not configured');
      return [];
    }

    const { storeUrl } = tenantConfig.shopify;
    if (!storeUrl) {
      console.warn('SHOPIFY_STORE_URL not configured');
      return [];
    }

    // Step 1: Call Shopify Recommendations API (REST)
    const shopDomain = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const recommendationsUrl = `https://${shopDomain}/recommendations/products.json?product_id=${shopifyProductId}&limit=${limit * 2}`;

    let recommendedHandles: string[] = [];

    try {
      const response = await axios.get<ShopifyRecommendationsResponse>(recommendationsUrl, {
        timeout: 5000,
      });

      const recommendedProducts = response.data.products || [];
      recommendedHandles = recommendedProducts.map((p) => p.handle).filter(Boolean);

      console.log(`Shopify recommendations for ${shopifyProductId}: found ${recommendedHandles.length} products`);
    } catch (error: any) {
      console.log(`Shopify Recommendations API returned empty or error for ${shopifyProductId}`);
      // Continue to fallback logic
    }

    // If no recommendations from Shopify, return empty (no fallback to avoid mismatched recommendations)
    if (recommendedHandles.length === 0) {
      console.log(`No recommendations available for product ${shopifyProductId}`);
      return [];
    }

    // Step 2: Fetch full product data from Shopify Storefront API
    const products = await fetchProductsByHandles(recommendedHandles, limit);

    return products;
  } catch (error) {
    console.error('Error fetching Shopify recommendations:', error);
    return [];
  }
};

/**
 * Get cart-based recommendations
 * Fetches recommendations for each cart item and aggregates results
 *
 * @param cartShopifyProductIds - Array of Shopify product IDs in cart
 * @param limit - Number of recommendations to return
 */
export const getCartRecommendations = async (
  cartShopifyProductIds: string[],
  limit: number = 6
): Promise<any[]> => {
  try {
    if (!cartShopifyProductIds || cartShopifyProductIds.length === 0) {
      console.warn('No cart items provided');
      return [];
    }

    // Fetch recommendations for each cart item
    const allRecommendations: any[] = [];
    const recommendationMap = new Map<string, number>(); // Track frequency of recommendations
    const seenShopifyIds = new Set<string>(cartShopifyProductIds); // Track cart items

    for (const shopifyProductId of cartShopifyProductIds) {
      const recommendations = await getProductRecommendations(shopifyProductId, limit * 2);

      recommendations.forEach((product: any) => {
        const productShopifyId = product.shopifyProductId;

        // Don't recommend products already in cart
        if (seenShopifyIds.has(productShopifyId)) {
          return;
        }

        // Track frequency (products recommended by multiple cart items rank higher)
        const currentCount = recommendationMap.get(productShopifyId) || 0;
        recommendationMap.set(productShopifyId, currentCount + 1);

        // Add to list if not already present
        if (!allRecommendations.find(p => p.shopifyProductId === productShopifyId)) {
          allRecommendations.push(product);
        }
      });
    }

    // Sort by frequency (products recommended for multiple cart items first)
    const sortedRecommendations = allRecommendations.sort((a, b) => {
      const freqA = recommendationMap.get(a.shopifyProductId) || 0;
      const freqB = recommendationMap.get(b.shopifyProductId) || 0;
      return freqB - freqA;
    });

    return sortedRecommendations.slice(0, limit);
  } catch (error) {
    console.error('Error fetching cart recommendations:', error);
    return [];
  }
};

/**
 * Fetch products from Shopify Storefront API by handles
 * @param handles - Array of product handles
 * @param limit - Maximum number of products to return
 */
async function fetchProductsByHandles(handles: string[], limit: number): Promise<any[]> {
  try {
    if (handles.length === 0) {
      return [];
    }

    // Build GraphQL query to fetch products by handle
    const query = `
      query getProductsByHandles($handles: [String!]!) {
        products(first: ${Math.min(handles.length, limit)}, query: $handles) {
          edges {
            node {
              id
              title
              handle
              description
              vendor
              productType
              tags
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              compareAtPriceRange {
                minVariantPrice {
                  amount
                }
              }
              images(first: 5) {
                edges {
                  node {
                    url
                    altText
                    width
                    height
                  }
                }
              }
              variants(first: 20) {
                edges {
                  node {
                    id
                    title
                    price {
                      amount
                    }
                    compareAtPrice {
                      amount
                    }
                    availableForSale
                    quantityAvailable
                  }
                }
              }
            }
          }
        }
      }
    `;

    // Create a query string for handles
    const handleQuery = handles.map(h => `handle:${h}`).join(' OR ');

    const response: any = await shopifyStorefront['query'](query, { handles: handleQuery });

    if (!response.data?.products?.edges) {
      console.warn('No products returned from Shopify Storefront');
      return [];
    }

    // Transform Shopify products to our format
    const products = response.data.products.edges.map((edge: any) => {
      const product = edge.node;
      return transformShopifyProduct(product);
    });

    return products.slice(0, limit);
  } catch (error) {
    console.error('Error fetching products from Shopify Storefront:', error);
    return [];
  }
}

/**
 * Transform Shopify product to our API format
 */
function transformShopifyProduct(product: ShopifyProduct): any {
  const shopifyId = product.id.split('/').pop() || '';

  return {
    _id: shopifyId,
    shopifyProductId: shopifyId,
    title: product.title,
    description: product.description,
    handle: product.handle,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    status: 'active',
    price: parseFloat(product.priceRange.minVariantPrice.amount),
    compareAtPrice: product.compareAtPriceRange?.minVariantPrice?.amount
      ? parseFloat(product.compareAtPriceRange.minVariantPrice.amount)
      : undefined,
    images: product.images.edges.map((edge, index) => ({
      url: edge.node.url,
      alt: edge.node.altText || product.title,
      position: index + 1,
      width: edge.node.width,
      height: edge.node.height,
    })),
    variants: product.variants.edges.map((edge) => ({
      id: edge.node.id.split('/').pop(),
      title: edge.node.title,
      price: parseFloat(edge.node.price.amount),
      compareAtPrice: edge.node.compareAtPrice
        ? parseFloat(edge.node.compareAtPrice.amount)
        : undefined,
      availableForSale: edge.node.availableForSale,
      quantityAvailable: edge.node.quantityAvailable,
    })),
  };
}
