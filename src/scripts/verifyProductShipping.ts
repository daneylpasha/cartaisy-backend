/**
 * Verify Product Shipping Configuration
 *
 * Checks a single product to see if weight and requiresShipping are properly set
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

async function queryShopifyAdmin(query: string) {
  const response = await axios.post(
    `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    { query },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
      },
    }
  );
  return response.data;
}

async function main() {
  console.log('🔍 Verifying product shipping configuration...\n');

  const query = `
    query {
      products(first: 1) {
        edges {
          node {
            id
            title
            variants(first: 1) {
              edges {
                node {
                  id
                  title
                  inventoryItem {
                    id
                    tracked
                    requiresShipping
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

  const response = await queryShopifyAdmin(query);
  const product = response.data.products.edges[0]?.node;
  const variant = product?.variants.edges[0]?.node;
  const inventoryItem = variant?.inventoryItem;

  console.log('📦 Product:', product.title);
  console.log('🏷️  Variant:', variant.title);
  console.log('\n📊 Inventory Item Configuration:');
  console.log('   ID:', inventoryItem.id);
  console.log('   Tracked:', inventoryItem.tracked);
  console.log('   Requires Shipping:', inventoryItem.requiresShipping);
  console.log('   Weight:', inventoryItem.measurement?.weight?.value, inventoryItem.measurement?.weight?.unit);

  if (inventoryItem.requiresShipping && inventoryItem.measurement?.weight?.value > 0) {
    console.log('\n✅ Configuration looks correct!');
  } else {
    console.log('\n❌ Configuration issue found:');
    if (!inventoryItem.requiresShipping) {
      console.log('   - requiresShipping is FALSE (should be TRUE)');
    }
    if (!inventoryItem.measurement?.weight?.value || inventoryItem.measurement?.weight?.value === 0) {
      console.log('   - Weight is 0 or missing (should be > 0)');
    }
  }
}

main().catch(console.error);
