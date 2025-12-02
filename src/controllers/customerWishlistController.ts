import { Request, Response } from 'express';
import Wishlist from '../models/Wishlist';
import Product from '../models/Product';
import { CustomerInfo } from '../middleware/customerAuth';

// Extend Request to include customer info from authenticateCustomer middleware
interface CustomerRequest extends Request {
  customer: CustomerInfo;
}

/**
 * Get all wishlists for the authenticated customer
 */
export const getWishlists = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;

    const wishlists = await Wishlist.find({ customer: customerId })
      .sort({ isDefault: -1, updatedAt: -1 })
      .select('name description itemCount isDefault coverImage color lastViewedAt createdAt updatedAt');

    res.status(200).json({
      status: 'success',
      data: {
        wishlists
      }
    });
  } catch (error) {
    console.error('Get customer wishlists error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch wishlists'
    });
  }
};

/**
 * Create a new wishlist for the authenticated customer
 */
export const createWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { name, description, isPrivate = true, color } = req.body;

    if (!name || name.trim().length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Wishlist name is required'
      });
      return;
    }

    // Check if customer already has a wishlist with this name
    const existingWishlist = await Wishlist.findOne({
      customer: customerId,
      name: name.trim()
    });

    if (existingWishlist) {
      res.status(400).json({
        status: 'error',
        message: 'A wishlist with this name already exists'
      });
      return;
    }

    // Check if this should be the default wishlist
    const customerWishlistCount = await Wishlist.countDocuments({ customer: customerId });
    const isDefault = customerWishlistCount === 0;

    const wishlist = new Wishlist({
      customer: customerId,
      name: name.trim(),
      description: description?.trim(),
      isPrivate,
      isDefault,
      color: color || '#E91E63',
      items: []
    });

    await wishlist.save();

    res.status(201).json({
      status: 'success',
      message: 'Wishlist created successfully',
      data: {
        wishlist
      }
    });
  } catch (error) {
    console.error('Create customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create wishlist'
    });
  }
};

/**
 * Get a specific wishlist by ID for the authenticated customer
 */
export const getWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId } = req.params;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId })
      .populate({
        path: 'items.product',
        select: 'title handle price images vendor inventoryTracking.totalQuantity reviews.averageRating status',
        populate: {
          path: 'category',
          select: 'name slug'
        }
      });

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
    }

    // Update last viewed timestamp
    wishlist.lastViewedAt = new Date();
    await wishlist.save();

    // Filter out inactive products
    const activeItems = wishlist.items.filter(item => {
      const product = item.product as any;
      return product && product.status === 'active';
    });

    res.status(200).json({
      status: 'success',
      data: {
        wishlist: {
          ...wishlist.toObject(),
          items: activeItems
        }
      }
    });
  } catch (error) {
    console.error('Get customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch wishlist'
    });
  }
};

/**
 * Update a wishlist for the authenticated customer
 */
export const updateWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId } = req.params;
    const { name, description, isPrivate, color, isDefault } = req.body;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId });

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
    }

    // Update allowed fields
    if (name !== undefined) {
      // Check for duplicate name
      if (name !== wishlist.name) {
        const existingWishlist = await Wishlist.findOne({
          customer: customerId,
          name: name.trim(),
          _id: { $ne: wishlistId }
        });

        if (existingWishlist) {
          res.status(400).json({
            status: 'error',
            message: 'A wishlist with this name already exists'
          });
          return;
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

    res.status(200).json({
      status: 'success',
      message: 'Wishlist updated successfully',
      data: {
        wishlist
      }
    });
  } catch (error) {
    console.error('Update customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update wishlist'
    });
  }
};

/**
 * Delete a wishlist for the authenticated customer
 */
export const deleteWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId } = req.params;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId });

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
    }

    // Don't allow deletion of default wishlist if it's the only one
    if (wishlist.isDefault) {
      const customerWishlistCount = await Wishlist.countDocuments({ customer: customerId });
      if (customerWishlistCount === 1) {
        res.status(400).json({
          status: 'error',
          message: 'Cannot delete your only wishlist'
        });
        return;
      }

      // If deleting default wishlist, make another one default
      await Wishlist.findOneAndUpdate(
        { customer: customerId, _id: { $ne: wishlistId } },
        { isDefault: true }
      );
    }

    await Wishlist.findByIdAndDelete(wishlistId);

    res.status(200).json({
      status: 'success',
      message: 'Wishlist deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete wishlist'
    });
  }
};

/**
 * Add a product to a wishlist
 */
export const addItemToWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId } = req.params;
    const { productId, variantId, notes, priority = 3 } = req.body;

    if (!productId) {
      res.status(400).json({
        status: 'error',
        message: 'Product ID is required'
      });
      return;
    }

    // Verify product exists and is active
    const product = await Product.findById(productId);
    if (!product || product.status !== 'active') {
      res.status(404).json({
        status: 'error',
        message: 'Product not found or not available'
      });
      return;
    }

    let wishlist;

    if (wishlistId === 'default') {
      // Add to default wishlist
      wishlist = await Wishlist.findOne({ customer: customerId, isDefault: true });
      if (!wishlist) {
        // Create default wishlist if it doesn't exist
        wishlist = new Wishlist({
          customer: customerId,
          name: 'My Wishlist',
          isDefault: true,
          isPrivate: true,
          items: []
        });
        await wishlist.save();
      }
    } else {
      wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId });
    }

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
    }

    await wishlist.addItem(productId, variantId, notes, priority);

    res.status(200).json({
      status: 'success',
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
    console.error('Add item to customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add product to wishlist'
    });
  }
};

/**
 * Remove a product from a wishlist
 */
export const removeItemFromWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId, productId } = req.params;
    const { variantId } = req.query;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId });

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
    }

    await wishlist.removeItem(productId, variantId as string);

    res.status(200).json({
      status: 'success',
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
    console.error('Remove item from customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to remove product from wishlist'
    });
  }
};

/**
 * Check if a product is in any of the customer's wishlists
 */
export const checkProductInWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { productId } = req.params;
    const { variantId } = req.query;

    const wishlists = await Wishlist.find({
      customer: customerId,
      'items.product': productId,
      ...(variantId && { 'items.variant': variantId })
    }).select('name _id');

    const inWishlist = wishlists.length > 0;

    res.status(200).json({
      status: 'success',
      data: {
        inWishlist,
        wishlistId: inWishlist ? wishlists[0]._id : null,
        wishlists: wishlists.map(w => ({
          id: w._id,
          name: w.name
        }))
      }
    });
  } catch (error) {
    console.error('Check product in customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check wishlist status'
    });
  }
};

/**
 * Generate a share link for a wishlist
 */
export const shareWishlist = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { wishlistId } = req.params;
    const { isPublic = false, emails = [], expiresInDays } = req.body;

    const wishlist = await Wishlist.findOne({ _id: wishlistId, customer: customerId });

    if (!wishlist) {
      res.status(404).json({
        status: 'error',
        message: 'Wishlist not found'
      });
      return;
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

    // Generate share URL - this should be configured based on the mobile app deep link
    const shareUrl = `${req.protocol}://${req.get('host')}/shared/wishlist/${token}`;

    res.status(200).json({
      status: 'success',
      data: {
        shareLink: shareUrl,
        token,
        expiresAt: wishlist.sharing.expiresAt
      }
    });
  } catch (error) {
    console.error('Share customer wishlist error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to share wishlist'
    });
  }
};

/**
 * Move items between wishlists
 */
export const moveItemsBetweenWishlists = async (req: CustomerRequest, res: Response): Promise<void> => {
  try {
    const customerId = req.customer.id;
    const { sourceWishlistId, targetWishlistId } = req.params;
    const { productIds, variantId } = req.body;

    // Support both single productId and multiple productIds
    const productsToMove = productIds || (req.body.productId ? [req.body.productId] : []);

    if (!productsToMove || productsToMove.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'Product ID(s) required'
      });
      return;
    }

    // Get both wishlists and verify ownership
    const [sourceWishlist, targetWishlist] = await Promise.all([
      Wishlist.findOne({ _id: sourceWishlistId, customer: customerId }),
      Wishlist.findOne({ _id: targetWishlistId, customer: customerId })
    ]);

    if (!sourceWishlist || !targetWishlist) {
      res.status(404).json({
        status: 'error',
        message: 'One or both wishlists not found'
      });
      return;
    }

    let movedCount = 0;

    for (const productId of productsToMove) {
      // Find the item in source wishlist
      const itemIndex = sourceWishlist.items.findIndex(item =>
        item.product.toString() === productId && (!variantId || item.variant === variantId)
      );

      if (itemIndex !== -1) {
        const item = sourceWishlist.items[itemIndex];

        // Add to target wishlist
        await targetWishlist.addItem(productId, item.variant, item.notes, item.priority);

        // Remove from source wishlist
        await sourceWishlist.removeItem(productId, item.variant);

        movedCount++;
      }
    }

    if (movedCount === 0) {
      res.status(404).json({
        status: 'error',
        message: 'No items found to move'
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: `${movedCount} item(s) moved successfully`,
      data: {
        movedCount,
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
    console.error('Move items between customer wishlists error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to move items'
    });
  }
};
