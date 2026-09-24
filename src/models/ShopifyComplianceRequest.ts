import mongoose, { Document, Schema } from 'mongoose';

/**
 * Durable record of a Shopify mandatory compliance webhook or app uninstall.
 *
 * This is the v1 audit trail and the ops handoff for customers/data_request.
 * It stores store scope and Shopify resource ids only. Email, phone, names,
 * addresses, and tokens are never fields on this document.
 */

export type ShopifyComplianceTopic =
  | 'customers/data_request'
  | 'customers/redact'
  | 'shop/redact'
  | 'app/uninstalled';

export type ShopifyComplianceStatus = 'recorded' | 'pending' | 'redacted' | 'uninstalled';

export interface IShopifyComplianceSummary {
  usersRedacted?: number;
  customersDeleted?: number;
  ordersRedacted?: number;
  matchedOrderCount?: number;
  guestSessionsRedacted?: number;
  relatedRecordsDeleted?: number;
  credentialsCleared?: boolean;
}

export interface IShopifyComplianceRequest extends Document {
  storeId: mongoose.Types.ObjectId;
  shopDomain: string;
  topic: ShopifyComplianceTopic;
  externalId: string;
  shopifyCustomerId?: string;
  shopifyOrderIds: string[];
  matchedUserIds: string[];
  matchedCustomerIds: string[];
  status: ShopifyComplianceStatus;
  summary: IShopifyComplianceSummary;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SummarySchema = new Schema<IShopifyComplianceSummary>(
  {
    usersRedacted: { type: Number },
    customersDeleted: { type: Number },
    ordersRedacted: { type: Number },
    matchedOrderCount: { type: Number },
    guestSessionsRedacted: { type: Number },
    relatedRecordsDeleted: { type: Number },
    credentialsCleared: { type: Boolean },
  },
  { _id: false }
);

const ShopifyComplianceRequestSchema = new Schema<IShopifyComplianceRequest>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    shopDomain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    topic: {
      type: String,
      required: true,
      enum: ['customers/data_request', 'customers/redact', 'shop/redact', 'app/uninstalled'],
    },
    externalId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    shopifyCustomerId: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    shopifyOrderIds: {
      type: [String],
      default: [],
    },
    matchedUserIds: {
      type: [String],
      default: [],
    },
    matchedCustomerIds: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      required: true,
      enum: ['recorded', 'pending', 'redacted', 'uninstalled'],
    },
    summary: {
      type: SummarySchema,
      default: () => ({}),
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

ShopifyComplianceRequestSchema.index(
  { storeId: 1, topic: 1, externalId: 1 },
  { unique: true }
);

export default mongoose.model<IShopifyComplianceRequest>(
  'ShopifyComplianceRequest',
  ShopifyComplianceRequestSchema
);
