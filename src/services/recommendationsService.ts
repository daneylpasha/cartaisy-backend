import axios from 'axios';
import { tenantConfig } from '../config/tenant';
import Product from '../models/Product';
import { IProduct } from '../types';

/**
 * Recommendations Service
 *
 * Integrates with Shopify's Recommendations API to provide:
 * - Product Detail Page (PDP) recommendations
 * - Cart-based recommendations
 *
 * Uses Shopify Storefront API for accessing recommendations
 */

interface ShopifyRecommendation {
  id: string;
  handle: string;
}

interface ShopifyRecommendationsResponse {
  products?: ShopifyRecommendation[];
}

/**
 * Get product recommendations from Shopify for a specific product (PDP)
 * Uses Shopify's Storefront API recommendations endpoint
 *
 * @param shopifyProductId - Shopify product ID (e.g., "14819881320820")
 * @param limit - Number of recommendations to return
 */
export const getProductRecommendations = async (
  shopifyProductId: string,
  limit: number = 6
): Promise<any[]> => {
  try {
    const { storeUrl, storefrontAccessToken } = tenantConfig.shopify;

    if (!storeUrl || !storefrontAccessToken) {
      console.warn('Shopify Storefront credentials not configured, using fallback recommendations');
      return getFallbackRecommendationsByShopifyId(shopifyProductId, limit);
    }

    // Validate Shopify product ID
    if (!shopifyProductId || shopifyProductId.trim() === '') {
      console.warn('Invalid Shopify product ID provided');
      return [];
    }

    // Call Shopify Recommendations API
    // Format: https://your-store.myshopify.com/recommendations/products.json?product_id={shopify_product_id}&limit={limit}
    const shopDomain = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const recommendationsUrl = `https://${shopDomain}/recommendations/products.json?product_id=${shopifyProductId}&limit=${limit}`;

    const response = await axios.get<ShopifyRecommendationsResponse>(recommendationsUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
      },
      timeout: 5000,
    });

    const recommendedProducts = response.data.products || [];

    if (recommendedProducts.length === 0) {
      console.log(`No Shopify recommendations found for product ${shopifyProductId}, using fallback`);
      return getFallbackRecommendationsByShopifyId(shopifyProductId, limit);
    }

    // Extract product handles from Shopify response
    const handles = recommendedProducts.map(p => p.handle).filter(Boolean);

    // Fetch full product data from our database
    const products = await Product.find({
      handle: { $in: handles },
      status: 'active',
    })
      .limit(limit)
      .lean();

    // If we don't have enough products, supplement with fallback
    if (products.length < limit) {
      const fallbackProducts = await getFallbackRecommendationsByShopifyId(
        shopifyProductId,
        limit - products.length,
        products.map(p => p._id.toString())
      );
      products.push(...fallbackProducts);
    }

    return products.slice(0, limit);
  } catch (error) {
    console.error('Error fetching Shopify recommendations:', error);
    // Fallback to category-based recommendations
    return getFallbackRecommendationsByShopifyId(shopifyProductId, limit);
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
 * Fallback recommendations when Shopify API is unavailable or returns empty results
 * Uses category, tags, and price range to find similar products
 *
 * @param shopifyProductId - Shopify product ID
 * @param limit - Number of recommendations
 * @param excludeIds - MongoDB IDs to exclude from results
 */
async function getFallbackRecommendationsByShopifyId(
  shopifyProductId: string,
  limit: number = 6,
  excludeIds: string[] = []
): Promise<any[]> {
  try {
    const product = await Product.findOne({ shopifyProductId }).lean();

    if (!product) {
      // Return featured products as last resort
      return Product.find({
        status: 'active',
        'mobileDisplay.isFeatured': true,
        _id: { $nin: excludeIds },
      })
        .limit(limit)
        .lean();
    }

    // Build fallback query based on product attributes
    const fallbackQuery: any = {
      status: 'active',
      _id: { $ne: product._id, $nin: excludeIds },
    };

    // Match by category or product type
    if (product.productType) {
      fallbackQuery.productType = product.productType;
    }

    // Match by tags (at least one common tag)
    if (product.tags && product.tags.length > 0) {
      fallbackQuery.tags = { $in: product.tags };
    }

    // Similar price range (±30%)
    const priceMin = product.price * 0.7;
    const priceMax = product.price * 1.3;
    fallbackQuery.price = { $gte: priceMin, $lte: priceMax };

    const recommendations = await Product.find(fallbackQuery)
      .sort({ 'analytics.engagementScore': -1, createdAt: -1 })
      .limit(limit)
      .lean();

    // If still not enough, get most popular products
    if (recommendations.length < limit) {
      const popularProducts = await Product.find({
        status: 'active',
        _id: {
          $nin: [...excludeIds, ...recommendations.map(p => p._id.toString())],
        },
      })
        .sort({ 'analytics.engagementScore': -1 })
        .limit(limit - recommendations.length)
        .lean();

      recommendations.push(...popularProducts);
    }

    return recommendations;
  } catch (error) {
    console.error('Error in fallback recommendations:', error);
    return [];
  }
}
