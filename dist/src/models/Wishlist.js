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
const WishlistItemSchema = new mongoose_1.Schema({
    product: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    variant: {
        type: String,
        sparse: true
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    notes: {
        type: String,
        maxlength: 200
    },
    priority: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    }
}, { _id: false });
const WishlistShareSchema = new mongoose_1.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    sharedWith: [{
            type: String,
            lowercase: true,
            match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        }],
    sharedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: Date,
    viewCount: {
        type: Number,
        default: 0
    }
}, { _id: false });
const WishlistSchema = new mongoose_1.Schema({
    // Owner
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Wishlist info
    name: {
        type: String,
        required: true,
        maxlength: 100,
        trim: true
    },
    description: {
        type: String,
        maxlength: 500,
        trim: true
    },
    isDefault: {
        type: Boolean,
        default: false,
        index: true
    },
    // Items
    items: [WishlistItemSchema],
    itemCount: {
        type: Number,
        default: 0,
        index: true
    },
    // Privacy and sharing
    isPrivate: {
        type: Boolean,
        default: true,
        index: true
    },
    sharing: WishlistShareSchema,
    // Display
    coverImage: String,
    color: {
        type: String,
        match: /^#[0-9A-F]{6}$/i,
        default: '#E91E63'
    },
    // Metadata
    lastViewedAt: Date
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});
// Indexes
WishlistSchema.index({ user: 1, name: 1 });
WishlistSchema.index({ user: 1, isDefault: 1 });
WishlistSchema.index({ 'sharing.token': 1 });
WishlistSchema.index({ 'sharing.isPublic': 1 });
WishlistSchema.index({ updatedAt: -1 });
// Compound index for items
WishlistSchema.index({ 'items.product': 1, 'items.variant': 1 });
// Ensure only one default wishlist per user
WishlistSchema.index({ user: 1, isDefault: 1 }, {
    unique: true,
    partialFilterExpression: { isDefault: true }
});
// Virtual for total value (requires population)
WishlistSchema.virtual('totalValue').get(function () {
    if (!this.populated('items.product')) {
        return 0;
    }
    return this.items.reduce((total, item) => {
        const product = item.product;
        return total + (product.price || 0);
    }, 0);
});
// Methods
WishlistSchema.methods.addItem = async function (productId, variantId, notes, priority = 3) {
    // Check if item already exists
    const existingIndex = this.items.findIndex((item) => item.product.toString() === productId &&
        item.variant === variantId);
    if (existingIndex !== -1) {
        // Update existing item
        this.items[existingIndex].notes = notes || this.items[existingIndex].notes;
        this.items[existingIndex].priority = priority;
    }
    else {
        // Add new item
        this.items.push({
            product: new mongoose_1.default.Types.ObjectId(productId),
            variant: variantId,
            addedAt: new Date(),
            notes,
            priority
        });
    }
    await this.updateItemCount();
};
WishlistSchema.methods.removeItem = async function (productId, variantId) {
    this.items = this.items.filter((item) => !(item.product.toString() === productId && item.variant === variantId));
    await this.updateItemCount();
};
WishlistSchema.methods.hasItem = function (productId, variantId) {
    return this.items.some((item) => item.product.toString() === productId && item.variant === variantId);
};
WishlistSchema.methods.generateShareToken = function () {
    const token = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    this.sharing = {
        token,
        isPublic: false,
        sharedWith: [],
        sharedAt: new Date(),
        viewCount: 0
    };
    return token;
};
WishlistSchema.methods.updateItemCount = async function () {
    this.itemCount = this.items.length;
    await this.save();
    // Update user's total wishlist items count
    try {
        const User = mongoose_1.default.model('User');
        const totalItems = await this.constructor.aggregate([
            { $match: { user: this.user } },
            { $group: { _id: null, total: { $sum: '$itemCount' } } }
        ]);
        const count = totalItems.length > 0 ? totalItems[0].total : 0;
        await User.findByIdAndUpdate(this.user, {
            'preferences.wishlistItemsCount': count
        });
    }
    catch (error) {
        console.error('Error updating user wishlist count:', error);
    }
};
// Pre-save hooks
WishlistSchema.pre('save', async function (next) {
    // Ensure user has only one default wishlist
    if (this.isDefault && this.isModified('isDefault')) {
        await this.constructor.updateMany({ user: this.user, _id: { $ne: this._id } }, { isDefault: false });
    }
    // Update item count if items changed
    if (this.isModified('items')) {
        this.itemCount = this.items.length;
    }
    next();
});
// Post-save hook to update product analytics
WishlistSchema.post('save', async function () {
    if (this.isModified('items')) {
        try {
            // Update favorite count for affected products
            const Product = mongoose_1.default.model('Product');
            for (const item of this.items) {
                const count = await this.constructor.countDocuments({
                    'items.product': item.product
                });
                await Product.findByIdAndUpdate(item.product, {
                    'analytics.favoriteCount': count
                });
            }
        }
        catch (error) {
            console.error('Error updating product favorite counts:', error);
        }
    }
});
exports.default = mongoose_1.default.model('Wishlist', WishlistSchema);
//# sourceMappingURL=Wishlist.js.map