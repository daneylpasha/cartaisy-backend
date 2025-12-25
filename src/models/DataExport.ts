import mongoose, { Document, Schema } from 'mongoose';

/**
 * Data Export Model
 *
 * Tracks GDPR-compliant user data export requests.
 * Supports both customer-initiated and merchant-initiated exports.
 */

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
export type ExportRequestedBy = 'customer' | 'merchant';
export type ExportType = 'single_customer' | 'bulk';

export interface IDataExport extends Document {
  storeId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId; // Optional for bulk exports
  type: ExportType;

  // Request details
  requestedBy: ExportRequestedBy;
  requestedByUserId?: mongoose.Types.ObjectId; // For merchant-initiated requests

  // Processing status
  status: ExportStatus;
  errorMessage?: string;

  // Export file details
  fileUrl?: string;
  fileSize?: number;
  expiresAt?: Date;

  // Bulk export stats
  totalCustomers?: number;
  successCount?: number;
  errorCount?: number;

  // Export data storage
  exportData?: Record<string, any>;

  // Metadata
  schemaVersion: string;
  dataCategories: string[]; // Which data categories were included

  // Rate limiting
  lastExportRequestAt?: Date;

  // Timestamps
  requestedAt: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dataExportSchema = new Schema<IDataExport>(
  {
    storeId: {
      type: Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
      // Not required - bulk exports don't have a single customerId
    },
    type: {
      type: String,
      enum: ['single_customer', 'bulk'],
      default: 'single_customer',
      index: true,
    },
    requestedBy: {
      type: String,
      enum: ['customer', 'merchant'],
      required: true,
    },
    requestedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },
    errorMessage: {
      type: String,
    },
    fileUrl: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    // Bulk export stats
    totalCustomers: {
      type: Number,
    },
    successCount: {
      type: Number,
    },
    errorCount: {
      type: Number,
    },
    // Export data storage (for persisting export data)
    exportData: {
      type: Schema.Types.Mixed,
    },
    schemaVersion: {
      type: String,
      default: '1.0.0',
    },
    dataCategories: [{
      type: String,
    }],
    lastExportRequestAt: {
      type: Date,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    processingStartedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
dataExportSchema.index({ customerId: 1, requestedAt: -1 });
dataExportSchema.index({ storeId: 1, status: 1, requestedAt: -1 });
dataExportSchema.index({ customerId: 1, status: 1 });

// TTL index - auto-delete completed exports after 30 days
dataExportSchema.index(
  { completedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { status: 'completed' },
  }
);

/**
 * Check if customer can request a new export (rate limiting)
 * Returns true if 24 hours have passed since last request
 */
dataExportSchema.statics.canRequestExport = async function (
  customerId: mongoose.Types.ObjectId | string
): Promise<{ canRequest: boolean; nextAvailableAt?: Date }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const recentExport = await this.findOne({
    customerId,
    requestedAt: { $gte: twentyFourHoursAgo },
  }).sort({ requestedAt: -1 });

  if (recentExport) {
    const nextAvailableAt = new Date(recentExport.requestedAt.getTime() + 24 * 60 * 60 * 1000);
    return {
      canRequest: false,
      nextAvailableAt,
    };
  }

  return { canRequest: true };
};

/**
 * Get latest export for a customer
 */
dataExportSchema.statics.getLatestExport = async function (
  customerId: mongoose.Types.ObjectId | string
): Promise<IDataExport | null> {
  return this.findOne({ customerId })
    .sort({ requestedAt: -1 })
    .lean();
};

// Interface for static methods
export interface IDataExportModel extends mongoose.Model<IDataExport> {
  canRequestExport(
    customerId: mongoose.Types.ObjectId | string
  ): Promise<{ canRequest: boolean; nextAvailableAt?: Date }>;
  getLatestExport(
    customerId: mongoose.Types.ObjectId | string
  ): Promise<IDataExport | null>;
}

const DataExport = mongoose.model<IDataExport, IDataExportModel>(
  'DataExport',
  dataExportSchema
);

export default DataExport;
