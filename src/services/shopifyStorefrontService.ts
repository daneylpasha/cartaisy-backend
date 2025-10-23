import axios, { AxiosInstance } from 'axios';
import {
  ShopifyCollectionByIdResponse,
  ShopifyProductsQueryResponse,
  ShopifyCollectionsQueryResponse,
} from '../types/shopify/storefront';
import {
  ShopifyPredictiveSearchResponse,
  ShopifySearchProductsResponse,
  SearchSortKey,
} from '../types/api/search';

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
   * Get collection products with pagination, filtering, and sorting
   */
  async getCollectionProducts(
    collectionId: string,
    options: {
      limit?: number;
      cursor?: string;
      sortKey?: string;
      reverse?: boolean;
      filters?: any[];
    } = {}
  ): Promise<any> {
    const { limit = 20, cursor, sortKey = 'COLLECTION_DEFAULT', reverse = false, filters = [] } = options;

    const query = `
      query getCollectionProducts($id: ID!, $limit: Int!, $cursor: String, $sortKey: ProductCollectionSortKeys, $reverse: Boolean, $filters: [ProductFilter!]) {
        collection(id: $id) {
          id
          title
          description
          handle
          products(first: $limit, after: $cursor, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
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
                      selectedOptions {
                        name
                        value
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              endCursor
              startCursor
            }
          }
        }
      }
    `;

    // Ensure the collection ID has the correct Shopify GID format
    const collectionIdStr = String(collectionId);
    const formattedId = collectionIdStr.startsWith('gid://')
      ? collectionIdStr
      : `gid://shopify/Collection/${collectionIdStr}`;

    return this.query<any>(query, {
      id: formattedId,
      limit,
      cursor: cursor || null,
      sortKey,
      reverse,
      filters: filters.length > 0 ? filters : null,
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
   * Get metaobject by ID using Admin API
   */
  async getMetaobject(metaobjectId: string): Promise<any> {
    const query = `
      query getMetaobject($id: ID!) {
        metaobject(id: $id) {
          id
          type
          displayName
          fields {
            key
            value
          }
        }
      }
    `;

    return this.queryAdmin<any>(query, { id: metaobjectId });
  }

  /**
   * Get product metafields using Admin API
   * Fetches all metafields and resolves metaobject references
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

    const response = await this.queryAdmin<any>(query, { id: formattedId });

    // Resolve metaobject references
    if (response?.data?.product?.metafields?.edges) {
      const metafields = response.data.product.metafields.edges;

      for (const edge of metafields) {
        const metafield = edge.node;

        // Check if this is a metaobject reference type
        if (metafield.type?.includes('metaobject_reference') && metafield.value) {
          try {
            const parsedValue = JSON.parse(metafield.value);
            const metaobjectIds = Array.isArray(parsedValue) ? parsedValue : [parsedValue];

            // Fetch metaobjects in parallel
            const metaobjectPromises = metaobjectIds.map((id: string) =>
              this.getMetaobject(id).catch((err: Error): null => {
                console.error(`Failed to fetch metaobject ${id}:`, err.message);
                return null;
              })
            );

            const metaobjects = await Promise.all(metaobjectPromises);

            // Store resolved metaobjects in the edge for the controller to use
            edge.node.resolvedMetaobjects = metaobjects
              .filter((mo) => mo?.data?.metaobject)
              .map((mo) => mo.data.metaobject);
          } catch (e) {
            // Failed to parse or fetch metaobjects, skip
          }
        }
      }
    }

    return response;
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
   * Associate cart with customer (when user logs in)
   * @param cartId Cart ID
   * @param customerAccessToken Shopify customer access token
   */
  async associateCartWithCustomer(cartId: string, customerAccessToken: string): Promise<any> {
    const query = `
      mutation cartBuyerIdentityUpdate($cartId: ID!, $buyerIdentity: CartBuyerIdentityInput!) {
        cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: $buyerIdentity) {
          cart {
            id
            buyerIdentity {
              email
              phone
              customer {
                id
                email
                firstName
                lastName
              }
            }
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

    return this.query<any>(query, {
      cartId,
      buyerIdentity: {
        customerAccessToken,
      },
    });
  }

  /**
   * Predictive Search - for autocomplete/suggestions
   * @param query - Search query string
   * @param limit - Number of results per type (default: 10)
   * @returns Shopify predictive search response with products and collections
   */
  async predictiveSearch(query: string, limit: number = 10): Promise<ShopifyPredictiveSearchResponse> {
    const graphqlQuery = `
      query PredictiveSearch($query: String!, $limit: Int!) {
        predictiveSearch(
          query: $query
          limit: $limit
          limitScope: EACH
          types: [PRODUCT, COLLECTION]
        ) {
          products {
            id
            title
            handle
            vendor
            productType
            tags
            featuredImage {
              url
              altText
            }
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
          }
          collections {
            id
            title
            handle
            image {
              url
              altText
            }
          }
        }
      }
    `;

    return this.query<ShopifyPredictiveSearchResponse>(graphqlQuery, { query, limit });
  }

  /**
   * Full Product Search - for search results page
   * Per Shopify docs: https://shopify.dev/docs/api/storefront/latest/queries/products
   * @param query - Search query string (supports Shopify search syntax)
   * @param options - Pagination and sorting options
   * @returns Paginated product search results
   */
  async searchProducts(
    query: string,
    options: {
      limit?: number;
      cursor?: string;
      sortKey?: SearchSortKey;
      reverse?: boolean;
    } = {}
  ): Promise<ShopifySearchProductsResponse> {
    const { limit = 20, cursor, sortKey = 'RELEVANCE', reverse = false } = options;

    const graphqlQuery = `
      query SearchProducts($query: String!, $limit: Int!, $cursor: String, $sortKey: ProductSortKeys!, $reverse: Boolean!) {
        products(first: $limit, after: $cursor, query: $query, sortKey: $sortKey, reverse: $reverse) {
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
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            endCursor
            startCursor
          }
        }
      }
    `;

    return this.query<ShopifySearchProductsResponse>(graphqlQuery, {
      query,
      limit,
      cursor,
      sortKey,
      reverse,
    });
  }

  /**
   * Update cart delivery address to get shipping rates
   * Uses Shopify 2025-01 API (cartDeliveryAddressesAdd)
   * @param cartId - Shopify cart ID
   * @param deliveryAddress - Shipping address to calculate rates for
   * @returns Cart with available delivery options
   */
  async updateCartBuyerIdentity(
    cartId: string,
    deliveryAddress: {
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    }
  ): Promise<any> {
    // Use cartDeliveryAddressesAdd mutation (2025-01 API)
    const addAddressQuery = `
      mutation cartDeliveryAddressesAdd($cartId: ID!, $addresses: [CartDeliveryAddressInput!]!) {
        cartDeliveryAddressesAdd(cartId: $cartId, addresses: $addresses) {
          cart {
            id
            deliveryGroups(first: 10) {
              edges {
                node {
                  id
                  deliveryAddress {
                    ... on MailingAddress {
                      id
                      address1
                      address2
                      city
                      province
                      country
                      zip
                      firstName
                      lastName
                      phone
                    }
                  }
                  deliveryOptions {
                    handle
                    title
                    description
                    estimatedCost {
                      amount
                      currencyCode
                    }
                    deliveryMethodType
                  }
                  selectedDeliveryOption {
                    handle
                    title
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
              totalTaxAmount {
                amount
                currencyCode
              }
              totalDutyAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    return this.query<any>(addAddressQuery, {
      cartId,
      addresses: [
        {
          deliveryAddress: {
            address1: deliveryAddress.address1,
            address2: deliveryAddress.address2 || undefined,
            city: deliveryAddress.city,
            provinceCode: deliveryAddress.province,
            countryCode: deliveryAddress.country,
            zip: deliveryAddress.zip,
            firstName: deliveryAddress.firstName || undefined,
            lastName: deliveryAddress.lastName || undefined,
            phone: deliveryAddress.phone || undefined,
          },
        },
      ],
    });
  }

  /**
   * Apply discount codes to cart
   * Shopify supports stackable discount codes as of 2025-01 API
   * @param cartId - Shopify cart ID
   * @param discountCodes - Array of discount codes to apply
   * @returns Cart with applied discounts
   */
  async applyDiscountCodes(cartId: string, discountCodes: string[]): Promise<any> {
    const query = `
      mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
        cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
          cart {
            id
            discountCodes {
              code
              applicable
            }
            discountAllocations {
              discountedAmount {
                amount
                currencyCode
              }
              ... on CartAutomaticDiscountAllocation {
                title
              }
              ... on CartCodeDiscountAllocation {
                code
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
              totalTaxAmount {
                amount
                currencyCode
              }
              totalDutyAmount {
                amount
                currencyCode
              }
            }
            lines(first: 100) {
              edges {
                node {
                  id
                  quantity
                  estimatedCost {
                    totalAmount {
                      amount
                      currencyCode
                    }
                  }
                  discountAllocations {
                    discountedAmount {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;

    return this.query<any>(query, { cartId, discountCodes });
  }

  /**
   * Create a draft order using Shopify Admin API
   * Draft orders are recommended for custom checkout flows with external payments
   * Reference: https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderCreate
   * @param orderInput - Order details including line items, addresses, and shipping
   * @returns Created draft order with ID
   */
  async createDraftOrder(orderInput: {
    email: string;
    lineItems: Array<{
      variantId: string;
      quantity: number;
    }>;
    shippingAddress: {
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    billingAddress?: {
      address1: string;
      address2?: string;
      city: string;
      province: string;
      country: string;
      zip: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    shippingLine?: {
      title: string;
      price: string | number;
      shippingRateHandle?: string;
    };
    customerId?: string;
    note?: string;
    tags?: string[];
    metafields?: Array<{
      namespace: string;
      key: string;
      value: string;
      type: string;
    }>;
  }): Promise<any> {
    const query = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            status
            email
            subtotalPrice
            totalPrice
            totalTax
            totalShippingPrice
            currencyCode
            invoiceUrl
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  quantity
                  originalUnitPrice
                  discountedUnitPrice
                  variant {
                    id
                    title
                  }
                }
              }
            }
            shippingAddress {
              address1
              address2
              city
              province
              country
              zip
              phone
            }
            billingAddress {
              address1
              address2
              city
              province
              country
              zip
              phone
            }
            createdAt
            updatedAt
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Use billing address = shipping address if not provided (common pattern)
    const billingAddress = orderInput.billingAddress || orderInput.shippingAddress;

    const input: any = {
      email: orderInput.email,
      lineItems: orderInput.lineItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      shippingAddress: {
        address1: orderInput.shippingAddress.address1,
        address2: orderInput.shippingAddress.address2 || '',
        city: orderInput.shippingAddress.city,
        provinceCode: orderInput.shippingAddress.province,
        countryCode: orderInput.shippingAddress.country,
        zip: orderInput.shippingAddress.zip,
        firstName: orderInput.shippingAddress.firstName || '',
        lastName: orderInput.shippingAddress.lastName || '',
        phone: orderInput.shippingAddress.phone || '',
      },
      billingAddress: {
        address1: billingAddress.address1,
        address2: billingAddress.address2 || '',
        city: billingAddress.city,
        provinceCode: billingAddress.province,
        countryCode: billingAddress.country,
        zip: billingAddress.zip,
        firstName: billingAddress.firstName || '',
        lastName: billingAddress.lastName || '',
        phone: billingAddress.phone || '',
      },
    };

    // Add shipping line if provided
    if (orderInput.shippingLine) {
      input.shippingLine = {
        title: orderInput.shippingLine.title,
        price: String(orderInput.shippingLine.price),
        shippingRateHandle: orderInput.shippingLine.shippingRateHandle || null,
      };
    }

    // Add customer ID if provided (links order to existing customer)
    if (orderInput.customerId) {
      input.customerId = orderInput.customerId;
    }

    // Add note if provided
    if (orderInput.note) {
      input.note = orderInput.note;
    }

    // Add tags if provided (useful for filtering/reporting)
    if (orderInput.tags && orderInput.tags.length > 0) {
      input.tags = orderInput.tags;
    }

    // Add metafields if provided (custom data storage)
    if (orderInput.metafields && orderInput.metafields.length > 0) {
      input.metafields = orderInput.metafields;
    }

    return this.queryAdmin<any>(query, { input });
  }

  /**
   * Complete a draft order and convert it to an actual order
   * Important: Set paymentPending=false when payment is already processed externally (Stripe)
   * Reference: https://shopify.dev/docs/api/admin-graphql/latest/mutations/draftOrderComplete
   * @param draftOrderId - Shopify draft order ID (format: gid://shopify/DraftOrder/12345)
   * @param paymentPending - Set to false if payment already processed, true if pending
   * @returns Completed order details
   */
  async completeDraftOrder(draftOrderId: string, paymentPending: boolean = false): Promise<any> {
    const query = `
      mutation draftOrderComplete($id: ID!, $paymentPending: Boolean) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          draftOrder {
            id
            status
            order {
              id
              name
              email
              confirmationNumber
              confirmed
              totalPrice
              subtotalPrice
              totalTax
              totalShippingPrice
              currencyCode
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              updatedAt
              lineItems(first: 100) {
                edges {
                  node {
                    id
                    title
                    quantity
                    variant {
                      id
                      title
                    }
                  }
                }
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

    return this.queryAdmin<any>(query, { id: draftOrderId, paymentPending });
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
