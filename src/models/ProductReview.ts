import mongoose, { Document, Schema } from 'mongoose';

export interface IReviewImage {
  url: string;
  alt?: string;
  thumbnail?: string;
}

export interface IAdminResponse {
  response: string;
  respondedBy: mongoose.Types.ObjectId;
  respondedAt: Date;
}

export interface IProductReview extends Document {
  // Core review data (either user or customer must be present)
  user?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  product: mongoose.Types.ObjectId;
  orderId?: string; // Shopify order ID for verified purchases

  // Review content
  rating: number; // 1-5 stars
  title?: string;
  reviewText: string;
  images: IReviewImage[];
  pros?: string[];
  cons?: string[];
  wouldRecommend?: boolean;

  // Verification and status
  verifiedPurchase: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'spam';

  // Community interaction
  helpfulVotes: {
    helpful: mongoose.Types.ObjectId[];
    notHelpful: mongoose.Types.ObjectId[];
  };
  helpfulCount: number;
  reportCount: number;
  reportedBy: mongoose.Types.ObjectId[];
  reports?: Array<{
    userId?: mongoose.Types.ObjectId;
    reportedBy?: mongoose.Types.ObjectId;
    reason: string;
    description?: string;
    createdAt: Date;
  }>;

  // Admin moderation
  moderatedBy?: mongoose.Types.ObjectId;
  moderatedAt?: Date;
  moderationReason?: string;
  adminNotes?: string;
  adminResponse?: IAdminResponse;

  // Review metadata
  deviceInfo?: {
    platform: string;
    browser?: string;
    isMobile: boolean;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  updateHelpfulCount(): void;
  canBeEditedBy(userId: string): boolean;
  isSpam(): boolean;
}

const ReviewImageSchema = new Schema({
  url: { type: String, required: true },
  alt: String,
  thumbnail: String
}, { _id: false });

const AdminResponseSchema = new Schema({
  response: { type: String, required: true, maxlength: 1000 },
  respondedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  respondedAt: { type: Date, default: Date.now }
}, { _id: false });

const ProductReviewSchema = new Schema({
  // Core references (either user or customer must be present)
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,  // Made optional - either user or customer must be present
    index: true
  },
  customer: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: false,  // Either user or customer must be present
    index: true
  },
  product: { 
    type: Schema.Types.ObjectId, 
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
    helpful: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    notHelpful: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  helpfulCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
  reportedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  // Admin moderation
  moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
ProductReviewSchema.index({ customer: 1, createdAt: -1 });  // Index for customer reviews
ProductReviewSchema.index({ status: 1, moderatedAt: 1 });
ProductReviewSchema.index({ rating: 1, verifiedPurchase: 1 });
ProductReviewSchema.index({ helpfulCount: -1 });

// Ensure one review per user per product (unless multiple orders)
ProductReviewSchema.index({ user: 1, product: 1, orderId: 1 }, { unique: true, sparse: true });

// Ensure one review per customer per product (unless multiple orders)
ProductReviewSchema.index({ customer: 1, product: 1, orderId: 1 }, { unique: true, sparse: true });

// Pre-validate hook - Ensure user or customer is present
ProductReviewSchema.pre('validate', function(next) {
  const doc = this as any;
  if (!doc.user && !doc.customer) {
    next(new Error('ProductReview must have either user or customer'));
  } else {
    next();
  }
});

// Virtual for net helpful votes
ProductReviewSchema.virtual('netHelpfulVotes').get(function() {
  return this.helpfulVotes.helpful.length - this.helpfulVotes.notHelpful.length;
});

// Virtual for total votes
ProductReviewSchema.virtual('totalVotes').get(function() {
  return this.helpfulVotes.helpful.length + this.helpfulVotes.notHelpful.length;
});

// Methods
ProductReviewSchema.methods.updateHelpfulCount = function(): void {
  this.helpfulCount = this.helpfulVotes.helpful.length - this.helpfulVotes.notHelpful.length;
};

ProductReviewSchema.methods.canBeEditedBy = function(userId: string): boolean {
  // Users can edit their reviews within 24 hours of creation
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.user.toString() === userId && 
         this.createdAt > twentyFourHoursAgo && 
         this.status === 'approved';
};

ProductReviewSchema.methods.isSpam = function(): boolean {
  // Simple spam detection based on report count and helpful votes
  const reportRatio = this.reportCount / Math.max(1, this.totalVotes);
  return this.reportCount >= 5 || reportRatio > 0.3;
};

// Pre-save hooks
ProductReviewSchema.pre('save', function(next) {
  // Auto-detect spam
  if (this.isModified('reportCount') && (this as any).isSpam() && this.status === 'approved') {
    this.status = 'pending';
  }
  
  // Update helpful count
  if (this.isModified('helpfulVotes')) {
    (this as any).updateHelpfulCount();
  }
  
  next();
});

// Post-save hook to update product analytics
ProductReviewSchema.post('save', async function() {
  if (this.status === 'approved') {
    try {
      // Update product's average rating and review count
      const Product = mongoose.model('Product');
      const reviews = await mongoose.model('ProductReview')
        .find({ product: this.product, status: 'approved' });
      
      const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
      
      await Product.findByIdAndUpdate(this.product, {
        'analytics.averageRating': avgRating,
        'analytics.reviewCount': reviews.length
      });
    } catch (error) {
      console.error('Error updating product analytics after review save:', error);
    }
  }
});

export default mongoose.model<IProductReview>('ProductReview', ProductReviewSchema);