/**
 * Check Shopify Shipping Zones via REST API
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

async function main() {
  console.log('🌍 Checking Shopify Shipping Configuration (REST API)\n');
  console.log('='.repeat(60));

  try {
    // Get shipping zones
    const response = await axios.get(
      `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/shipping_zones.json`,
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN!,
        },
      }
    );

    const shippingZones = response.data.shipping_zones;

    if (!shippingZones || shippingZones.length === 0) {
      console.log('❌ NO SHIPPING ZONES FOUND!\n');
      console.log('This is why you\'re not getting shipping rates.\n');
      console.log('To fix this:');
      console.log('1. Go to Shopify Admin: https://admin.shopify.com');
      console.log('2. Navigate to: Settings → Shipping and delivery');
      console.log('3. Click "Manage rates" under "Shipping"');
      console.log('4. Create a new shipping zone (e.g., "United States")');
      console.log('5. Add countries/regions you want to ship to');
      console.log('6. Add shipping rates (e.g., Standard $9.99, Express $19.99)');
      console.log('7. Save and try again');
      return;
    }

    console.log(`Found ${shippingZones.length} shipping zone(s):\n`);

    shippingZones.forEach((zone: any, index: number) => {
      console.log(`[${index + 1}] ${zone.name}`);
      console.log(`    Countries: ${zone.countries.length > 0 ? zone.countries.map((c: any) => c.code).join(', ') : 'None'}`);

      if (zone.weight_based_shipping_rates && zone.weight_based_shipping_rates.length > 0) {
        console.log(`    Weight-based rates:`);
        zone.weight_based_shipping_rates.forEach((rate: any) => {
          console.log(`      - ${rate.name}: $${rate.price} (${rate.weight_low} - ${rate.weight_high} ${zone.weight_unit})`);
        });
      }

      if (zone.price_based_shipping_rates && zone.price_based_shipping_rates.length > 0) {
        console.log(`    Price-based rates:`);
        zone.price_based_shipping_rates.forEach((rate: any) => {
          console.log(`      - ${rate.name}: $${rate.price} (min order: $${rate.min_order_subtotal || 0})`);
        });
      }

      if (zone.carrier_shipping_rate_providers && zone.carrier_shipping_rate_providers.length > 0) {
        console.log(`    Carrier-calculated rates:`);
        zone.carrier_shipping_rate_providers.forEach((provider: any) => {
          console.log(`      - ${provider.carrier_service_id} (${provider.service_filter || 'all services'})`);
        });
      }

      console.log();
    });

    console.log('='.repeat(60));

    // Check if US is covered
    const usZone = shippingZones.find((zone: any) =>
      zone.countries.some((c: any) => c.code === 'US')
    );

    if (usZone) {
      console.log('✅ United States IS covered by shipping zones');
      const hasRates = (usZone.weight_based_shipping_rates?.length > 0) ||
                      (usZone.price_based_shipping_rates?.length > 0) ||
                      (usZone.carrier_shipping_rate_providers?.length > 0);
      if (!hasRates) {
        console.log('⚠️  BUT NO SHIPPING RATES ARE CONFIGURED!');
        console.log('   Add shipping rates to the zone in Shopify Admin.');
      }
    } else {
      console.log('❌ United States is NOT covered by shipping zones');
      console.log('   Add US to a shipping zone in Shopify Admin.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

main();
