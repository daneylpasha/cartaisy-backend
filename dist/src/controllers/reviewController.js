"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moderateReview = exports.getReviewAnalytics = exports.reportReview = exports.getUserReviews = exports.voteOnReview = exports.deleteReview = exports.updateReview = exports.getReview = exports.createReview = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ProductReview_1 = __importDefault(require("../models/ProductReview"));
const Product_1 = __importDefault(require("../models/Product"));
const Order_1 = __importDefault(require("../models/Order"));
const createReview = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { productId, rating, reviewText, title, images, pros, cons, wouldRecommend } = req.body;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        // Validate required fields
        if (!productId || !rating || !reviewText) {
            return res.status(400).json({
                success: false,
                message: 'Product ID, rating, and review text are required'
            });
        }
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }
        // Check if product exists
        const product = await Product_1.default.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
        // Check if user already reviewed this product
        const existingReview = await ProductReview_1.default.findOne({
            user: userId,
            product: productId
        });
        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }
        // Check if user purchased this product (for verified purchase)
        const purchaseOrder = await Order_1.default.findOne({
            user: userId,
            'lineItems.productId': productId,
            mobileStatus: 'delivered'
        });
        const verifiedPurchase = !!purchaseOrder;
        // Create review
        const review = new ProductReview_1.default({
            user: userId,
            product: productId,
            rating,
            reviewText: reviewText.trim(),
            title: title?.trim(),
            images: images || [],
            pros: pros || [],
            cons: cons || [],
            wouldRecommend,
            verifiedPurchase,
            status: 'pending', // All reviews start as pending for moderation
            helpfulVotes: {
                helpful: [],
                notHelpful: []
            }
        });
        await review.save();
        // Update product review statistics
        await updateProductReviewStats(productId);
        res.status(201).json({
            success: true,
            data: {
                review: {
                    id: review._id,
                    rating: review.rating,
                    reviewText: review.reviewText,
                    title: review.title,
                    verifiedPurchase: review.verifiedPurchase,
                    status: review.status,
                    createdAt: review.createdAt
                }
            },
            message: 'Review submitted successfully and is pending moderation'
        });
    }
    catch (error) {
        console.error('Error creating review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create review'
        });
    }
};
exports.createReview = createReview;
const getReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user?.id;
        const review = await ProductReview_1.default.findById(reviewId)
            .populate('user', 'name avatar')
            .populate('product', 'title handle images')
            .populate('adminResponse.respondedBy', 'name');
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        // Only show pending/rejected reviews to the author or admin
        if (review.status !== 'approved' && review.user._id.toString() !== userId) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        res.json({
            success: true,
            data: {
                review
            }
        });
    }
    catch (error) {
        console.error('Error fetching review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch review'
        });
    }
};
exports.getReview = getReview;
const updateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user?.id;
        const { rating, reviewText, title, images, pros, cons, wouldRecommend } = req.body;
        const review = await ProductReview_1.default.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        if (review.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        // Only allow editing of pending or approved reviews
        if (review.status === 'rejected' || review.status === 'spam') {
            return res.status(400).json({
                success: false,
                message: 'Cannot edit rejected or spam reviews'
            });
        }
        // Update fields
        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Rating must be between 1 and 5'
                });
            }
            review.rating = rating;
        }
        if (reviewText !== undefined) {
            review.reviewText = reviewText.trim();
        }
        if (title !== undefined) {
            review.title = title?.trim();
        }
        if (images !== undefined) {
            review.images = images;
        }
        if (pros !== undefined) {
            review.pros = pros;
        }
        if (cons !== undefined) {
            review.cons = cons;
        }
        if (wouldRecommend !== undefined) {
            review.wouldRecommend = wouldRecommend;
        }
        // If review was already approved, set it back to pending for re-moderation
        if (review.status === 'approved') {
            review.status = 'pending';
        }
        review.updatedAt = new Date();
        await review.save();
        // Update product review statistics if rating changed
        if (rating !== undefined) {
            await updateProductReviewStats(review.product.toString());
        }
        res.json({
            success: true,
            data: {
                review
            },
            message: review.status === 'pending' ? 'Review updated and is pending moderation' : 'Review updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update review'
        });
    }
};
exports.updateReview = updateReview;
const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user?.id;
        const review = await ProductReview_1.default.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        if (review.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        const productId = review.product.toString();
        await ProductReview_1.default.findByIdAndDelete(reviewId);
        // Update product review statistics
        await updateProductReviewStats(productId);
        res.json({
            success: true,
            message: 'Review deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete review'
        });
    }
};
exports.deleteReview = deleteReview;
const voteOnReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { voteType } = req.body; // 'helpful' or 'not_helpful'
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        if (!['helpful', 'not_helpful'].includes(voteType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid vote type'
            });
        }
        const review = await ProductReview_1.default.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        if (review.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Cannot vote on unapproved reviews'
            });
        }
        // Cannot vote on own review
        if (review.user.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot vote on your own review'
            });
        }
        const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
        // Remove existing votes by this user
        review.helpfulVotes.helpful = review.helpfulVotes.helpful.filter(id => !id.equals(userObjectId));
        review.helpfulVotes.notHelpful = review.helpfulVotes.notHelpful.filter(id => !id.equals(userObjectId));
        // Add new vote
        if (voteType === 'helpful') {
            review.helpfulVotes.helpful.push(userObjectId);
        }
        else {
            review.helpfulVotes.notHelpful.push(userObjectId);
        }
        await review.save();
        res.json({
            success: true,
            data: {
                helpfulCount: review.helpfulVotes.helpful.length,
                notHelpfulCount: review.helpfulVotes.notHelpful.length,
                userVote: voteType
            },
            message: 'Vote recorded successfully'
        });
    }
    catch (error) {
        console.error('Error voting on review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record vote'
        });
    }
};
exports.voteOnReview = voteOnReview;
const getUserReviews = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { page = 1, limit = 10, status = 'all' } = req.query;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;
        const filter = { user: userId };
        if (status !== 'all') {
            filter.status = status;
        }
        const reviews = await ProductReview_1.default.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('product', 'title handle images price')
            .select('-adminNotes');
        const total = await ProductReview_1.default.countDocuments(filter);
        res.json({
            success: true,
            data: {
                reviews,
                pagination: {
                    current: pageNum,
                    total: Math.ceil(total / limitNum),
                    count: reviews.length,
                    totalReviews: total
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching user reviews:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews'
        });
    }
};
exports.getUserReviews = getUserReviews;
const reportReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { reason, description } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Report reason is required'
            });
        }
        const review = await ProductReview_1.default.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        // Check if user already reported this review
        const existingReport = review.reports.find(report => report.reportedBy.toString() === userId);
        if (existingReport) {
            return res.status(400).json({
                success: false,
                message: 'You have already reported this review'
            });
        }
        // Add report
        review.reports.push({
            reportedBy: new mongoose_1.default.Types.ObjectId(userId),
            reason,
            description: description?.trim(),
            reportedAt: new Date()
        });
        // Auto-flag as spam if multiple reports
        if (review.reports.length >= 3) {
            review.status = 'spam';
        }
        await review.save();
        res.json({
            success: true,
            message: 'Review reported successfully'
        });
    }
    catch (error) {
        console.error('Error reporting review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to report review'
        });
    }
};
exports.reportReview = reportReview;
const getReviewAnalytics = async (req, res) => {
    try {
        const { productId } = req.params;
        const { timeframe = '30' } = req.query;
        const days = parseInt(timeframe);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        // Get rating distribution
        const ratingDistribution = await ProductReview_1.default.aggregate([
            {
                $match: {
                    product: new mongoose_1.default.Types.ObjectId(productId),
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$rating',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: -1 }
            }
        ]);
        // Get recent reviews trend
        const reviewsTrend = await ProductReview_1.default.aggregate([
            {
                $match: {
                    product: new mongoose_1.default.Types.ObjectId(productId),
                    status: 'approved',
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt'
                        }
                    },
                    count: { $sum: 1 },
                    avgRating: { $avg: '$rating' }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);
        // Get verification stats
        const verificationStats = await ProductReview_1.default.aggregate([
            {
                $match: {
                    product: new mongoose_1.default.Types.ObjectId(productId),
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: '$verifiedPurchase',
                    count: { $sum: 1 },
                    avgRating: { $avg: '$rating' }
                }
            }
        ]);
        // Get sentiment analysis
        const sentimentStats = await ProductReview_1.default.aggregate([
            {
                $match: {
                    product: new mongoose_1.default.Types.ObjectId(productId),
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: null,
                    totalReviews: { $sum: 1 },
                    positiveReviews: {
                        $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] }
                    },
                    neutralReviews: {
                        $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] }
                    },
                    negativeReviews: {
                        $sum: { $cond: [{ $lte: ['$rating', 2] }, 1, 0] }
                    },
                    averageRating: { $avg: '$rating' },
                    recommendationRate: {
                        $avg: { $cond: ['$wouldRecommend', 1, 0] }
                    }
                }
            }
        ]);
        res.json({
            success: true,
            data: {
                ratingDistribution,
                reviewsTrend,
                verificationStats,
                sentiment: sentimentStats[0] || {
                    totalReviews: 0,
                    positiveReviews: 0,
                    neutralReviews: 0,
                    negativeReviews: 0,
                    averageRating: 0,
                    recommendationRate: 0
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching review analytics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics'
        });
    }
};
exports.getReviewAnalytics = getReviewAnalytics;
// Admin functions
const moderateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { action, adminNotes, response } = req.body; // action: 'approve', 'reject', 'spam'
        const adminId = req.user?.id;
        if (!['approve', 'reject', 'spam'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid moderation action'
            });
        }
        const review = await ProductReview_1.default.findById(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }
        review.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'spam';
        review.adminNotes = adminNotes;
        review.moderatedAt = new Date();
        review.moderatedBy = new mongoose_1.default.Types.ObjectId(adminId);
        // Add admin response if provided
        if (response && action === 'approve') {
            review.adminResponse = {
                responseText: response.trim(),
                respondedBy: new mongoose_1.default.Types.ObjectId(adminId),
                respondedAt: new Date()
            };
        }
        await review.save();
        // Update product review statistics if approved
        if (action === 'approve') {
            await updateProductReviewStats(review.product.toString());
        }
        res.json({
            success: true,
            data: {
                review
            },
            message: `Review ${action}d successfully`
        });
    }
    catch (error) {
        console.error('Error moderating review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to moderate review'
        });
    }
};
exports.moderateReview = moderateReview;
// Helper function to update product review statistics
async function updateProductReviewStats(productId) {
    try {
        const stats = await ProductReview_1.default.aggregate([
            {
                $match: {
                    product: new mongoose_1.default.Types.ObjectId(productId),
                    status: 'approved'
                }
            },
            {
                $group: {
                    _id: null,
                    totalReviews: { $sum: 1 },
                    averageRating: { $avg: '$rating' },
                    totalRating: { $sum: '$rating' }
                }
            }
        ]);
        const reviewStats = stats[0] || {
            totalReviews: 0,
            averageRating: 0,
            totalRating: 0
        };
        await Product_1.default.findByIdAndUpdate(productId, {
            'reviews.count': reviewStats.totalReviews,
            'reviews.averageRating': Math.round(reviewStats.averageRating * 10) / 10,
            'reviews.totalRating': reviewStats.totalRating
        });
    }
    catch (error) {
        console.error('Error updating product review stats:', error);
    }
}
//# sourceMappingURL=reviewController.js.map