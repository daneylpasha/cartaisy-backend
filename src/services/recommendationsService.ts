import shopifyStorefront, { ShopifyStorefrontClient } from './shopifyStorefrontService';
import { ApiError } from '../utils/errors';

/**
 * Recommendations Service
 *
 * Integrates with Shopify's Storefront GraphQL API to provide:
 * - Product Detail Page (PDP) recommendations using Shopify's native algorithm
 * - Cart-based recommendations aggregating results from cart items
 *
 * Shopify's algorithm considers:
 * - Purchase history and buying patterns
 * - Product descriptions and attributes
 * - Collection relationships
 *
 * Falls back to collection-based and random products when Shopify has no data
 */

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

interface RecommendationOptions {
  storeId?: string | null;
  storefrontClient?: ShopifyStorefrontClient;
}

type RecommendationContext = {
  storefrontClient: ShopifyStorefrontClient;
};

const getStorefrontClientError = (storefrontClient: ShopifyStorefrontClient): {
  message: string;
  expose: boolean;
} => {
  const expose = storefrontClient.expose ?? false;

  return {
    message: expose
      ? storefrontClient.error || 'Shopify not configured for this store'
      : 'Shopify not configured for this store',
    expose,
  };
};

const getRecommendationContext = async (
  options: RecommendationOptions = {}
): Promise<RecommendationContext | null> => {
  if (options.storefrontClient) {
    if (!options.storefrontClient.isConfigured) {
      const { message, expose } = getStorefrontClientError(options.storefrontClient);

      throw new ApiError(
        message,
        options.storefrontClient.statusCode || 400,
        true,
        undefined,
        expose
      );
    }

    return {
      storefrontClient: options.storefrontClient,
    };
  }

  if (options.storeId) {
    const storefrontClient = await shopifyStorefront.getStorefrontClientForStore(options.storeId);

    if (!storefrontClient.isConfigured) {
      const { message, expose } = getStorefrontClientError(storefrontClient);

      throw new ApiError(
        message,
        storefrontClient.statusCode || 400,
        true,
        undefined,
        expose
      );
    }

    return {
      storefrontClient,
    };
  }

  throw new ApiError('Store context is required for recommendations', 400, true, undefined, true);
};

/**
 * Get product recommendations from Shopify for a specific product (PDP)
 * Uses Shopify's Recommendations API and Storefront API
 *
 * @param shopifyProductId - Shopify product ID (e.g., "14819881320820")
 * @param limit - Number of recommendations to return
 */
export const getProductRecommendations = async (
  shopifyProductId: string,
  limit: number = 6,
  options: RecommendationOptions = {}
): Promise<any[]> => {
  try {
    // Validate Shopify product ID
    if (!shopifyProductId || shopifyProductId.trim() === '') {
      console.warn('Invalid Shopify product ID provided');
      return [];
    }

    const context = await getRecommendationContext(options);
    if (!context) {
      return [];
    }

    const { storefrontClient } = context;

    // Step 1: Try Shopify Storefront GraphQL productRecommendations query
    // Docs: https://shopify.dev/docs/api/storefront/latest/queries/productrecommendations
    let recommendedHandles: string[] = [];

    try {
      const query = `
        query getProductRecommendations($productId: ID!) {
          productRecommendations(productId: $productId) {
            id
            handle
          }
        }
      `;

      const gid = `gid://shopify/Product/${shopifyProductId}`;
      const response: any = await storefrontClient.query(query, { productId: gid });

      if (response.data?.productRecommendations) {
        recommendedHandles = response.data.productRecommendations
          .map((p: any) => p.handle)
          .filter(Boolean)
          .slice(0, limit);

        console.log(`Shopify GraphQL recommendations for ${shopifyProductId}: found ${recommendedHandles.length} products`);
      } else {
        console.log(`Shopify GraphQL productRecommendations returned no data for ${shopifyProductId}`);
      }
    } catch (error: any) {
      console.log(`Shopify GraphQL productRecommendations error for ${shopifyProductId}:`, error.message);
      // Continue to fallback logic
    }

    // Step 2: If no recommendations from Shopify, use fallback strategy
    if (recommendedHandles.length === 0) {
      console.log(`No Shopify recommendations for ${shopifyProductId}, using smart fallback`);
      return await getSmartRecommendations(context, shopifyProductId, limit);
    }

    // Step 3: Fetch full product data from Shopify Storefront API
    const products = await fetchProductsByHandles(context, recommendedHandles, limit);

    // Step 4: Validate if Shopify recommendations are relevant
    const isRelevant = await validateRecommendations(context, shopifyProductId, products);

    if (!isRelevant) {
      console.log(`Shopify recommendations not relevant for ${shopifyProductId}, using smart fallback`);
      return await getSmartRecommendations(context, shopifyProductId, limit);
    }

    console.log(`Using Shopify recommendations for ${shopifyProductId}`);
    return products;
  } catch (error) {
    console.error('Error fetching Shopify recommendations:', error);
    if (error instanceof ApiError) {
      throw error;
    }
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
  limit: number = 6,
  options: RecommendationOptions = {}
): Promise<any[]> => {
  try {
    if (!cartShopifyProductIds || cartShopifyProductIds.length === 0) {
      console.warn('No cart items provided');
      return [];
    }

    const context = await getRecommendationContext(options);
    if (!context) {
      return [];
    }

    // Fetch recommendations for each cart item
    const allRecommendations: any[] = [];
    const recommendationMap = new Map<string, number>(); // Track frequency of recommendations
    const seenShopifyIds = new Set<string>(cartShopifyProductIds); // Track cart items

    for (const shopifyProductId of cartShopifyProductIds) {
      const recommendations = await getProductRecommendations(shopifyProductId, limit * 2, {
        storefrontClient: context.storefrontClient,
      });

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
    if (error instanceof ApiError) {
      throw error;
    }
    return [];
  }
};

/**
 * Validate if Shopify recommendations are relevant to the source product
 * Checks if recommended products have similar product type
 */
async function validateRecommendations(
  context: RecommendationContext,
  shopifyProductId: string,
  recommendedProducts: any[]
): Promise<boolean> {
  try {
    if (recommendedProducts.length === 0) {
      return false;
    }

    // Get source product details
    const sourceQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          productType
        }
      }
    `;

    const gid = `gid://shopify/Product/${shopifyProductId}`;
    const response: any = await context.storefrontClient.query(sourceQuery, { id: gid });

    if (!response.data?.product) {
      console.log('Could not fetch source product for validation');
      return true; // Assume valid if we can't validate
    }

    const sourceProductType = response.data.product.productType?.trim().toUpperCase() || '';

    // If source has no product type, accept Shopify's recommendations
    // Shopify's algorithm uses other signals (collections, tags, etc.) which are often good
    if (!sourceProductType) {
      console.log('Source product has no type, accepting Shopify recommendations (trust algorithm)');
      return true;
    }

    // Check if at least 70% of recommendations match the source product type
    // This ensures better quality recommendations
    const matchingProducts = recommendedProducts.filter(p => {
      const recType = p.productType?.trim().toUpperCase() || '';
      return recType === sourceProductType;
    });

    const matchPercentage = (matchingProducts.length / recommendedProducts.length) * 100;
    console.log(`Recommendation relevance: ${matchPercentage.toFixed(0)}% match (${matchingProducts.length}/${recommendedProducts.length} products)`);

    // Require 70% match instead of 50% for better quality
    return matchPercentage >= 70;
  } catch (error) {
    console.error('Error validating recommendations:', error);
    return true; // Assume valid on error
  }
}

/**
 * Get smart recommendations based on product attributes
 * Uses product type, tags, and collection matching
 */
async function getSmartRecommendations(
  context: RecommendationContext,
  shopifyProductId: string,
  limit: number
): Promise<any[]> {
  try {
    // Get source product details
    const sourceQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          productType
          tags
          vendor
          collections(first: 3) {
            edges {
              node {
                id
                handle
              }
            }
          }
        }
      }
    `;

    const gid = `gid://shopify/Product/${shopifyProductId}`;
    const response: any = await context.storefrontClient.query(sourceQuery, { id: gid });

    if (!response.data?.product) {
      console.log('Could not fetch source product for smart recommendations');
      return await getRandomProducts(context, limit);
    }

    const sourceProduct = response.data.product;
    const productType = sourceProduct.productType?.trim() || '';
    const tags = sourceProduct.tags || [];
    const vendor = sourceProduct.vendor || '';

    console.log(`Smart recommendations for: Type="${productType}", Tags=[${tags.join(', ')}], Vendor="${vendor}", Collections=${sourceProduct.collections?.edges?.length || 0}`);

    // Strategy 1: Match by product type (highest priority when available)
    if (productType) {
      const typeMatches = await findProductsByType(context, productType, shopifyProductId, limit);
      if (typeMatches.length >= Math.min(3, limit)) {
        console.log(`✅ Using type matching: found ${typeMatches.length} products`);
        return typeMatches;
      }
      console.log(`⚠️ Type matching found only ${typeMatches.length} products, trying other strategies`);
    }

    // Strategy 2: Collection-based matching (most reliable for products without type)
    if (sourceProduct.collections?.edges?.length > 0) {
      const collectionId = sourceProduct.collections.edges[0].node.id;
      const collectionHandle = sourceProduct.collections.edges[0].node.handle;
      console.log(`Trying collection matching: ${collectionHandle}`);
      const collectionMatches = await findProductsByCollection(context, collectionId, shopifyProductId, limit);
      if (collectionMatches.length >= Math.min(3, limit)) {
        console.log(`✅ Using collection matching: found ${collectionMatches.length} products`);
        return collectionMatches;
      }
      console.log(`⚠️ Collection matching found only ${collectionMatches.length} products`);
    }

    // Strategy 3: Match by tags
    if (tags.length > 0) {
      const tagMatches = await findProductsByTags(context, tags, shopifyProductId, limit);
      if (tagMatches.length >= Math.min(3, limit)) {
        console.log(`✅ Using tag matching: found ${tagMatches.length} products`);
        return tagMatches;
      }
      console.log(`⚠️ Tag matching found only ${tagMatches.length} products`);
    }

    // If we reached here, return whatever we could find
    // Try all strategies and return the best available results
    console.log('⚠️ No strategy found enough products, returning best available');

    // Collect all available products from different strategies
    const allProducts: any[] = [];

    if (productType) {
      const typeMatches = await findProductsByType(context, productType, shopifyProductId, limit * 2);
      allProducts.push(...typeMatches);
    }

    if (sourceProduct.collections?.edges?.length > 0 && allProducts.length < limit) {
      const collectionId = sourceProduct.collections.edges[0].node.id;
      const collectionMatches = await findProductsByCollection(context, collectionId, shopifyProductId, limit);
      allProducts.push(...collectionMatches);
    }

    if (tags.length > 0 && allProducts.length < limit) {
      const tagMatches = await findProductsByTags(context, tags, shopifyProductId, limit);
      allProducts.push(...tagMatches);
    }

    // Remove duplicates based on shopifyProductId
    const uniqueProducts = allProducts.filter((product, index, self) =>
      index === self.findIndex((p) => p.shopifyProductId === product.shopifyProductId)
    );

    const finalProducts = uniqueProducts.slice(0, limit);
    console.log(`Returning ${finalProducts.length} products from combined strategies`);
    return finalProducts;
  } catch (error) {
    console.error('Error in smart recommendations:', error);
    return await getRandomProducts(context, limit);
  }
}

/**
 * Find products by matching product type
 * Adds randomization for variety in recommendations
 */
async function findProductsByType(
  context: RecommendationContext,
  productType: string,
  excludeProductId: string,
  limit: number
): Promise<any[]> {
  try {
    // Fetch more products than needed to allow random selection
    const fetchCount = Math.min(limit * 3, 50);

    const query = `
      query findByType($queryString: String!) {
        products(first: ${fetchCount}, query: $queryString) {
          edges {
            node {
              id
              handle
            }
          }
        }
      }
    `;

    const queryString = `product_type:"${productType}"`;
    const response: any = await context.storefrontClient.query(query, { queryString });

    if (!response.data?.products?.edges) {
      console.log(`No products found for type: ${productType}`);
      return [];
    }

    const excludeGid = `gid://shopify/Product/${excludeProductId}`;
    const allHandles = response.data.products.edges
      .filter((edge: any) => edge.node.id !== excludeGid)
      .map((edge: any) => edge.node.handle);

    // Randomly shuffle for variety
    const shuffled = allHandles.sort(() => Math.random() - 0.5);
    const handles = shuffled.slice(0, limit);

    console.log(`Type matching - Found ${allHandles.length} products, selected ${handles.length} randomly`);
    const products = await fetchProductsByHandles(context, handles, limit);
    console.log(`Type matching - Fetched ${products.length} products`);
    return products;
  } catch (error) {
    console.error('Error finding products by type:', error);
    return [];
  }
}

/**
 * Find products by matching vendor
 * Useful when product type and tags are not available
 */
async function findProductsByVendor(
  context: RecommendationContext,
  vendor: string,
  excludeProductId: string,
  limit: number
): Promise<any[]> {
  try {
    // Fetch more products than needed to allow random selection
    const fetchCount = Math.min(limit * 3, 50);

    const query = `
      query findByVendor($queryString: String!) {
        products(first: ${fetchCount}, query: $queryString) {
          edges {
            node {
              id
              handle
            }
          }
        }
      }
    `;

    const queryString = `vendor:"${vendor}"`;
    const response: any = await context.storefrontClient.query(query, { queryString });

    if (!response.data?.products?.edges) {
      console.log(`No products found for vendor: ${vendor}`);
      return [];
    }

    const excludeGid = `gid://shopify/Product/${excludeProductId}`;
    const allHandles = response.data.products.edges
      .filter((edge: any) => edge.node.id !== excludeGid)
      .map((edge: any) => edge.node.handle);

    // Randomly shuffle for variety
    const shuffled = allHandles.sort(() => Math.random() - 0.5);
    const handles = shuffled.slice(0, limit);

    console.log(`Vendor matching - Found ${allHandles.length} products, selected ${handles.length} randomly`);
    const products = await fetchProductsByHandles(context, handles, limit);
    console.log(`Vendor matching - Fetched ${products.length} products`);
    return products;
  } catch (error) {
    console.error('Error finding products by vendor:', error);
    return [];
  }
}

/**
 * Find products by matching tags
 */
async function findProductsByTags(
  context: RecommendationContext,
  tags: string[],
  excludeProductId: string,
  limit: number
): Promise<any[]> {
  try {
    // Use first 3 tags for matching
    const searchTags = tags.slice(0, 3);
    const query = `
      query findByTags($queryString: String!) {
        products(first: ${limit + 5}, query: $queryString) {
          edges {
            node {
              id
              handle
            }
          }
        }
      }
    `;

    const queryString = searchTags.map(tag => `tag:"${tag}"`).join(' OR ');
    const response: any = await context.storefrontClient.query(query, { queryString });

    if (!response.data?.products?.edges) {
      return [];
    }

    const excludeGid = `gid://shopify/Product/${excludeProductId}`;
    const handles = response.data.products.edges
      .filter((edge: any) => edge.node.id !== excludeGid)
      .map((edge: any) => edge.node.handle)
      .slice(0, limit);

    return await fetchProductsByHandles(context, handles, limit);
  } catch (error) {
    console.error('Error finding products by tags:', error);
    return [];
  }
}

/**
 * Find products from the same collection
 */
async function findProductsByCollection(
  context: RecommendationContext,
  collectionId: string,
  excludeProductId: string,
  limit: number
): Promise<any[]> {
  try {
    const query = `
      query getCollection($id: ID!) {
        collection(id: $id) {
          products(first: ${limit + 5}) {
            edges {
              node {
                id
                handle
              }
            }
          }
        }
      }
    `;

    const response: any = await context.storefrontClient.query(query, { id: collectionId });

    if (!response.data?.collection?.products?.edges) {
      return [];
    }

    const excludeGid = `gid://shopify/Product/${excludeProductId}`;
    const handles = response.data.collection.products.edges
      .filter((edge: any) => edge.node.id !== excludeGid)
      .map((edge: any) => edge.node.handle)
      .slice(0, limit);

    return await fetchProductsByHandles(context, handles, limit);
  } catch (error) {
    console.error('Error finding products by collection:', error);
    return [];
  }
}

/**
 * Get collection-based recommendations as fallback
 * Fetches products from the same collection as the given product
 * @deprecated Use getSmartRecommendations instead
 */
async function getCollectionBasedRecommendations(
  context: RecommendationContext,
  shopifyProductId: string,
  limit: number
): Promise<any[]> {
  try {
    // First, get the product to find its collections
    const productQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          collections(first: 3) {
            edges {
              node {
                id
                handle
                products(first: ${limit + 5}) {
                  edges {
                    node {
                      id
                      handle
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const gid = `gid://shopify/Product/${shopifyProductId}`;
    const response: any = await context.storefrontClient.query(productQuery, { id: gid });

    console.log(`Collection fallback for ${shopifyProductId}: product found = ${!!response.data?.product}`);
    console.log(`Collections count: ${response.data?.product?.collections?.edges?.length || 0}`);

    if (!response.data?.product?.collections?.edges?.length) {
      console.log(`Product ${shopifyProductId} has no collections, returning random products`);
      return await getRandomProducts(context, limit);
    }

    // Get products from the first collection, excluding the source product
    const collection = response.data.product.collections.edges[0].node;
    console.log(`Using collection: ${collection.handle}, products in collection: ${collection.products.edges.length}`);

    const productHandles = collection.products.edges
      .filter((edge: any) => edge.node.id !== gid) // Exclude source product
      .map((edge: any) => edge.node.handle)
      .slice(0, limit);

    console.log(`Product handles to fetch: ${productHandles.length}`);

    if (productHandles.length === 0) {
      console.log('No product handles after filtering, returning random products');
      return await getRandomProducts(context, limit);
    }

    // Fetch full product data
    console.log(`Fetching full product data for handles: ${productHandles.join(', ')}`);
    return await fetchProductsByHandles(context, productHandles, limit);
  } catch (error) {
    console.error('Error in collection-based recommendations:', error);
    return await getRandomProducts(context, limit);
  }
}

/**
 * Get random products as last resort fallback
 * Fetches more products than needed and randomly selects to add variety
 */
async function getRandomProducts(context: RecommendationContext, limit: number): Promise<any[]> {
  try {
    // Fetch more products to allow for random selection
    const fetchCount = Math.min(limit * 3, 50);

    const query = `
      query getRandomProducts {
        products(first: ${fetchCount}, sortKey: UPDATED_AT, reverse: true) {
          edges {
            node {
              id
              handle
            }
          }
        }
      }
    `;

    const response: any = await context.storefrontClient.query(query, {});

    if (!response.data?.products?.edges) {
      return [];
    }

    const allHandles = response.data.products.edges.map((edge: any) => edge.node.handle);

    // Randomly shuffle and select products for variety
    const shuffled = allHandles.sort(() => Math.random() - 0.5);
    const selectedHandles = shuffled.slice(0, limit);

    return await fetchProductsByHandles(context, selectedHandles, limit);
  } catch (error) {
    console.error('Error fetching random products:', error);
    return [];
  }
}

/**
 * Fetch products from Shopify Storefront API by handles
 * @param handles - Array of product handles
 * @param limit - Maximum number of products to return
 */
async function fetchProductsByHandles(
  context: RecommendationContext,
  handles: string[],
  limit: number
): Promise<any[]> {
  try {
    if (handles.length === 0) {
      return [];
    }

    // Build GraphQL query to fetch products by handle
    const query = `
      query getProductsByHandles($queryString: String!) {
        products(first: ${Math.min(handles.length, limit)}, query: $queryString) {
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

    const response: any = await context.storefrontClient.query(query, { queryString: handleQuery });

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
