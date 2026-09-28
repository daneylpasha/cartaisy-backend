import mongoose, { Schema, Document } from 'mongoose';

/**
 * Store-owned Apple App Store Connect and Google Play credentials (issue #185).
 *
 * One document per store. The private key and service-account JSON live only
 * in `ciphertext`, encrypted with the shared AES-256-GCM helper
 * (`src/utils/encryption.ts`, `ENCRYPTION_KEY`). Ciphertext is `select: false`
 * and must never be returned by an API. Safe display fields (key id last 4,
 * service-account email) are stored beside it so status can still be shown
 * when the secret cannot be decrypted.
 *
 * MVP secret shape inside the ciphertext (JSON, then encrypted):
 *
 * Apple App Store Connect API key (`kind: "apple-asc-api-key"`):
 * `{ v, kind, keyId, issuerId, privateKey }` where `privateKey` is the .p8
 * PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`).
 *
 * Google Play service account (`kind: "google-play-service-account"`):
 * `{ v, kind, serviceAccount }` where `serviceAccount` is the JSON key Google
 * issues (type `service_account`, including `private_key` and `client_email`).
 * That object is what a later EAS Submit step needs. This model does not
 * submit.
 */

export interface IAppleCredentialStored {
  ciphertext?: string;
  keyIdLast4: string;
  issuerIdLast4: string;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
}

export interface IGoogleCredentialStored {
  ciphertext?: string;
  clientEmail: string;
  privateKeyIdLast4: string;
  updatedAt: Date;
  updatedBy: mongoose.Types.ObjectId;
}

export interface IStoreAppCredentials extends Document {
  storeId: mongoose.Types.ObjectId;
  apple?: IAppleCredentialStored;
  google?: IGoogleCredentialStored;
  createdAt: Date;
  updatedAt: Date;
}

const AppleCredentialSchema = new Schema<IAppleCredentialStored>(
  {
    ciphertext: {
      type: String,
      required: true,
      select: false,
    },
    keyIdLast4: {
      type: String,
      required: true,
      maxlength: 4,
    },
    issuerIdLast4: {
      type: String,
      required: true,
      maxlength: 4,
    },
    updatedAt: {
      type: Date,
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { _id: false }
);

const GoogleCredentialSchema = new Schema<IGoogleCredentialStored>(
  {
    ciphertext: {
      type: String,
      required: true,
      select: false,
    },
    clientEmail: {
      type: String,
      required: true,
      maxlength: 320,
    },
    privateKeyIdLast4: {
      type: String,
      required: true,
      maxlength: 4,
    },
    updatedAt: {
      type: Date,
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { _id: false }
);

const StoreAppCredentialsSchema = new Schema<IStoreAppCredentials>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      unique: true,
    },
    apple: {
      type: AppleCredentialSchema,
      required: false,
    },
    google: {
      type: GoogleCredentialSchema,
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IStoreAppCredentials>(
  'StoreAppCredentials',
  StoreAppCredentialsSchema
);
