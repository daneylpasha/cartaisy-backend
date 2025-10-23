/**
 * Check Shopify Shipping Zones Configuration
 *
 * Verifies what countries/regions are covered by shipping zones
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
  console.log('🌍 Checking Shopify Shipping Zones Configuration\n');
  console.log('='.repeat(60));

  const query = `
    query {
      deliveryProfiles(first: 10) {
        edges {
          node {
            id
            name
            default
            profileLocationGroups {
              locationGroup {
                id
              }
              locationGroupZones(first: 50) {
                edges {
                  node {
                    zone {
                      id
                      name
                      countries {
                        code {
                          countryCode
                        }
                        provinces {
                          code
                        }
                      }
                    }
                    methodDefinitions(first: 20) {
                      edges {
                        node {
                          id
                          name
                          active
                          rateProvider {
                            ... on DeliveryRateDefinition {
                              price {
                                amount
                                currencyCode
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
          }
        }
      }
    }
  `;

  const response = await queryShopifyAdmin(query);
  const profiles = response.data.deliveryProfiles.edges;

  if (profiles.length === 0) {
    console.log('❌ No delivery profiles found!');
    console.log('   You need to set up shipping zones in Shopify Admin.');
    return;
  }

  profiles.forEach((profileEdge: any) => {
    const profile = profileEdge.node;
    console.log(`\n📦 Profile: ${profile.name}${profile.default ? ' (DEFAULT)' : ''}`);

    profile.profileLocationGroups.forEach((locationGroup: any) => {
      locationGroup.locationGroupZones.edges.forEach((zoneEdge: any) => {
        const zone = zoneEdge.node.zone;
        console.log(`\n   🌍 Zone: ${zone.name}`);

        if (zone.countries.length === 0) {
          console.log('      ⚠️  No countries configured!');
        } else {
          console.log('      Countries covered:');
          zone.countries.forEach((country: any) => {
            const countryCode = country.code.countryCode;
            const provinces = country.provinces.map((p: any) => p.code).join(', ');
            if (provinces) {
              console.log(`         - ${countryCode} (Provinces: ${provinces})`);
            } else {
              console.log(`         - ${countryCode} (All provinces)`);
            }
          });
        }

        console.log('      Shipping methods:');
        const methods = zoneEdge.node.methodDefinitions.edges;
        if (methods.length === 0) {
          console.log('         ⚠️  No shipping methods configured!');
        } else {
          methods.forEach((methodEdge: any) => {
            const method = methodEdge.node;
            const price = method.rateProvider?.price;
            const priceStr = price ? `$${price.amount} ${price.currencyCode}` : 'N/A';
            const status = method.active ? '✅' : '❌';
            console.log(`         ${status} ${method.name}: ${priceStr}`);
          });
        }
      });
    });
  });

  console.log('\n' + '='.repeat(60));
  console.log('\n💡 If you see no countries or no shipping methods, you need to:');
  console.log('   1. Go to Shopify Admin → Settings → Shipping and delivery');
  console.log('   2. Set up shipping zones for the countries you want to ship to');
  console.log('   3. Add shipping rates for each zone');
}

main().catch((error) => {
  console.error('❌ Error:', error.response?.data?.errors || error.message);
});
