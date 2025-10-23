import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || '';
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

// Hard-coded inventory quantities
const TEXAS_INVENTORY = 10;
const KARACHI_INVENTORY = 0; // Remove all inventory from Karachi

// Create axios instance with Shopify credentials
const shopifyAdmin = axios.create({
  baseURL: `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}`,
  headers: {
    'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  },
});

interface ShopifyLocation {
  id: number;
  name: string;
  address1?: string;
  city?: string;
  country?: string;
  active: boolean;
}

interface InventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

interface Product {
  id: number;
  title: string;
  variants: Array<{
    id: number;
    title: string;
    inventory_item_id: number;
    inventory_quantity: number;
  }>;
}

/**
 * Get all locations from Shopify
 */
async function getLocations(): Promise<ShopifyLocation[]> {
  try {
    console.log('📍 Fetching Shopify locations...');
    const response = await shopifyAdmin.get('/locations.json');
    const locations = response.data.locations;

    console.log('\n✅ Found locations:');
    locations.forEach((loc: ShopifyLocation) => {
      console.log(`  - ${loc.name} (ID: ${loc.id})`);
      console.log(`    ${loc.address1 || ''}, ${loc.city || ''}, ${loc.country || ''}`);
      console.log(`    Active: ${loc.active}`);
    });

    return locations;
  } catch (error: any) {
    console.error('❌ Error fetching locations:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get all products with their inventory details
 */
async function getAllProducts(): Promise<Product[]> {
  try {
    console.log('\n📦 Fetching all products...');
    const allProducts: Product[] = [];
    let pageInfo: string | null = null;
    let hasMore = true;
    let pageCount = 1;

    while (hasMore) {
      const params: any = {
        limit: 250,
      };

      if (pageInfo) {
        params.page_info = pageInfo;
      }

      const response = await shopifyAdmin.get('/products.json', { params });

      const products = response.data.products;
      allProducts.push(...products);

      console.log(`  Fetched page ${pageCount}: ${products.length} products`);

      // Check for Link header to get next page
      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        // Extract page_info from Link header
        const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (nextMatch) {
          pageInfo = nextMatch[1];
          pageCount++;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Total products fetched: ${allProducts.length}`);
    return allProducts;
  } catch (error: any) {
    console.error('❌ Error fetching products:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get inventory levels for a specific inventory item across all locations
 */
async function getInventoryLevels(inventoryItemId: number): Promise<InventoryLevel[]> {
  try {
    const response = await shopifyAdmin.get('/inventory_levels.json', {
      params: {
        inventory_item_ids: inventoryItemId,
      },
    });
    return response.data.inventory_levels;
  } catch (error: any) {
    console.error(`❌ Error fetching inventory levels for item ${inventoryItemId}:`, error.response?.data || error.message);
    return [];
  }
}

/**
 * Set inventory at a specific location
 */
async function setInventory(
  inventoryItemId: number,
  locationId: number,
  quantity: number
): Promise<boolean> {
  try {
    await shopifyAdmin.post('/inventory_levels/set.json', {
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available: quantity,
    });

    return true;
  } catch (error: any) {
    console.error(`    ❌ Error setting inventory:`, error.response?.data || error.message);
    return false;
  }
}

/**
 * Split inventory between Karachi and Texas warehouses
 */
async function splitInventoryBetweenWarehouses(
  inventoryItemId: number,
  karachiLocationId: number,
  texasLocationId: number,
  productTitle: string,
  variantTitle: string
): Promise<boolean> {
  try {
    console.log(`    🔄 Removing from Karachi (${KARACHI_INVENTORY}), Adding to Texas (${TEXAS_INVENTORY})...`);

    // Set Karachi inventory to 0 (remove all)
    const karachiSuccess = await setInventory(inventoryItemId, karachiLocationId, KARACHI_INVENTORY);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));

    // Set Texas inventory
    const texasSuccess = await setInventory(inventoryItemId, texasLocationId, TEXAS_INVENTORY);

    if (karachiSuccess && texasSuccess) {
      console.log(`    ✅ Successfully migrated inventory to Texas`);
      return true;
    } else {
      console.log(`    ⚠️  Partial success`);
      return false;
    }
  } catch (error: any) {
    console.error(`    ❌ Error splitting inventory:`, error.message);
    return false;
  }
}

/**
 * Main function to split inventory between Karachi and Texas
 */
async function splitAllInventory() {
  try {
    console.log('🚀 Starting inventory migration - Moving ALL inventory to Texas...\n');
    console.log('='.repeat(60));
    console.log(`📊 Inventory Distribution:`);
    console.log(`  - Karachi Warehouse: ${KARACHI_INVENTORY} units (REMOVING all inventory)`);
    console.log(`  - Texas Warehouse: ${TEXAS_INVENTORY} units per variant`);
    console.log('='.repeat(60));

    // Step 1: Get locations
    const locations = await getLocations();

    // Find Karachi and Texas locations
    const karachiLocation = locations.find(loc =>
      loc.name.toLowerCase().includes('karachi') ||
      loc.name.toLowerCase().includes('gulberg')
    );

    const texasLocation = locations.find(loc =>
      loc.name.toLowerCase().includes('texas')
    );

    if (!karachiLocation) {
      console.error('\n❌ Karachi location not found!');
      return;
    }

    if (!texasLocation) {
      console.error('\n❌ Texas Warehouse location not found!');
      return;
    }

    console.log('\n📍 Warehouse Details:');
    console.log(`  Karachi: ${karachiLocation.name} (ID: ${karachiLocation.id})`);
    console.log(`  Texas: ${texasLocation.name} (ID: ${texasLocation.id})`);
    console.log('='.repeat(60));

    // Step 2: Get all products
    const products = await getAllProducts();

    // Step 3: Split inventory for each product variant
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`\n[${i + 1}/${products.length}] 📦 Product: ${product.title}`);

      for (const variant of product.variants) {
        console.log(`  📌 Variant: ${variant.title}`);

        const success = await splitInventoryBetweenWarehouses(
          variant.inventory_item_id,
          karachiLocation.id,
          texasLocation.id,
          product.title,
          variant.title
        );

        if (success) {
          successCount++;
        } else {
          errorCount++;
        }

        // Add delay between variants to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Inventory Migration Complete!');
    console.log(`  ✅ Success: ${successCount} variants`);
    console.log(`  ❌ Errors: ${errorCount} variants`);
    console.log(`  ⏭️  Skipped: ${skippedCount} variants`);
    console.log('\n📊 Final Distribution:');
    console.log(`  - Karachi Warehouse: ${KARACHI_INVENTORY} units (ALL INVENTORY REMOVED)`);
    console.log(`  - Texas Warehouse: ${TEXAS_INVENTORY} units per variant`);
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('\n❌ Split operation failed:', error.message);
    throw error;
  }
}

// Run the script if executed directly
if (require.main === module) {
  splitAllInventory()
    .then(() => {
      console.log('\n✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

export { getLocations, getAllProducts, splitAllInventory };
