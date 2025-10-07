import axios, { AxiosInstance } from 'axios';
import {
  ShopifyCollectionByIdResponse,
  ShopifyProductsQueryResponse,
  ShopifyCollectionsQueryResponse,
} from '../types/shopify/storefront';

/**
 * Shopify Storefront API Service
 * Handles all GraphQL queries to Shopify Storefront API
 */
class ShopifyStorefrontService {
  private client: AxiosInstance;
  private adminClient: AxiosInstance;
  private storefrontToken: string;
  private adminToken: string;
  private shopDomain: string;
  private storeUrl: string;
  private apiVersion: string;

  constructor() {
    this.shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || '';
    this.storefrontToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '';
    this.adminToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
    this.storeUrl = process.env.SHOPIFY_STORE_URL || '';
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2025-01';

    if (!this.shopDomain || !this.storefrontToken) {
      console.warn(
        '⚠️ Shopify Storefront API credentials not configured. Shopify features will be disabled.',
        'Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env'
      );
      this.client = null as any;
    } else {
      this.client = axios.create({
        baseURL: `https://${this.shopDomain}/api/${this.apiVersion}/graphql.json`,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': this.storefrontToken,
        },
        timeout: 5000, // Reduced from 10s to 5s for better UX
      });
    }

    // Initialize Admin API client
    if (!this.storeUrl || !this.adminToken) {
      console.warn(
        '⚠️ Shopify Admin API credentials not configured. Metafields will not be available.',
        'Set SHOPIFY_STORE_URL and SHOPIFY_ADMIN_ACCESS_TOKEN in .env'
      );
      this.adminClient = null as any;
    } else {
      this.adminClient = axios.create({
        baseURL: `${this.storeUrl}/admin/api/${this.apiVersion}/graphql.json`,
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': this.adminToken,
        },
        timeout: 5000,
      });
    }
  }

  /**
   * Execute a GraphQL query against Shopify Storefront API
   */
  private async query<T>(graphqlQuery: string, variables: any = {}): Promise<T> {
    if (!this.client) {
      throw new Error('Shopify Storefront API not configured. Check environment variables.');
    }

    try {
      const response = await this.client.post('', {
        query: graphqlQuery,
        variables,
      });

      if (response.data.errors) {
        console.error('Shopify GraphQL errors:', response.data.errors);
        throw new Error(`Shopify API error: ${response.data.errors[0]?.message || 'Unknown error'}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('Shopify API request failed:', error.message);
      throw new Error(`Failed to fetch data from Shopify: ${error.message}`);
    }
  }

  /**
   * Get a collection by its ID with products
   */
  async getCollectionById(collectionId: string, productsLimit: number = 20): Promise<ShopifyCollectionByIdResponse> {
    const query = `
      query getCollectionById($id: ID!, $productsLimit: Int!) {
        collection(id: $id) {
          id
          title
          description
          handle
          image {
            url
            altText
          }
          products(first: $productsLimit) {
            edges {
              node {
                id
                title
                description
                handle
                vendor
                productType
                tags
                availableForSale
                totalInventory
                priceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                  maxVariantPrice {
                    amount
                    currencyCode
                  }
                }
                compareAtPriceRange {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
                images(first: 5) {
                  edges {
                    node {
                      url
                      altText
                    }
                  }
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      availableForSale
                      quantityAvailable
                      sku
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
          }
          updatedAt
        }
      }
    `;

    // Ensure the collection ID has the correct Shopify GID format
    const collectionIdStr = String(collectionId);
    const formattedId = collectionIdStr.startsWith('gid://')
      ? collectionIdStr
      : `gid://shopify/Collection/${collectionIdStr}`;

    return this.query<ShopifyCollectionByIdResponse>(query, {
      id: formattedId,
      productsLimit,
    });
  }

  /**
   * Get products with optional filtering
   */
  async getProducts(
    limit: number = 20,
    query?: string,
    sortKey?: string
  ): Promise<ShopifyProductsQueryResponse> {
    const graphqlQuery = `
      query getProducts($limit: Int!, $query: String, $sortKey: ProductSortKeys) {
        products(first: $limit, query: $query, sortKey: $sortKey) {
          edges {
            node {
              id
              title
              description
              handle
              vendor
              productType
              tags
              availableForSale
              totalInventory
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              compareAtPriceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              images(first: 3) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 5) {
                edges {
                  node {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                    availableForSale
                    quantityAvailable
                  }
                }
              }
              createdAt
              updatedAt
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
        }
      }
    `;

    return this.query<ShopifyProductsQueryResponse>(graphqlQuery, {
      limit,
      query,
      sortKey,
    });
  }

  /**
   * Get all collections
   */
  async getCollections(limit: number = 20): Promise<ShopifyCollectionsQueryResponse> {
    const query = `
      query getCollections($limit: Int!) {
        collections(first: $limit) {
          edges {
            node {
              id
              title
              description
              handle
              image {
                url
                altText
              }
              updatedAt
            }
          }
        }
      }
    `;

    return this.query<ShopifyCollectionsQueryResponse>(query, { limit });
  }

  /**
   * Get a single product by ID with full details including variants
   * Note: Metafields are fetched separately via Admin API
   */
  async getProductById(productId: string): Promise<any> {
    // Format ID to Shopify GID format if needed
    const formattedId = productId.startsWith('gid://shopify/Product/')
      ? productId
      : `gid://shopify/Product/${productId}`;

    const query = `
      query getProductById($id: ID!) {
        product(id: $id) {
          id
          title
          description
          descriptionHtml
          handle
          vendor
          productType
          tags
          availableForSale
          totalInventory
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          compareAtPriceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                compareAtPrice {
                  amount
                  currencyCode
                }
                availableForSale
                quantityAvailable
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    `;

    return this.query<any>(query, { id: formattedId });
  }

  /**
   * Execute a GraphQL query against Shopify Admin API
   */
  private async queryAdmin<T>(graphqlQuery: string, variables: any = {}): Promise<T> {
    if (!this.adminClient) {
      throw new Error('Shopify Admin API not configured. Check environment variables.');
    }

    try {
      const response = await this.adminClient.post('', {
        query: graphqlQuery,
        variables,
      });

      if (response.data.errors) {
        console.error('Shopify Admin GraphQL errors:', response.data.errors);
        throw new Error(`Shopify Admin API error: ${response.data.errors[0]?.message || 'Unknown error'}`);
      }

      return response.data;
    } catch (error: any) {
      console.error('Shopify Admin API request failed:', error.message);
      throw new Error(`Failed to fetch data from Shopify Admin API: ${error.message}`);
    }
  }

  /**
   * Get product metafields using Admin API
   * Fetches all metafields (will be filtered in controller if needed)
   */
  async getProductMetafields(productId: string): Promise<any> {
    // Format ID to Shopify GID format if needed
    const formattedId = productId.startsWith('gid://shopify/Product/')
      ? productId
      : `gid://shopify/Product/${productId}`;

    const query = `
      query getProductMetafields($id: ID!) {
        product(id: $id) {
          metafields(first: 100) {
            edges {
              node {
                namespace
                key
                value
                type
                description
              }
            }
          }
        }
      }
    `;

    return this.queryAdmin<any>(query, { id: formattedId });
  }

  /**
   * Create a new cart with optional items
   */
  async createCart(items?: Array<{ merchandiseId: string; quantity: number }>): Promise<any> {
    const query = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                      compareAtPriceV2 {
                        amount
                        currencyCode
                      }
                      quantityAvailable
                      image {
                        url
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input: any = {};
    if (items && items.length > 0) {
      input.lines = items.map((item) => ({
        merchandiseId: item.merchandiseId,
        quantity: item.quantity,
      }));
    }

    return this.query<any>(query, { input });
  }

  /**
   * Get cart by ID
   */
  async getCart(cartId: string): Promise<any> {
    const query = `
      query getCart($cartId: ID!) {
        cart(id: $cartId) {
          id
          lines(first: 100) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    priceV2 {
                      amount
                      currencyCode
                    }
                    compareAtPriceV2 {
                      amount
                      currencyCode
                    }
                    quantityAvailable
                    image {
                      url
                    }
                    product {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
          estimatedCost {
            totalAmount {
              amount
              currencyCode
            }
            subtotalAmount {
              amount
              currencyCode
            }
          }
        }
      }
    `;

    return this.query<any>(query, { cartId });
  }

  /**
   * Add items to cart
   */
  async addCartLines(
    cartId: string,
    lines: Array<{ merchandiseId: string; quantity: number }>
  ): Promise<any> {
    const query = `
      mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart {
            id
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                      compareAtPriceV2 {
                        amount
                        currencyCode
                      }
                      quantityAvailable
                      image {
                        url
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return this.query<any>(query, { cartId, lines });
  }

  /**
   * Update cart line quantity
   */
  async updateCartLines(
    cartId: string,
    lines: Array<{ id: string; quantity: number }>
  ): Promise<any> {
    const query = `
      mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
        cartLinesUpdate(cartId: $cartId, lines: $lines) {
          cart {
            id
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                      compareAtPriceV2 {
                        amount
                        currencyCode
                      }
                      quantityAvailable
                      image {
                        url
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return this.query<any>(query, { cartId, lines });
  }

  /**
   * Remove lines from cart
   */
  async removeCartLines(cartId: string, lineIds: string[]): Promise<any> {
    const query = `
      mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
        cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
          cart {
            id
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      priceV2 {
                        amount
                        currencyCode
                      }
                      compareAtPriceV2 {
                        amount
                        currencyCode
                      }
                      quantityAvailable
                      image {
                        url
                      }
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
            estimatedCost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    return this.query<any>(query, { cartId, lineIds });
  }

  /**
   * Check if service is properly configured
   */
  isConfigured(): boolean {
    return !!(this.shopDomain && this.storefrontToken);
  }

  /**
   * Check if Admin API is configured
   */
  isAdminConfigured(): boolean {
    return !!(this.storeUrl && this.adminToken);
  }
}

export default new ShopifyStorefrontService();
