import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ProductReview from '../models/ProductReview';
import Product from '../models/Product';
import Order from '../models/Order';
import { CustomerInfo } from '../middleware/customerAuth';

// Extend Request to include customer info from authenticateCustomer middleware
interface CustomerRequest extends Request {
  customer: CustomerInfo;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if customer has purchased the product
 */
const hasCustomerPurchased = async (customerId: string, productId: string): Promise<boolean> => {
  const order = await Order.findOne({
    customer: customerId,
    'lineItems.productId': productId,
    'mobileStatus.current': 'delivered'
  });
  return !!order;
};

/**
 * Check if within edit window (30 days)
 */
const isWithinEditWindow = (reviewDate: Date, windowDays: number = 30): boolean => {
  const now = new Date();
  const diffMs = now.getTime() - reviewDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= windowDays;
};

/**
 * Update product review statistics
 */
const updateProductReviewStats = async (productId: string): Promise<void> => {
  try {
    const reviews = await ProductReview.find({
      product: productId,
      status: 'approved'
    });

    if (reviews.length > 0) {
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      await Product.findByIdAndUpdate(productId, {
        'analytics.averageRating': Math.round(avgRating * 10) / 10,
        'analytics.reviewCount': reviews.length
      });
    } else {
      await Product.findByIdAndUpdate(productId, {
        'analytics.averageRating': 0,
        'analytics.reviewCount': 0
      });
    }
  } catch (error) {
    console.error('Error updating product review stats:', error);
  }
};

// =============================================================================
// CONTROLLER FUNCTIONS
// =============================================================================

/**
 * Create a new product review
 */
export const createReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const {
      productId,
      rating,
      title,
      comment,
      reviewText, // Support both 'comment' and 'reviewText'
      images,
      wouldRecommend
    } = req.body;

    const reviewContent = comment || reviewText;

    // Validate required fields
    if (!productId || !rating || !reviewContent) {
      res.status(400).json({
        status: 'error',
        message: 'Product ID, rating, and comment are required'
      });
      return;
    }

    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      res.status(400).json({
        status: 'error',
        message: 'Rating must be an integer between 1 and 5'
      });
      return;
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      res.status(404).json({
        status: 'error',
        message: 'Product not found'
      });
      return;
    }

    // Check if customer already reviewed this product
    const existingReview = await ProductReview.findOne({
      customer: customerId,
      product: productId
    });

    if (existingReview) {
      res.status(409).json({
        status: 'error',
        message: 'You have already reviewed this product'
      });
      return;
    }

    // Check if customer purchased this product (for verified purchase badge)
    const verifiedPurchase = await hasCustomerPurchased(customerId, productId);

    // Process images
    const processedImages = (images || []).map((img: any) => {
      if (typeof img === 'string') {
        return { url: img };
      }
      return img;
    });

    // Create review
    const review = new ProductReview({
      customer: customerId,
      product: productId,
      rating,
      title: title?.trim(),
      reviewText: reviewContent.trim(),
      images: processedImages,
      verifiedPurchase,
      status: 'approved', // Auto-approve for now, can be changed to 'pending' for moderation
      helpfulVotes: {
        helpful: [],
        notHelpful: []
      },
      deviceInfo: {
        platform: 'mobile',
        isMobile: true
      }
    });

    await review.save();

    // Update product review statistics
    await updateProductReviewStats(productId);

    res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          title: review.title,
          comment: review.reviewText,
          verifiedPurchase: review.verifiedPurchase,
          status: review.status,
          createdAt: review.createdAt
        }
      }
    });
  } catch (error: any) {
    console.error('Create customer review error:', error);

    // Handle duplicate key error
    if (error.code === 11000) {
      res.status(409).json({
        status: 'error',
        message: 'You have already reviewed this product'
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to create review'
    });
  }
};

/**
 * Get all reviews by the authenticated customer
 */
export const getReviews = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const {
      status,
      limit = '20',
      page = '1'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = { customer: customerId };
    if (status && status !== 'all') {
      filter.status = status;
    }

    // Fetch reviews
    const [reviews, total] = await Promise.all([
      ProductReview.find(filter)
        .populate('product', 'title handle images price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProductReview.countDocuments(filter)
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        reviews: reviews.map((review: any) => ({
          id: review._id,
          rating: review.rating,
          title: review.title,
          comment: review.reviewText,
          images: review.images,
          verifiedPurchase: review.verifiedPurchase,
          status: review.status,
          helpfulCount: review.helpfulCount || 0,
          product: review.product,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt
        })),
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
          limit: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Get customer reviews error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch reviews'
    });
  }
};

/**
 * Get a specific review by ID
 */
export const getReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { reviewId } = req.params;

    const review = await ProductReview.findOne({
      _id: reviewId,
      customer: customerId
    })
      .populate('product', 'title handle images price')
      .lean();

    if (!review) {
      res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          title: review.title,
          comment: review.reviewText,
          images: review.images,
          verifiedPurchase: review.verifiedPurchase,
          status: review.status,
          helpfulCount: review.helpfulCount || 0,
          product: review.product,
          adminResponse: review.adminResponse,
          createdAt: review.createdAt,
          updatedAt: review.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get customer review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch review'
    });
  }
};

/**
 * Update a review
 */
export const updateReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { reviewId } = req.params;
    const {
      rating,
      title,
      comment,
      reviewText,
      images,
      wouldRecommend
    } = req.body;

    const review = await ProductReview.findOne({
      _id: reviewId,
      customer: customerId
    });

    if (!review) {
      res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
      return;
    }

    // Check if within edit window (30 days)
    if (!isWithinEditWindow(review.createdAt)) {
      res.status(403).json({
        status: 'error',
        message: 'Reviews can only be edited within 30 days of creation'
      });
      return;
    }

    // Check if review status allows editing
    if (review.status === 'rejected' || review.status === 'spam') {
      res.status(403).json({
        status: 'error',
        message: 'Cannot edit rejected or spam reviews'
      });
      return;
    }

    // Update fields
    if (rating !== undefined) {
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        res.status(400).json({
          status: 'error',
          message: 'Rating must be an integer between 1 and 5'
        });
        return;
      }
      review.rating = rating;
    }

    const newContent = comment || reviewText;
    if (newContent !== undefined) {
      review.reviewText = newContent.trim();
    }

    if (title !== undefined) {
      review.title = title?.trim();
    }

    if (images !== undefined) {
      review.images = (images || []).map((img: any) => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return img;
      });
    }

    await review.save();

    // Update product review statistics if rating changed
    if (rating !== undefined) {
      await updateProductReviewStats(review.product.toString());
    }

    res.status(200).json({
      status: 'success',
      message: 'Review updated successfully',
      data: {
        review: {
          id: review._id,
          rating: review.rating,
          title: review.title,
          comment: review.reviewText,
          images: review.images,
          status: review.status,
          updatedAt: review.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update customer review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update review'
    });
  }
};

/**
 * Delete a review
 */
export const deleteReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { reviewId } = req.params;

    const review = await ProductReview.findOne({
      _id: reviewId,
      customer: customerId
    });

    if (!review) {
      res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
      return;
    }

    const productId = review.product.toString();

    await ProductReview.findByIdAndDelete(reviewId);

    // Update product review statistics
    await updateProductReviewStats(productId);

    res.status(200).json({
      status: 'success',
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete review'
    });
  }
};

/**
 * Vote on a review (helpful or not helpful)
 */
export const voteReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { reviewId } = req.params;
    const { voteType } = req.body;

    if (!voteType || !['helpful', 'not-helpful', 'not_helpful'].includes(voteType)) {
      res.status(400).json({
        status: 'error',
        message: 'Vote type must be "helpful" or "not-helpful"'
      });
      return;
    }

    const review = await ProductReview.findById(reviewId);

    if (!review) {
      res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
      return;
    }

    // Check if review is approved
    if (review.status !== 'approved') {
      res.status(403).json({
        status: 'error',
        message: 'Can only vote on approved reviews'
      });
      return;
    }

    // Can't vote on own review
    if (review.customer?.toString() === customerId) {
      res.status(403).json({
        status: 'error',
        message: 'Cannot vote on your own review'
      });
      return;
    }

    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    // Check if customer already voted
    const hasVotedHelpful = review.helpfulVotes.helpful.some(
      (id: mongoose.Types.ObjectId) => id.toString() === customerId
    );
    const hasVotedNotHelpful = review.helpfulVotes.notHelpful.some(
      (id: mongoose.Types.ObjectId) => id.toString() === customerId
    );

    // Remove previous vote if exists
    if (hasVotedHelpful) {
      review.helpfulVotes.helpful = review.helpfulVotes.helpful.filter(
        (id: mongoose.Types.ObjectId) => id.toString() !== customerId
      );
    }
    if (hasVotedNotHelpful) {
      review.helpfulVotes.notHelpful = review.helpfulVotes.notHelpful.filter(
        (id: mongoose.Types.ObjectId) => id.toString() !== customerId
      );
    }

    // Add new vote
    const isHelpful = voteType === 'helpful';
    if (isHelpful) {
      review.helpfulVotes.helpful.push(customerObjectId);
    } else {
      review.helpfulVotes.notHelpful.push(customerObjectId);
    }

    // Update helpful count
    review.helpfulCount = review.helpfulVotes.helpful.length - review.helpfulVotes.notHelpful.length;

    await review.save();

    res.status(200).json({
      status: 'success',
      message: 'Vote recorded',
      data: {
        helpfulCount: review.helpfulVotes.helpful.length,
        notHelpfulCount: review.helpfulVotes.notHelpful.length,
        netHelpfulCount: review.helpfulCount
      }
    });
  } catch (error) {
    console.error('Vote on review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to record vote'
    });
  }
};

/**
 * Report a review
 */
export const reportReview = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { reviewId } = req.params;
    const { reason, details } = req.body;

    if (!reason) {
      res.status(400).json({
        status: 'error',
        message: 'Report reason is required'
      });
      return;
    }

    const validReasons = ['spam', 'offensive', 'fake', 'inappropriate', 'other'];
    if (!validReasons.includes(reason)) {
      res.status(400).json({
        status: 'error',
        message: `Invalid reason. Must be one of: ${validReasons.join(', ')}`
      });
      return;
    }

    const review = await ProductReview.findById(reviewId);

    if (!review) {
      res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
      return;
    }

    // Can't report own review
    if (review.customer?.toString() === customerId) {
      res.status(403).json({
        status: 'error',
        message: 'Cannot report your own review'
      });
      return;
    }

    const customerObjectId = new mongoose.Types.ObjectId(customerId);

    // Check if customer already reported this review
    const alreadyReported = review.reportedBy.some(
      (id: mongoose.Types.ObjectId) => id.toString() === customerId
    );

    if (alreadyReported) {
      res.status(409).json({
        status: 'error',
        message: 'You have already reported this review'
      });
      return;
    }

    // Add report
    review.reportedBy.push(customerObjectId);
    review.reportCount = review.reportedBy.length;

    // Auto-flag for moderation if report count is high
    if (review.reportCount >= 3 && review.status === 'approved') {
      review.status = 'pending';
    }

    await review.save();

    res.status(200).json({
      status: 'success',
      message: 'Review reported successfully. Our team will investigate.'
    });
  } catch (error) {
    console.error('Report review error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to report review'
    });
  }
};
