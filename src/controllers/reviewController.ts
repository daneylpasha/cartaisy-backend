import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ProductReview from '../models/ProductReview';
import Product from '../models/Product';
import Order from '../models/Order';

export const createReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const userId = req.user?._id?.toString();
    const {
      productId,
      rating,
      reviewText,
      title,
      images,
      pros,
      cons,
      wouldRecommend
    } = req.body;

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
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if user already reviewed this product
    const existingReview = await ProductReview.findOne({
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
    const purchaseOrder = await Order.findOne({
      user: userId,
      'lineItems.productId': productId,
      mobileStatus: 'delivered'
    });

    const verifiedPurchase = !!purchaseOrder;

    // Create review
    const review = new ProductReview({
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
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review'
    });
  }
};

export const getReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?._id?.toString();

    const review = await ProductReview.findById(reviewId)
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
  } catch (error) {
    console.error('Error fetching review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch review'
    });
  }
};

export const updateReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?._id?.toString();
    const {
      rating,
      reviewText,
      title,
      images,
      pros,
      cons,
      wouldRecommend
    } = req.body;

    const review = await ProductReview.findById(reviewId);

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
  } catch (error) {
    console.error('Error updating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review'
    });
  }
};

export const deleteReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const userId = req.user?._id?.toString();

    const review = await ProductReview.findById(reviewId);

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

    await ProductReview.findByIdAndDelete(reviewId);

    // Update product review statistics
    await updateProductReviewStats(productId);

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
};

export const voteOnReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const { voteType } = req.body; // 'helpful' or 'not_helpful'
    const userId = req.user?._id?.toString();

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

    const review = await ProductReview.findById(reviewId);

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

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Remove existing votes by this user
    review.helpfulVotes.helpful = review.helpfulVotes.helpful.filter(
      id => !id.equals(userObjectId)
    );
    review.helpfulVotes.notHelpful = review.helpfulVotes.notHelpful.filter(
      id => !id.equals(userObjectId)
    );

    // Add new vote
    if (voteType === 'helpful') {
      review.helpfulVotes.helpful.push(userObjectId);
    } else {
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
  } catch (error) {
    console.error('Error voting on review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record vote'
    });
  }
};

export const getUserReviews = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const userId = req.user?._id?.toString();
    const {
      page = 1,
      limit = 10,
      status = 'all'
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const filter: any = { user: userId };

    if (status !== 'all') {
      filter.status = status;
    }

    const reviews = await ProductReview.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate('product', 'title handle images price')
      .select('-adminNotes');

    const total = await ProductReview.countDocuments(filter);

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
  } catch (error) {
    console.error('Error fetching user reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

export const reportReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user?._id?.toString();

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

    const review = await ProductReview.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Check if user already reported this review
    const existingReport = review.reports.find(
      report => report.reportedBy.toString() === userId
    );

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this review'
      });
    }

    // Add report
    review.reports.push({
      reportedBy: new mongoose.Types.ObjectId(userId),
      reason,
      description: description?.trim(),
      createdAt: new Date()
    } as any);

    // Auto-flag as spam if multiple reports
    if (review.reports.length >= 3) {
      review.status = 'spam';
    }

    await review.save();

    res.json({
      success: true,
      message: 'Review reported successfully'
    });
  } catch (error) {
    console.error('Error reporting review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report review'
    });
  }
};

export const getReviewAnalytics = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { productId } = req.params;
    const { timeframe = '30' } = req.query;

    const days = parseInt(timeframe as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get rating distribution
    const ratingDistribution = await ProductReview.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
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
    const reviewsTrend = await ProductReview.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
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
    const verificationStats = await ProductReview.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
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
    const sentimentStats = await ProductReview.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
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
  } catch (error) {
    console.error('Error fetching review analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
};

// Admin functions
export const moderateReview = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { reviewId } = req.params;
    const { action, adminNotes, response } = req.body; // action: 'approve', 'reject', 'spam'
    const adminId = req.user?._id?.toString();

    if (!['approve', 'reject', 'spam'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid moderation action'
      });
    }

    const review = await ProductReview.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'spam';
    review.adminNotes = adminNotes;
    review.moderatedAt = new Date();
    review.moderatedBy = new mongoose.Types.ObjectId(adminId);

    // Add admin response if provided
    if (response && action === 'approve') {
      review.adminResponse = {
        response: response.trim(),
        respondedBy: new mongoose.Types.ObjectId(adminId),
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
  } catch (error) {
    console.error('Error moderating review:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to moderate review'
    });
  }
};

// Helper function to update product review statistics
async function updateProductReviewStats(productId: string) {
  try {
    const stats = await ProductReview.aggregate([
      {
        $match: {
          product: new mongoose.Types.ObjectId(productId),
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

    await Product.findByIdAndUpdate(productId, {
      'reviews.count': reviewStats.totalReviews,
      'reviews.averageRating': Math.round(reviewStats.averageRating * 10) / 10,
      'reviews.totalRating': reviewStats.totalRating
    });
  } catch (error) {
    console.error('Error updating product review stats:', error);
  }
}