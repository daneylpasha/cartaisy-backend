import mongoose, { Document } from 'mongoose';
export interface ITrackingEvent {
    timestamp: Date;
    status: string;
    description: string;
    location: {
        city?: string;
        state?: string;
        country?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    facility?: string;
    carrier?: string;
    isDeliveryAttempt?: boolean;
    nextAttemptDate?: Date;
}
export interface ICarrierInfo {
    name: string;
    service: string;
    trackingUrl: string;
    supportContact?: {
        phone?: string;
        email?: string;
        website?: string;
    };
}
export interface IDeliveryAttempt {
    attemptNumber: number;
    attemptedAt: Date;
    status: 'failed' | 'successful';
    reason?: string;
    nextAttemptDate?: Date;
    location?: string;
    driverNotes?: string;
}
export interface IDeliveryConfirmation {
    deliveredAt: Date;
    deliveredTo?: string;
    deliveryMethod: 'handed_to_recipient' | 'left_at_door' | 'safe_place' | 'neighbor';
    safePlace?: string;
    neighborInfo?: {
        name?: string;
        address?: string;
    };
    photoUrl?: string;
    signatureUrl?: string;
    driverNotes?: string;
    recipientFeedback?: {
        received: boolean;
        condition: 'perfect' | 'good' | 'damaged' | 'missing_items';
        notes?: string;
        reportedAt: Date;
    };
}
export interface IOrderTracking extends Document {
    order: mongoose.Types.ObjectId;
    orderNumber: string;
    carrier: ICarrierInfo;
    trackingNumber: string;
    serviceType: string;
    packageInfo: {
        weight: number;
        dimensions: {
            length: number;
            width: number;
            height: number;
        };
        packageType: 'envelope' | 'box' | 'tube' | 'irregular';
        insuranceValue?: number;
        requiresSignature: boolean;
    };
    currentStatus: 'created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned';
    currentLocation?: {
        city?: string;
        state?: string;
        country?: string;
        facility?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    events: ITrackingEvent[];
    estimatedDelivery: Date;
    originalEstimatedDelivery?: Date;
    deliveryWindow?: {
        start: Date;
        end: Date;
    };
    deliveryAttempts: IDeliveryAttempt[];
    maxDeliveryAttempts: number;
    deliveryConfirmation?: IDeliveryConfirmation;
    exceptions: {
        type: 'delay' | 'damaged' | 'lost' | 'address_issue' | 'customs' | 'weather' | 'other';
        description: string;
        reportedAt: Date;
        resolvedAt?: Date;
        resolution?: string;
    }[];
    notifications: {
        type: 'sms' | 'email' | 'push';
        event: string;
        sentAt: Date;
        delivered: boolean;
        message: string;
    }[];
    lastUpdated: Date;
    updateFrequency: number;
    isRealTimeEnabled: boolean;
    customerPreferences: {
        notificationsEnabled: boolean;
        preferredNotificationTypes: ('sms' | 'email' | 'push')[];
        deliveryInstructions: string;
        safePlace?: string;
        authorizedRecipients?: string[];
    };
    internalNotes: string[];
    flaggedForReview: boolean;
    customerServiceTickets: string[];
    shippedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    addTrackingEvent(status: string, description: string, location?: any): Promise<void>;
    updateDeliveryEstimate(newEstimate: Date, reason?: string): Promise<void>;
    recordDeliveryAttempt(status: 'failed' | 'successful', reason?: string, nextAttempt?: Date): Promise<void>;
    confirmDelivery(confirmation: Partial<IDeliveryConfirmation>): Promise<void>;
    sendNotification(event: string, customMessage?: string): Promise<void>;
    getEstimatedDeliveryText(): string;
}
declare const _default: mongoose.Model<IOrderTracking, {}, {}, {}, mongoose.Document<unknown, {}, IOrderTracking, {}, {}> & IOrderTracking & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export default _default;
//# sourceMappingURL=OrderTracking.d.ts.map