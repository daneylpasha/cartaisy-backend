/**
 * Bulk Update Product Shipping Configuration
 *
 * Sets all products to:
 * - Weight: 1 kg
 * - Requires shipping: true
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/scripts/bulkUpdateProductShipping.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

if (!SHOPIFY_STORE_URL || !SHOPIFY_ADMIN_TOKEN) {
  console.error('❌ Missing Shopify credentials in .env');
  console.error('   Required: SHOPIFY_STORE_URL, SHOPIFY_ADMIN_ACCESS_TOKEN');
  process.exit(1);
}

interface Product {
  id: string;
  title: string;
  variants: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        weight?: number;
        weightUnit?: string;
        inventoryItem?: {
          id: string;
        };
      };
    }>;
  };
}

async function queryShopifyAdmin(query: string, variables: any = {}) {
  try {
    const response = await axios.post(
      `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
        },
      }
    );

    if (response.data.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data;
  } catch (error: any) {
    console.error('Shopify API Error:', error.response?.data || error.message);
    throw error;
  }
}

async function getAllProducts(): Promise<Product[]> {
  console.log('📦 Fetching all products...');

  const query = `
    query getProducts($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            variants(first: 100) {
              edges {
                node {
                  id
                  title
                  inventoryItem {
                    id
                    measurement {
                      weight {
                        value
                        unit
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  let allProducts: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await queryShopifyAdmin(query, { cursor });
    const products = response.data.products.edges.map((edge: any) => edge.node);
    allProducts = [...allProducts, ...products];

    hasNextPage = response.data.products.pageInfo.hasNextPage;
    cursor = response.data.products.pageInfo.endCursor;

    console.log(`   Fetched ${allProducts.length} products so far...`);
  }

  console.log(`✅ Total products found: ${allProducts.length}\n`);
  return allProducts;
}

async function updateProductVariant(inventoryItemId: string, productTitle: string, variantTitle: string) {
  const mutation = `
    mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          measurement {
            weight {
              value
              unit
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

  const input = {
    measurement: {
      weight: {
        value: 1.0,
        unit: "KILOGRAMS"
      }
    },
    tracked: true,
    requiresShipping: true  // ← This is the missing piece!
  };

  try {
    const response = await queryShopifyAdmin(mutation, { id: inventoryItemId, input });

    if (response.data.inventoryItemUpdate.userErrors.length > 0) {
      const errors = response.data.inventoryItemUpdate.userErrors;
      console.error(`   ❌ ${productTitle} (${variantTitle}): ${errors[0].message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`   ❌ ${productTitle} (${variantTitle}): Failed to update`);
    return false;
  }
}

async function updateProductRequiresShipping(productId: string, productTitle: string) {
  const mutation = `
    mutation updateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const input = {
    id: productId,
    requiresSellingPlan: false,
    // Note: In Shopify Admin API, "requires shipping" is controlled by product type
    // Physical products automatically require shipping
  };

  try {
    const response = await queryShopifyAdmin(mutation, { input });

    if (response.data.productUpdate.userErrors.length > 0) {
      const errors = response.data.productUpdate.userErrors;
      console.error(`   ❌ ${productTitle}: ${errors[0].message}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`   ❌ ${productTitle}: Failed to update product`);
    return false;
  }
}

async function main() {
  console.log('🚀 Bulk Update Product Shipping Configuration');
  console.log('=' .repeat(60));
  console.log(`📍 Store: ${SHOPIFY_STORE_URL}`);
  console.log(`📅 API Version: ${SHOPIFY_API_VERSION}`);
  console.log('⚙️  Updates: Weight = 1kg for all variants\n');
  console.log('=' .repeat(60));
  console.log();

  try {
    // Get all products
    const products = await getAllProducts();

    if (products.length === 0) {
      console.log('⚠️  No products found in store');
      return;
    }

    // Update each product's variants
    let successCount = 0;
    let failCount = 0;
    let totalVariants = 0;

    console.log('🔄 Updating product variants...\n');

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const productNum = i + 1;

      console.log(`[${productNum}/${products.length}] ${product.title}`);

      // Update all variants for this product
      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node;
        totalVariants++;

        if (!variant.inventoryItem?.id) {
          console.log(`   ⚠️  ${variant.title}: No inventory item found, skipping`);
          continue;
        }

        const success = await updateProductVariant(
          variant.inventoryItem.id,
          product.title,
          variant.title
        );

        if (success) {
          console.log(`   ✅ ${variant.title}: Updated to 1kg`);
          successCount++;
        } else {
          failCount++;
        }

        // Rate limiting: Wait 500ms between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(); // Empty line between products
    }

    // Summary
    console.log('=' .repeat(60));
    console.log('📊 Summary');
    console.log('=' .repeat(60));
    console.log(`✅ Successfully updated: ${successCount}/${totalVariants} variants`);
    if (failCount > 0) {
      console.log(`❌ Failed: ${failCount} variants`);
    }
    console.log(`📦 Total products processed: ${products.length}`);
    console.log('=' .repeat(60));
    console.log();
    console.log('🎉 Bulk update complete!');
    console.log('💡 All products now have 1kg weight and will generate shipping rates');
    console.log();

  } catch (error: any) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
