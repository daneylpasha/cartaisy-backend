import mongoose, { Document, Schema } from 'mongoose';

/**
 * Store-less Shopify App Store install (issue #207).
 *
 * The public install URL has no Cartaisy store yet. This record holds the
 * one-time OAuth state, then the encrypted Admin token, until an authenticated
 * store admin claims it. The raw state and the plaintext token are never stored.
 * MongoDB deletes the document when `expiresAt` passes.
 */

export type ShopifyPendingInstallStatus =
  | 'awaiting_auth'
  | 'exchanging'
  | 'authorized'
  | 'claiming';

export interface IShopifyPendingInstall extends Document {
  shop: string;
  stateHash?: string;
  /**
   * SHA-256 of the one-time claim nonce. The raw nonce is returned only to the
   * installing browser. It is not a Shopify token.
   */
  claimTokenHash?: string;
  status: ShopifyPendingInstallStatus;
  accessToken?: string;
  scope?: string;
  expiresAt: Date;
  claimedByStoreId?: mongoose.Types.ObjectId;
  claimedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ShopifyPendingInstallSchema = new Schema<IShopifyPendingInstall>(
  {
    shop: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    stateHash: {
      type: String,
    },
    claimTokenHash: {
      type: String,
      select: false,
    },
    status: {
      type: String,
      required: true,
      enum: ['awaiting_auth', 'exchanging', 'authorized', 'claiming'],
    },
    accessToken: {
      type: String,
      select: false,
    },
    scope: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    claimedByStoreId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
    },
    claimedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        const sanitized = ret as {
          accessToken?: string;
          stateHash?: string;
          claimTokenHash?: string;
          __v?: number;
        };
        delete sanitized.accessToken;
        delete sanitized.stateHash;
        delete sanitized.claimTokenHash;
        delete sanitized.__v;
        return ret;
      },
    },
  }
);

// The raw state is never stored. Unset after the callback consumes it so a
// replay cannot exchange the same grant twice.
ShopifyPendingInstallSchema.index({ stateHash: 1 }, { unique: true, sparse: true });
ShopifyPendingInstallSchema.index({ claimTokenHash: 1 }, { unique: true, sparse: true });
ShopifyPendingInstallSchema.index({ shop: 1, status: 1, expiresAt: 1 });
ShopifyPendingInstallSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IShopifyPendingInstall>(
  'ShopifyPendingInstall',
  ShopifyPendingInstallSchema
);
