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
const ReviewImageSchema = new mongoose_1.Schema({
    url: { type: String, required: true },
    alt: String,
    thumbnail: String
}, { _id: false });
const AdminResponseSchema = new mongoose_1.Schema({
    response: { type: String, required: true, maxlength: 1000 },
    respondedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    respondedAt: { type: Date, default: Date.now }
}, { _id: false });
const ProductReviewSchema = new mongoose_1.Schema({
    // Core references
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    product: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    orderId: {
        type: String,
        sparse: true,
        index: true
    },
    // Review content
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        index: true
    },
    title: {
        type: String,
        maxlength: 100,
        trim: true
    },
    reviewText: {
        type: String,
        required: true,
        minlength: 10,
        maxlength: 2000,
        trim: true
    },
    images: [ReviewImageSchema],
    // Verification
    verifiedPurchase: {
        type: Boolean,
        default: false,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'spam'],
        default: 'pending',
        index: true
    },
    // Community interaction
    helpfulVotes: {
        helpful: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
        notHelpful: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }]
    },
    helpfulCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    reportedBy: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    // Admin moderation
    moderatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    moderationReason: { type: String, maxlength: 500 },
    adminResponse: AdminResponseSchema,
    // Metadata
    deviceInfo: {
        platform: String,
        browser: String,
        isMobile: { type: Boolean, default: false }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});
// Compound indexes
ProductReviewSchema.index({ product: 1, status: 1, createdAt: -1 });
ProductReviewSchema.index({ user: 1, createdAt: -1 });
ProductReviewSchema.index({ status: 1, moderatedAt: 1 });
ProductReviewSchema.index({ rating: 1, verifiedPurchase: 1 });
ProductReviewSchema.index({ helpfulCount: -1 });
// Ensure one review per user per product (unless multiple orders)
ProductReviewSchema.index({ user: 1, product: 1, orderId: 1 }, { unique: true });
// Virtual for net helpful votes
ProductReviewSchema.virtual('netHelpfulVotes').get(function () {
    return this.helpfulVotes.helpful.length - this.helpfulVotes.notHelpful.length;
});
// Virtual for total votes
ProductReviewSchema.virtual('totalVotes').get(function () {
    return this.helpfulVotes.helpful.length + this.helpfulVotes.notHelpful.length;
});
// Methods
ProductReviewSchema.methods.updateHelpfulCount = function () {
    this.helpfulCount = this.helpfulVotes.helpful.length - this.helpfulVotes.notHelpful.length;
};
ProductReviewSchema.methods.canBeEditedBy = function (userId) {
    // Users can edit their reviews within 24 hours of creation
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.user.toString() === userId &&
        this.createdAt > twentyFourHoursAgo &&
        this.status === 'approved';
};
ProductReviewSchema.methods.isSpam = function () {
    // Simple spam detection based on report count and helpful votes
    const reportRatio = this.reportCount / Math.max(1, this.totalVotes);
    return this.reportCount >= 5 || reportRatio > 0.3;
};
// Pre-save hooks
ProductReviewSchema.pre('save', function (next) {
    // Auto-detect spam
    if (this.isModified('reportCount') && this.isSpam() && this.status === 'approved') {
        this.status = 'pending';
    }
    // Update helpful count
    if (this.isModified('helpfulVotes')) {
        this.updateHelpfulCount();
    }
    next();
});
// Post-save hook to update product analytics
ProductReviewSchema.post('save', async function () {
    if (this.status === 'approved') {
        try {
            // Update product's average rating and review count
            const Product = mongoose_1.default.model('Product');
            const reviews = await mongoose_1.default.model('ProductReview')
                .find({ product: this.product, status: 'approved' });
            const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
            await Product.findByIdAndUpdate(this.product, {
                'analytics.averageRating': avgRating,
                'analytics.reviewCount': reviews.length
            });
        }
        catch (error) {
            console.error('Error updating product analytics after review save:', error);
        }
    }
});
exports.default = mongoose_1.default.model('ProductReview', ProductReviewSchema);
//# sourceMappingURL=ProductReview.js.map