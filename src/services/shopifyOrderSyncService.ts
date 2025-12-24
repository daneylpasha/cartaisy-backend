import axios, { AxiosInstance } from 'axios';
import Order from '../models/Order';
import Store from '../models/Store';

/**
 * Shopify Order Sync Service
 *
 * Handles syncing orders to Shopify as draft orders for merchant visibility.
 * This allows merchants to see mobile app orders in their Shopify admin.
 */
export class ShopifyOrderSyncService {
  /**
   * Create a Shopify API client for a store
   */
  private static async getShopifyClient(storeId: string): Promise<AxiosInstance | null> {
    try {
      const store = await Store.findById(storeId).select('+shopify.accessToken');

      if (!store?.shopify?.accessToken || !store.shopify.shop || !store.shopify.isConnected) {
        console.log('Store not connected to Shopify or missing credentials');
        return null;
      }

      return axios.create({
        baseURL: `https://${store.shopify.shop}/admin/api/2024-01`,
        headers: {
          'X-Shopify-Access-Token': store.shopify.accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    } catch (error) {
      console.error('Error creating Shopify client:', error);
      return null;
    }
  }

  /**
   * Create draft order in Shopify for merchant reference
   * This allows merchants to see mobile orders in Shopify admin
   */
  static async createDraftOrder(orderId: string): Promise<string | null> {
    try {
      const order = await Order.findById(orderId)
        .populate('lineItems.productId', 'shopifyVariantId title');

      if (!order) {
        throw new Error('Order not found');
      }

      // Get storeId from order (if multi-tenant) or use default
      const storeId = (order as any).storeId;
      if (!storeId) {
        console.log('Order has no storeId, skipping Shopify sync');
        return null;
      }

      const shopifyClient = await this.getShopifyClient(storeId.toString());
      if (!shopifyClient) {
        console.log('Store not connected to Shopify, skipping sync');
        return null;
      }

      // Prepare line items
      const lineItems = order.lineItems.map((item: any) => {
        const lineItem: any = {
          quantity: item.quantity,
          title: item.title,
          price: item.price.toString(),
          properties: [
            {
              name: 'Source',
              value: 'Cartaisy Mobile App',
            },
            {
              name: 'Order Number',
              value: order.orderNumber,
            },
          ],
        };

        // Add variant_id if available (allows Shopify to track inventory)
        const shopifyVariantId = item.shopifyVariantId ||
          (item.productId && typeof item.productId === 'object' ? item.productId.shopifyVariantId : null);

        if (shopifyVariantId) {
          lineItem.variant_id = parseInt(shopifyVariantId, 10);
        }

        return lineItem;
      });

      // Get customer name from shipping address
      const firstName = order.shippingAddress?.firstName || '';
      const lastName = order.shippingAddress?.lastName || '';

      // Create draft order payload
      const draftOrderPayload: any = {
        draft_order: {
          line_items: lineItems,
          customer: {
            email: order.email,
            first_name: firstName,
            last_name: lastName,
          },
          note: `Mobile App Order: ${order.orderNumber}\nPayment Status: ${order.paymentStatus || 'pending'}\nSource: Cartaisy`,
          tags: 'cartaisy,mobile-app',
          tax_exempt: false,
          // Use order currency for multi-currency support
          currency: order.currency || 'USD',
        },
      };

      // Add shipping address if available
      if (order.shippingAddress) {
        draftOrderPayload.draft_order.shipping_address = {
          first_name: order.shippingAddress.firstName,
          last_name: order.shippingAddress.lastName,
          address1: order.shippingAddress.address1,
          address2: order.shippingAddress.address2 || '',
          city: order.shippingAddress.city,
          province: order.shippingAddress.province,
          country: order.shippingAddress.country,
          zip: order.shippingAddress.zip,
          phone: order.shippingAddress.phone || '',
        };
      }

      // Add billing address if available
      if (order.billingAddress) {
        draftOrderPayload.draft_order.billing_address = {
          first_name: order.billingAddress.firstName,
          last_name: order.billingAddress.lastName,
          address1: order.billingAddress.address1,
          address2: order.billingAddress.address2 || '',
          city: order.billingAddress.city,
          province: order.billingAddress.province,
          country: order.billingAddress.country,
          zip: order.billingAddress.zip,
          phone: order.billingAddress.phone || '',
        };
      }

      // Create draft order in Shopify
      const response = await shopifyClient.post('/draft_orders.json', draftOrderPayload);

      const draftOrderId = response.data.draft_order.id.toString();

      // Update order with Shopify draft order ID
      order.shopifyDraftOrderId = draftOrderId;
      await order.save();

      console.log(`✅ Created Shopify draft order ${draftOrderId} for ${order.orderNumber}`);
      return draftOrderId;
    } catch (error: any) {
      console.error('Shopify draft order creation error:', error.response?.data || error.message);
      // Don't throw - sync is optional
      return null;
    }
  }

  /**
   * Update inventory in Shopify after order
   */
  static async updateInventory(orderId: string): Promise<void> {
    try {
      const order = await Order.findById(orderId)
        .populate('lineItems.productId', 'shopifyInventoryItemId title');

      if (!order) {
        console.log('Order not found for inventory update');
        return;
      }

      const storeId = (order as any).storeId;
      if (!storeId) {
        console.log('Order has no storeId, skipping inventory sync');
        return;
      }

      const store = await Store.findById(storeId).select('+shopify.accessToken shopify');
      if (!store?.shopify?.accessToken || !store.shopify.isConnected) {
        return;
      }

      const shopifyClient = await this.getShopifyClient(storeId.toString());
      if (!shopifyClient) {
        return;
      }

      // Get location ID (use primary location)
      const locationId = (store.shopify as any).locationId;
      if (!locationId) {
        console.log('No Shopify location ID configured, skipping inventory sync');
        return;
      }

      // Update inventory for each item
      for (const item of order.lineItems) {
        try {
          const inventoryItemId = (item as any).productId?.shopifyInventoryItemId;

          if (!inventoryItemId) {
            continue;
          }

          // Adjust inventory
          await shopifyClient.post('/inventory_levels/adjust.json', {
            location_id: parseInt(locationId, 10),
            inventory_item_id: parseInt(inventoryItemId, 10),
            available_adjustment: -item.quantity, // Reduce by ordered quantity
          });

          console.log(`✅ Updated Shopify inventory for ${item.title}`);
        } catch (itemError: any) {
          console.error(`Inventory update error for item ${item.title}:`, itemError.response?.data || itemError.message);
        }
      }
    } catch (error: any) {
      console.error('Shopify inventory update error:', error.message);
    }
  }

  /**
   * Complete draft order in Shopify (optional - for full integration)
   * This converts the draft order to an actual order in Shopify
   */
  static async completeDraftOrder(orderId: string): Promise<void> {
    try {
      const order = await Order.findById(orderId);
      if (!order?.shopifyDraftOrderId) {
        console.log('Order has no Shopify draft order ID');
        return;
      }

      const storeId = (order as any).storeId;
      if (!storeId) {
        return;
      }

      const shopifyClient = await this.getShopifyClient(storeId.toString());
      if (!shopifyClient) {
        return;
      }

      // Complete the draft order (creates actual order in Shopify)
      const response = await shopifyClient.put(
        `/draft_orders/${order.shopifyDraftOrderId}/complete.json`,
        { payment_pending: false }
      );

      const shopifyOrderId = response.data.draft_order.order_id?.toString();

      if (shopifyOrderId) {
        order.shopifyOrderId = shopifyOrderId;
        await order.save();
        console.log(`✅ Completed Shopify order ${shopifyOrderId} for ${order.orderNumber}`);
      }
    } catch (error: any) {
      console.error('Complete draft order error:', error.response?.data || error.message);
    }
  }

  /**
   * Delete draft order from Shopify (e.g., when order is cancelled)
   */
  static async deleteDraftOrder(orderId: string): Promise<void> {
    try {
      const order = await Order.findById(orderId);
      if (!order?.shopifyDraftOrderId) {
        return;
      }

      const storeId = (order as any).storeId;
      if (!storeId) {
        return;
      }

      const shopifyClient = await this.getShopifyClient(storeId.toString());
      if (!shopifyClient) {
        return;
      }

      await shopifyClient.delete(`/draft_orders/${order.shopifyDraftOrderId}.json`);

      order.shopifyDraftOrderId = undefined;
      await order.save();

      console.log(`✅ Deleted Shopify draft order for ${order.orderNumber}`);
    } catch (error: any) {
      console.error('Delete draft order error:', error.response?.data || error.message);
    }
  }

  /**
   * Update draft order in Shopify when order is modified
   */
  static async updateDraftOrder(orderId: string): Promise<void> {
    try {
      const order = await Order.findById(orderId);
      if (!order?.shopifyDraftOrderId) {
        // If no draft order exists, create one
        await this.createDraftOrder(orderId);
        return;
      }

      const storeId = (order as any).storeId;
      if (!storeId) {
        return;
      }

      const shopifyClient = await this.getShopifyClient(storeId.toString());
      if (!shopifyClient) {
        return;
      }

      // Update the note with current status
      await shopifyClient.put(`/draft_orders/${order.shopifyDraftOrderId}.json`, {
        draft_order: {
          id: order.shopifyDraftOrderId,
          note: `Mobile App Order: ${order.orderNumber}\nStatus: ${order.mobileStatus?.current || 'unknown'}\nPayment Status: ${order.paymentStatus || 'pending'}\nSource: Cartaisy`,
        },
      });

      console.log(`✅ Updated Shopify draft order for ${order.orderNumber}`);
    } catch (error: any) {
      console.error('Update draft order error:', error.response?.data || error.message);
    }
  }
}

export default ShopifyOrderSyncService;
