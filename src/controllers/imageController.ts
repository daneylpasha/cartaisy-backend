import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { ImageUsage, IMAGE_LIMITS, IImage } from '../models/ImageUsage';
import { cloudinaryService } from '../services/cloudinaryService';

/**
 * Get image usage for a store
 * GET /api/v1/notifications/stores/:storeId/images/usage
 */
export const getImageUsage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    let usage = await ImageUsage.findOne({
      storeId: new mongoose.Types.ObjectId(storeId)
    });

    // Create if doesn't exist
    if (!usage) {
      usage = await ImageUsage.create({
        storeId: new mongoose.Types.ObjectId(storeId),
        imageCount: 0,
        totalSize: 0,
        images: [],
        tier: 'free',
        limit: IMAGE_LIMITS.free
      });
    }

    res.json({
      status: 'success',
      data: {
        used: usage.imageCount,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.imageCount),
        tier: usage.tier,
        totalSize: usage.totalSize,
        images: usage.images.map(img => ({
          id: (img as any)._id.toString(),
          publicId: img.publicId,
          url: img.secureUrl,
          size: img.size,
          usedIn: img.usedIn,
          createdAt: img.createdAt.toISOString()
        }))
      }
    });
  } catch (error) {
    console.error('Get image usage error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch image usage',
    });
  }
};

/**
 * Get upload signature for client-side upload
 * GET /api/v1/notifications/stores/:storeId/images/signature
 */
export const getUploadSignature = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Check if Cloudinary is configured
    if (!cloudinaryService.isConfigured()) {
      res.status(503).json({
        status: 'error',
        message: 'Image upload service not configured',
      });
      return;
    }

    // Check usage
    let usage = await ImageUsage.findOne({
      storeId: new mongoose.Types.ObjectId(storeId)
    });

    if (!usage) {
      usage = await ImageUsage.create({
        storeId: new mongoose.Types.ObjectId(storeId),
        imageCount: 0,
        totalSize: 0,
        images: [],
        tier: 'free',
        limit: IMAGE_LIMITS.free
      });
    }

    const canUpload = usage.imageCount < usage.limit;
    const remaining = Math.max(0, usage.limit - usage.imageCount);

    if (!canUpload) {
      console.log(`🖼️ [IMAGE] Store ${storeId} at image limit (${usage.imageCount}/${usage.limit})`);
    }

    const signature = cloudinaryService.generateSignature(storeId);

    res.json({
      status: 'success',
      data: {
        ...signature,
        canUpload,
        remaining
      }
    });
  } catch (error) {
    console.error('Get upload signature error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate upload signature',
    });
  }
};

/**
 * Register an uploaded image (called after client-side upload)
 * POST /api/v1/notifications/stores/:storeId/images/register
 */
export const registerImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { publicId, url, secureUrl, size, width, height, format } = req.body;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validation
    if (!publicId || !url || !secureUrl || !size) {
      res.status(400).json({
        status: 'error',
        message: 'publicId, url, secureUrl, and size are required',
      });
      return;
    }

    // Get or create usage record
    let usage = await ImageUsage.findOne({
      storeId: new mongoose.Types.ObjectId(storeId)
    });

    if (!usage) {
      usage = await ImageUsage.create({
        storeId: new mongoose.Types.ObjectId(storeId),
        imageCount: 0,
        totalSize: 0,
        images: [],
        tier: 'free',
        limit: IMAGE_LIMITS.free
      });
    }

    // Check limit
    if (usage.imageCount >= usage.limit) {
      // Delete the uploaded image since they're over limit
      await cloudinaryService.deleteImage(publicId);
      res.status(400).json({
        status: 'error',
        message: `Image limit reached (${usage.limit}). Please delete unused images or upgrade your plan.`,
      });
      return;
    }

    // Check for duplicate
    const exists = usage.images.some(img => img.publicId === publicId);
    if (exists) {
      res.status(400).json({
        status: 'error',
        message: 'Image already registered',
      });
      return;
    }

    // Add image to usage
    const newImage: IImage = {
      publicId,
      url,
      secureUrl,
      size,
      width,
      height,
      format,
      usedIn: 'unused',
      createdAt: new Date()
    };

    usage.images.push(newImage);
    usage.imageCount = usage.images.length;
    usage.totalSize += size;
    await usage.save();

    console.log(`🖼️ [IMAGE] Registered for store ${storeId}: ${publicId} (${usage.imageCount}/${usage.limit})`);

    const savedImage = usage.images[usage.images.length - 1];

    res.status(201).json({
      status: 'success',
      data: {
        image: {
          id: (savedImage as any)._id.toString(),
          publicId: savedImage.publicId,
          url: savedImage.secureUrl,
          size: savedImage.size,
          usedIn: savedImage.usedIn,
          createdAt: savedImage.createdAt.toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Register image error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to register image',
    });
  }
};

/**
 * Mark image as used in template or notification
 * POST /api/v1/notifications/stores/:storeId/images/:imageId/use
 */
export const markImageUsed = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, imageId } = req.params;
    const { usedIn, referenceId } = req.body;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validation
    if (!usedIn || !['template', 'notification'].includes(usedIn)) {
      res.status(400).json({
        status: 'error',
        message: 'usedIn must be "template" or "notification"',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(imageId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid image ID',
      });
      return;
    }

    const updateData: any = {
      'images.$.usedIn': usedIn,
    };

    if (referenceId && mongoose.Types.ObjectId.isValid(referenceId)) {
      updateData['images.$.referenceId'] = new mongoose.Types.ObjectId(referenceId);
    }

    const result = await ImageUsage.updateOne(
      {
        storeId: new mongoose.Types.ObjectId(storeId),
        'images._id': new mongoose.Types.ObjectId(imageId)
      },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      res.status(404).json({
        status: 'error',
        message: 'Image not found',
      });
      return;
    }

    res.json({
      status: 'success',
      message: 'Image marked as used',
    });
  } catch (error) {
    console.error('Mark image used error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to mark image as used',
    });
  }
};

/**
 * Delete an image
 * DELETE /api/v1/notifications/stores/:storeId/images/:imageId
 */
export const deleteImage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId, imageId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(imageId)) {
      res.status(400).json({
        status: 'error',
        message: 'Invalid image ID',
      });
      return;
    }

    const usage = await ImageUsage.findOne({
      storeId: new mongoose.Types.ObjectId(storeId)
    });

    if (!usage) {
      res.status(404).json({
        status: 'error',
        message: 'Image usage record not found',
      });
      return;
    }

    const imageIndex = usage.images.findIndex(
      img => (img as any)._id.toString() === imageId
    );

    if (imageIndex === -1) {
      res.status(404).json({
        status: 'error',
        message: 'Image not found',
      });
      return;
    }

    const image = usage.images[imageIndex];

    // Delete from Cloudinary
    await cloudinaryService.deleteImage(image.publicId);

    // Remove from database
    usage.images.splice(imageIndex, 1);
    usage.imageCount = usage.images.length;
    usage.totalSize -= image.size;
    await usage.save();

    console.log(`🖼️ [IMAGE] Deleted for store ${storeId}: ${image.publicId}`);

    res.json({
      status: 'success',
      message: 'Image deleted successfully',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete image',
    });
  }
};

/**
 * Get all images for a store (for image picker)
 * GET /api/v1/notifications/stores/:storeId/images
 */
export const getImages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { storeId } = req.params;

    // Security check
    if (req.storeId?.toString() !== storeId) {
      res.status(403).json({
        status: 'error',
        message: 'Access denied',
      });
      return;
    }

    const usage = await ImageUsage.findOne({
      storeId: new mongoose.Types.ObjectId(storeId)
    });

    if (!usage) {
      res.json({
        status: 'success',
        data: {
          images: [],
          total: 0
        }
      });
      return;
    }

    res.json({
      status: 'success',
      data: {
        images: usage.images.map(img => ({
          id: (img as any)._id.toString(),
          publicId: img.publicId,
          url: img.secureUrl,
          size: img.size,
          width: img.width,
          height: img.height,
          usedIn: img.usedIn,
          createdAt: img.createdAt.toISOString()
        })),
        total: usage.images.length
      }
    });
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch images',
    });
  }
};
