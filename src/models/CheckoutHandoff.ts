import mongoose, { Schema, Document } from 'mongoose';

/**
 * Checkout Handoff
 *
 * Non-sensitive metadata recorded when a shopper is handed off to
 * Shopify-hosted checkout (SaaS checkout v1, issue #68). Used to correlate
 * Shopify order webhooks back to the owning Store, cart, and customer or
 * guest session. Never stores tokens or payment data.
 */

export interface ICheckoutHandoff extends Document {
  storeId: mongoose.Types.ObjectId;
  shopifyCartId: string;
  customerId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  source: 'customer' | 'public';
  checkoutUrl: string;
  status: 'pending' | 'reconciled';
  reconciledAt?: Date;
  shopifyOrderId?: string;
  orderId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CheckoutHandoffSchema = new Schema<ICheckoutHandoff>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    shopifyCartId: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    guestSessionId: {
      type: String,
    },
    source: {
      type: String,
      enum: ['customer', 'public'],
      required: true,
    },
    // The Shopify-hosted checkout URL handed to the shopper (already
    // shopper-visible, not a secret)
    checkoutUrl: {
      type: String,
      required: true,
    },
    // Webhook reconciliation state (issue #76). Handoffs created before this
    // field existed have no status and are treated as pending.
    status: {
      type: String,
      enum: ['pending', 'reconciled'],
      default: 'pending',
      index: true,
    },
    reconciledAt: {
      type: Date,
    },
    shopifyOrderId: {
      type: String,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
    },
  },
  { timestamps: true }
);

// Webhook reconciliation lookup: which store/cart does an incoming order belong to
CheckoutHandoffSchema.index({ storeId: 1, shopifyCartId: 1, createdAt: -1 });

export default mongoose.model<ICheckoutHandoff>('CheckoutHandoff', CheckoutHandoffSchema);
