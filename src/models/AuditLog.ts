import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  storeId: string;
  userId?: string;
  action: string;
  endpoint: string;
  method: string;
  ip: string;
  userAgent?: string;
  statusCode: number;
  duration: number;
  requestBody?: any;
  responseStatus?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    storeId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: String,
    statusCode: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    requestBody: {
      type: Schema.Types.Mixed,
    },
    responseStatus: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We manage timestamp manually
  }
);

// Compound indexes for efficient queries
AuditLogSchema.index({ storeId: 1, timestamp: -1 });
AuditLogSchema.index({ storeId: 1, statusCode: 1, timestamp: -1 });
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ ip: 1, timestamp: -1 });
AuditLogSchema.index({ storeId: 1, endpoint: 1, timestamp: -1 });

// TTL index - auto-delete logs after 90 days
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
