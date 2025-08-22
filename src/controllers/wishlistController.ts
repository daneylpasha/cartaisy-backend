import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Wishlist from '../models/Wishlist';
import Product from '../models/Product';

export const getUserWishlists = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const wishlists = await Wishlist.find({ user: userId })
      .sort({ isDefault: -1, updatedAt: -1 })
      .select('name description itemCount isDefault coverImage color lastViewedAt createdAt');

    res.json({
      success: true,
      data: {
        wishlists
      }
    });
  } catch (error) {
    console.error('Error fetching user wishlists:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlists'
    });
  }
};

export const getWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId } = req.params;
    const userId = req.user?.id;

    const wishlist = await Wishlist.findById(wishlistId)
      .populate({
        path: 'items.product',
        select: 'title handle price images vendor inventoryTracking.totalQuantity reviews.averageRating status',
        populate: {
          path: 'category',
          select: 'name slug'
        }
      });

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Check access permissions
    if (wishlist.isPrivate && wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update last viewed for owner
    if (wishlist.user.toString() === userId) {
      wishlist.lastViewedAt = new Date();
      await wishlist.save();
    }

    // Filter out inactive products
    const activeItems = wishlist.items.filter(item => {
      const product = item.product as any;
      return product && product.status === 'active';
    });

    res.json({
      success: true,
      data: {
        wishlist: {
          ...wishlist.toObject(),
          items: activeItems
        },
        totalValue: wishlist.totalValue,
        isOwner: wishlist.user.toString() === userId
      }
    });
  } catch (error) {
    console.error('Error fetching wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist'
    });
  }
};

export const createWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, description, isPrivate = true, color } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Wishlist name is required'
      });
    }

    // Check if user already has a wishlist with this name
    const existingWishlist = await Wishlist.findOne({
      user: userId,
      name: name.trim()
    });

    if (existingWishlist) {
      return res.status(400).json({
        success: false,
        message: 'A wishlist with this name already exists'
      });
    }

    // Check if this should be the default wishlist
    const userWishlistCount = await Wishlist.countDocuments({ user: userId });
    const isDefault = userWishlistCount === 0;

    const wishlist = new Wishlist({
      user: userId,
      name: name.trim(),
      description: description?.trim(),
      isPrivate,
      isDefault,
      color: color || '#E91E63',
      items: []
    });

    await wishlist.save();

    res.status(201).json({
      success: true,
      data: {
        wishlist
      }
    });
  } catch (error) {
    console.error('Error creating wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create wishlist'
    });
  }
};

export const updateWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId } = req.params;
    const userId = req.user?.id;
    const { name, description, isPrivate, color, isDefault } = req.body;

    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Update allowed fields
    if (name !== undefined) {
      // Check for duplicate name
      if (name !== wishlist.name) {
        const existingWishlist = await Wishlist.findOne({
          user: userId,
          name: name.trim(),
          _id: { $ne: wishlistId }
        });

        if (existingWishlist) {
          return res.status(400).json({
            success: false,
            message: 'A wishlist with this name already exists'
          });
        }
      }
      wishlist.name = name.trim();
    }

    if (description !== undefined) {
      wishlist.description = description?.trim();
    }

    if (isPrivate !== undefined) {
      wishlist.isPrivate = isPrivate;
    }

    if (color !== undefined) {
      wishlist.color = color;
    }

    if (isDefault !== undefined) {
      wishlist.isDefault = isDefault;
    }

    await wishlist.save();

    res.json({
      success: true,
      data: {
        wishlist
      }
    });
  } catch (error) {
    console.error('Error updating wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wishlist'
    });
  }
};

export const deleteWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId } = req.params;
    const userId = req.user?.id;

    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Don't allow deletion of default wishlist if it's the only one
    if (wishlist.isDefault) {
      const userWishlistCount = await Wishlist.countDocuments({ user: userId });
      if (userWishlistCount === 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your only wishlist'
        });
      }

      // If deleting default wishlist, make another one default
      await Wishlist.findOneAndUpdate(
        { user: userId, _id: { $ne: wishlistId } },
        { isDefault: true }
      );
    }

    await Wishlist.findByIdAndDelete(wishlistId);

    res.json({
      success: true,
      message: 'Wishlist deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete wishlist'
    });
  }
};

export const addToWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId } = req.params;
    const userId = req.user?.id;
    const { productId, variantId, notes, priority = 3 } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Verify product exists and is active
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }

    let wishlist;

    if (wishlistId === 'default') {
      // Add to default wishlist
      wishlist = await Wishlist.findOne({ user: userId, isDefault: true });
      if (!wishlist) {
        // Create default wishlist if it doesn't exist
        wishlist = new Wishlist({
          user: userId,
          name: 'My Wishlist',
          isDefault: true,
          isPrivate: true,
          items: []
        });
        await wishlist.save();
      }
    } else {
      wishlist = await Wishlist.findById(wishlistId);
    }

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await wishlist.addItem(productId, variantId, notes, priority);

    res.json({
      success: true,
      message: 'Product added to wishlist',
      data: {
        wishlist: {
          id: wishlist._id,
          name: wishlist.name,
          itemCount: wishlist.itemCount
        }
      }
    });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist'
    });
  }
};

export const removeFromWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId, productId } = req.params;
    const { variantId } = req.query;
    const userId = req.user?.id;

    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    await wishlist.removeItem(productId, variantId as string);

    res.json({
      success: true,
      message: 'Product removed from wishlist',
      data: {
        wishlist: {
          id: wishlist._id,
          name: wishlist.name,
          itemCount: wishlist.itemCount
        }
      }
    });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from wishlist'
    });
  }
};

export const checkWishlistStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { variantId } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.json({
        success: true,
        data: {
          inWishlist: false,
          wishlists: []
        }
      });
    }

    const wishlists = await Wishlist.find({
      user: userId,
      'items.product': productId,
      ...(variantId && { 'items.variant': variantId })
    }).select('name _id');

    const inWishlist = wishlists.length > 0;

    res.json({
      success: true,
      data: {
        inWishlist,
        wishlists: wishlists.map(w => ({
          id: w._id,
          name: w.name
        }))
      }
    });
  } catch (error) {
    console.error('Error checking wishlist status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist status'
    });
  }
};

export const shareWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { wishlistId } = req.params;
    const userId = req.user?.id;
    const { isPublic = false, emails = [], expiresInDays } = req.body;

    const wishlist = await Wishlist.findById(wishlistId);

    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    if (wishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const token = wishlist.generateShareToken();
    
    wishlist.sharing = {
      token,
      isPublic,
      sharedWith: emails,
      sharedAt: new Date(),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : undefined,
      viewCount: 0
    };

    await wishlist.save();

    const shareUrl = `${req.protocol}://${req.get('host')}/shared/wishlist/${token}`;

    res.json({
      success: true,
      data: {
        shareUrl,
        token,
        expiresAt: wishlist.sharing.expiresAt
      }
    });
  } catch (error) {
    console.error('Error sharing wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to share wishlist'
    });
  }
};

export const getSharedWishlist = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const wishlist = await Wishlist.findOne({ 'sharing.token': token })
      .populate({
        path: 'items.product',
        select: 'title handle price images vendor reviews.averageRating status',
        populate: {
          path: 'category',
          select: 'name slug'
        }
      })
      .populate('user', 'name avatar');

    if (!wishlist || !wishlist.sharing) {
      return res.status(404).json({
        success: false,
        message: 'Shared wishlist not found'
      });
    }

    // Check if share has expired
    if (wishlist.sharing.expiresAt && wishlist.sharing.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        message: 'Shared link has expired'
      });
    }

    // Increment view count
    wishlist.sharing.viewCount += 1;
    await wishlist.save();

    // Filter out inactive products
    const activeItems = wishlist.items.filter(item => {
      const product = item.product as any;
      return product && product.status === 'active';
    });

    res.json({
      success: true,
      data: {
        wishlist: {
          id: wishlist._id,
          name: wishlist.name,
          description: wishlist.description,
          items: activeItems,
          coverImage: wishlist.coverImage,
          color: wishlist.color,
          owner: wishlist.user,
          sharedAt: wishlist.sharing.sharedAt,
          viewCount: wishlist.sharing.viewCount
        },
        totalValue: wishlist.totalValue
      }
    });
  } catch (error) {
    console.error('Error fetching shared wishlist:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shared wishlist'
    });
  }
};

export const moveItemBetweenWishlists = async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceWishlistId, targetWishlistId } = req.params;
    const { productId, variantId } = req.body;
    const userId = req.user?.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Get both wishlists
    const [sourceWishlist, targetWishlist] = await Promise.all([
      Wishlist.findById(sourceWishlistId),
      Wishlist.findById(targetWishlistId)
    ]);

    if (!sourceWishlist || !targetWishlist) {
      return res.status(404).json({
        success: false,
        message: 'One or both wishlists not found'
      });
    }

    // Check ownership
    if (sourceWishlist.user.toString() !== userId || targetWishlist.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Find the item in source wishlist
    const itemIndex = sourceWishlist.items.findIndex(item => 
      item.product.toString() === productId && item.variant === variantId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in source wishlist'
      });
    }

    const item = sourceWishlist.items[itemIndex];

    // Add to target wishlist
    await targetWishlist.addItem(productId, variantId, item.notes, item.priority);

    // Remove from source wishlist
    await sourceWishlist.removeItem(productId, variantId);

    res.json({
      success: true,
      message: 'Item moved successfully',
      data: {
        sourceWishlist: {
          id: sourceWishlist._id,
          name: sourceWishlist.name,
          itemCount: sourceWishlist.itemCount
        },
        targetWishlist: {
          id: targetWishlist._id,
          name: targetWishlist.name,
          itemCount: targetWishlist.itemCount
        }
      }
    });
  } catch (error) {
    console.error('Error moving item between wishlists:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move item'
    });
  }
};