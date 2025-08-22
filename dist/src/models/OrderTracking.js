"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const TrackingEventSchema = new mongoose_1.Schema({
    timestamp: { type: Date, required: true },
    status: { type: String, required: true },
    description: { type: String, required: true },
    location: {
        city: String,
        state: String,
        country: String,
        coordinates: {
            lat: { type: Number, min: -90, max: 90 },
            lng: { type: Number, min: -180, max: 180 }
        }
    },
    facility: String,
    carrier: String,
    isDeliveryAttempt: { type: Boolean, default: false },
    nextAttemptDate: Date
}, { _id: false });
const CarrierInfoSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    service: { type: String, required: true },
    trackingUrl: { type: String, required: true },
    supportContact: {
        phone: String,
        email: String,
        website: String
    }
}, { _id: false });
const DeliveryAttemptSchema = new mongoose_1.Schema({
    attemptNumber: { type: Number, required: true },
    attemptedAt: { type: Date, required: true },
    status: { type: String, enum: ['failed', 'successful'], required: true },
    reason: String,
    nextAttemptDate: Date,
    location: String,
    driverNotes: String
});
const DeliveryConfirmationSchema = new mongoose_1.Schema({
    deliveredAt: { type: Date, required: true },
    deliveredTo: String,
    deliveryMethod: {
        type: String,
        enum: ['handed_to_recipient', 'left_at_door', 'safe_place', 'neighbor'],
        required: true
    },
    safePlace: String,
    neighborInfo: {
        name: String,
        address: String
    },
    photoUrl: String,
    signatureUrl: String,
    driverNotes: String,
    recipientFeedback: {
        received: { type: Boolean, required: true },
        condition: {
            type: String,
            enum: ['perfect', 'good', 'damaged', 'missing_items'],
            required: true
        },
        notes: String,
        reportedAt: { type: Date, default: Date.now }
    }
}, { _id: false });
const OrderTrackingSchema = new mongoose_1.Schema({
    // References
    order: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Order',
        required: true,
        index: true
    },
    orderNumber: {
        type: String,
        required: true,
        index: true
    },
    // Carrier info
    carrier: CarrierInfoSchema,
    trackingNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    serviceType: { type: String, required: true },
    // Package details
    packageInfo: {
        weight: { type: Number, required: true, min: 0 },
        dimensions: {
            length: { type: Number, required: true, min: 0 },
            width: { type: Number, required: true, min: 0 },
            height: { type: Number, required: true, min: 0 }
        },
        packageType: {
            type: String,
            enum: ['envelope', 'box', 'tube', 'irregular'],
            default: 'box'
        },
        insuranceValue: { type: Number, min: 0 },
        requiresSignature: { type: Boolean, default: false }
    },
    // Current status
    currentStatus: {
        type: String,
        enum: ['created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'],
        default: 'created',
        index: true
    },
    currentLocation: {
        city: String,
        state: String,
        country: String,
        facility: String,
        coordinates: {
            lat: { type: Number, min: -90, max: 90 },
            lng: { type: Number, min: -180, max: 180 }
        }
    },
    // Events and delivery
    events: [TrackingEventSchema],
    estimatedDelivery: { type: Date, required: true, index: true },
    originalEstimatedDelivery: Date,
    deliveryWindow: {
        start: Date,
        end: Date
    },
    // Delivery attempts
    deliveryAttempts: [DeliveryAttemptSchema],
    maxDeliveryAttempts: { type: Number, default: 3 },
    deliveryConfirmation: DeliveryConfirmationSchema,
    // Exceptions
    exceptions: [{
            type: {
                type: String,
                enum: ['delay', 'damaged', 'lost', 'address_issue', 'customs', 'weather', 'other'],
                required: true
            },
            description: { type: String, required: true },
            reportedAt: { type: Date, default: Date.now },
            resolvedAt: Date,
            resolution: String
        }],
    // Notifications
    notifications: [{
            type: { type: String, enum: ['sms', 'email', 'push'], required: true },
            event: { type: String, required: true },
            sentAt: { type: Date, default: Date.now },
            delivered: { type: Boolean, default: false },
            message: { type: String, required: true }
        }],
    // Updates
    lastUpdated: { type: Date, default: Date.now, index: true },
    updateFrequency: { type: Number, default: 60 }, // minutes
    isRealTimeEnabled: { type: Boolean, default: true },
    // Customer preferences
    customerPreferences: {
        notificationsEnabled: { type: Boolean, default: true },
        preferredNotificationTypes: [{
                type: String,
                enum: ['sms', 'email', 'push']
            }],
        deliveryInstructions: { type: String, maxlength: 500 },
        safePlace: String,
        authorizedRecipients: [String]
    },
    // Internal
    internalNotes: [String],
    flaggedForReview: { type: Boolean, default: false, index: true },
    customerServiceTickets: [String],
    // Timestamps
    shippedAt: { type: Date, required: true }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});
// Indexes
OrderTrackingSchema.index({ trackingNumber: 1 });
OrderTrackingSchema.index({ currentStatus: 1, estimatedDelivery: 1 });
OrderTrackingSchema.index({ 'carrier.name': 1, currentStatus: 1 });
OrderTrackingSchema.index({ shippedAt: -1 });
OrderTrackingSchema.index({ flaggedForReview: 1, currentStatus: 1 });
// Virtual for days in transit
OrderTrackingSchema.virtual('daysInTransit').get(function () {
    const start = this.shippedAt;
    const end = this.deliveryConfirmation?.deliveredAt || new Date();
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
});
// Virtual for is overdue
OrderTrackingSchema.virtual('isOverdue').get(function () {
    return new Date() > this.estimatedDelivery && !this.deliveryConfirmation;
});
// Virtual for next update time
OrderTrackingSchema.virtual('nextUpdateAt').get(function () {
    return new Date(this.lastUpdated.getTime() + this.updateFrequency * 60 * 1000);
});
// Methods
OrderTrackingSchema.methods.addTrackingEvent = async function (status, description, location) {
    const event = {
        timestamp: new Date(),
        status,
        description,
        location: location || {},
        carrier: this.carrier.name
    };
    this.events.push(event);
    this.lastUpdated = new Date();
    // Update current status and location
    if (status !== this.currentStatus) {
        this.currentStatus = status;
        if (location) {
            this.currentLocation = location;
        }
    }
    await this.save();
    // Send notification for key events
    const notificationEvents = ['picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception'];
    if (notificationEvents.includes(status)) {
        await this.sendNotification(status, description);
    }
};
OrderTrackingSchema.methods.updateDeliveryEstimate = async function (newEstimate, reason) {
    if (!this.originalEstimatedDelivery) {
        this.originalEstimatedDelivery = this.estimatedDelivery;
    }
    this.estimatedDelivery = newEstimate;
    this.lastUpdated = new Date();
    if (reason) {
        this.exceptions.push({
            type: 'delay',
            description: `Delivery estimate updated: ${reason}`,
            reportedAt: new Date()
        });
    }
    await this.save();
    await this.sendNotification('delay', `Delivery estimate updated to ${newEstimate.toLocaleDateString()}`);
};
OrderTrackingSchema.methods.recordDeliveryAttempt = async function (status, reason, nextAttempt) {
    const attemptNumber = this.deliveryAttempts.length + 1;
    const attempt = {
        attemptNumber,
        attemptedAt: new Date(),
        status,
        reason,
        nextAttemptDate: nextAttempt
    };
    this.deliveryAttempts.push(attempt);
    // Add tracking event
    const description = status === 'successful'
        ? 'Package delivered successfully'
        : `Delivery attempt failed: ${reason || 'Unknown reason'}`;
    await this.addTrackingEvent('delivery_attempt', description);
    if (status === 'failed' && attemptNumber >= this.maxDeliveryAttempts) {
        this.flaggedForReview = true;
        await this.sendNotification('exception', 'Multiple delivery attempts failed. Please contact customer service.');
    }
};
OrderTrackingSchema.methods.confirmDelivery = async function (confirmation) {
    this.deliveryConfirmation = {
        deliveredAt: new Date(),
        deliveryMethod: 'handed_to_recipient',
        ...confirmation
    };
    this.currentStatus = 'delivered';
    await this.addTrackingEvent('delivered', `Package delivered via ${this.deliveryConfirmation.deliveryMethod}`);
    // Update the associated order
    try {
        const Order = mongoose_1.default.model('Order');
        await Order.findByIdAndUpdate(this.order, {
            'mobileStatus.current': 'delivered',
            deliveredAt: this.deliveryConfirmation.deliveredAt
        });
    }
    catch (error) {
        console.error('Error updating order delivery status:', error);
    }
};
OrderTrackingSchema.methods.sendNotification = async function (event, customMessage) {
    const { notificationsEnabled, preferredNotificationTypes } = this.customerPreferences;
    if (!notificationsEnabled || preferredNotificationTypes.length === 0) {
        return;
    }
    const messages = {
        created: 'Your order has been shipped and is being prepared for pickup',
        picked_up: 'Your package has been picked up by the carrier',
        in_transit: 'Your package is in transit',
        out_for_delivery: 'Your package is out for delivery today',
        delivered: 'Your package has been delivered',
        exception: 'There is an issue with your delivery',
        delay: 'Your delivery has been delayed'
    };
    const message = customMessage || messages[event] || 'Tracking update available';
    for (const type of preferredNotificationTypes) {
        const notification = {
            type,
            event,
            sentAt: new Date(),
            delivered: false,
            message
        };
        this.notifications.push(notification);
        // Here you would integrate with actual notification services
        console.log(`${type.toUpperCase()} notification sent for ${event}: ${message}`);
    }
    await this.save();
};
OrderTrackingSchema.methods.getEstimatedDeliveryText = function () {
    const now = new Date();
    const delivery = this.estimatedDelivery;
    if (delivery < now) {
        return 'Overdue';
    }
    const diffTime = delivery.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
        return 'Today';
    }
    else if (diffDays === 1) {
        return 'Tomorrow';
    }
    else if (diffDays <= 7) {
        return `In ${diffDays} days`;
    }
    else {
        return delivery.toLocaleDateString();
    }
};
// Pre-save hooks
OrderTrackingSchema.pre('save', function (next) {
    // Sort events by timestamp
    if (this.isModified('events')) {
        this.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    // Auto-flag for review if overdue
    if (!this.flaggedForReview && this.isOverdue && this.currentStatus !== 'delivered') {
        this.flaggedForReview = true;
    }
    next();
});
exports.default = mongoose_1.default.model('OrderTracking', OrderTrackingSchema);
//# sourceMappingURL=OrderTracking.js.map