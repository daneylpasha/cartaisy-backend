import { Request, Response } from 'express';
import mongoose, { ObjectId } from 'mongoose';
import Customer from '../models/Customer';
import GuestSession from '../models/GuestSession';
import { UnifiedCartUser } from '../middleware/unifiedCartAuth';
import { findStoreProductById } from '../utils/productOwnership';

// Type augmentation for Express Request (to complement express.d.ts)
declare module 'express-serve-static-core' {
  interface Request {
    cartUser?: UnifiedCartUser;
    storeId?: ObjectId | string;
  }
}

/**
 * Unified Cart Controller
 *
 * Handles cart operations for both authenticated customers and guest users.
 * Uses the same API endpoints for both user types.
 *
 * The middleware (authenticateCart) determines user type and attaches
 * req.cartUser with either customer or guestSession info.
 */

interface CartItem {
  productId: string;
  product?: any;
  variantId?: string;
  quantity: number;
  addedAt: Date;
}

interface CartResponse {
  items: CartItem[];
  itemCount: number;
  updatedAt: Date;
}

/**
 * Helper: Get cart for current user (customer or guest)
 */
async function getCartForUser(
  cartUser: UnifiedCartUser
): Promise<CartResponse> {
  if (cartUser.userType === 'customer') {
    const customer = await Customer.findById(cartUser.userId).populate({
      path: 'cart.items.productId',
      select: 'title price images handle variants status',
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    const items = customer.cart.items.map((item: any) => ({
      productId: item.productId?._id?.toString() || item.productId?.toString(),
      product: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      addedAt: item.addedAt,
    }));

    return {
      items,
      itemCount: items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0),
      updatedAt: customer.cart.updatedAt,
    };
  } else {
    // Guest user
    const session = await GuestSession.findOne({
      sessionId: cartUser.userId,
      storeId: cartUser.storeId,
    }).populate({
      path: 'cart.items.product',
      select: 'title price images handle variants status',
    });

    if (!session) {
      throw new Error('Session not found');
    }

    const items = session.cart.items.map((item: any) => ({
      productId: item.product?._id?.toString() || item.product?.toString(),
      product: item.product,
      variantId: item.variantId,
      quantity: item.quantity,
      addedAt: item.addedAt,
    }));

    return {
      items,
      itemCount: items.reduce((sum: number, item: CartItem) => sum + item.quantity, 0),
      updatedAt: session.cart.updatedAt,
    };
  }
}

/**
 * GET /api/v1/cart
 * Get cart - works for both customer and guest
 */
export const getCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or session required',
      });
      return;
    }

    const cart = await getCartForUser(cartUser);

    res.status(200).json({
      status: 'success',
      data: {
        cart,
        userType: cartUser.userType,
      },
    });
  } catch (error: any) {
    console.error('Get cart error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get cart',
    });
  }
};

/**
 * POST /api/v1/cart
 * Add item to cart - works for both customer and guest
 */
export const addToCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or session required',
      });
      return;
    }

    const { productId, variantId, quantity = 1 } = req.body;

    if (!productId) {
      res.status(400).json({
        status: 'error',
        message: 'Product ID is required',
      });
      return;
    }

    // Validate product exists in the trusted cart store context.
    const product = await findStoreProductById(productId, cartUser.storeId);
    if (!product) {
      res.status(404).json({
        status: 'error',
        message: 'Product not found',
      });
      return;
    }

    // Validate product is active
    if (product.status !== 'active') {
      res.status(400).json({
        status: 'error',
        message: 'Product is not available',
      });
      return;
    }

    if (cartUser.userType === 'customer') {
      // Customer cart
      const customer = await Customer.findById(cartUser.userId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: 'Customer not found',
        });
        return;
      }

      const existingItemIndex = customer.cart.items.findIndex(
        (item: any) =>
          item.productId.toString() === productId &&
          item.variantId === variantId
      );

      if (existingItemIndex > -1) {
        // Update quantity (cap at 99)
        customer.cart.items[existingItemIndex].quantity = Math.min(
          customer.cart.items[existingItemIndex].quantity + quantity,
          99
        );
      } else {
        // Add new item
        customer.cart.items.push({
          productId: new mongoose.Types.ObjectId(productId),
          variantId,
          quantity: Math.min(quantity, 99),
          addedAt: new Date(),
        });
      }

      customer.cart.updatedAt = new Date();
      await customer.save();

      const cart = await getCartForUser(cartUser);

      res.status(200).json({
        status: 'success',
        message: 'Item added to cart',
        data: {
          cart,
          userType: cartUser.userType,
        },
      });
    } else {
      // Guest cart
      const session = await GuestSession.findOne({
        sessionId: cartUser.userId,
        storeId: cartUser.storeId,
      });

      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found',
        });
        return;
      }

      const existingItemIndex = session.cart.items.findIndex(
        (item) =>
          item.product.toString() === productId && item.variantId === variantId
      );

      if (existingItemIndex > -1) {
        // Update quantity (cap at 99)
        session.cart.items[existingItemIndex].quantity = Math.min(
          session.cart.items[existingItemIndex].quantity + quantity,
          99
        );
      } else {
        // Add new item
        session.cart.items.push({
          product: new mongoose.Types.ObjectId(productId),
          variantId,
          quantity: Math.min(quantity, 99),
          addedAt: new Date(),
        });
      }

      session.cart.updatedAt = new Date();
      await session.save();

      const cart = await getCartForUser(cartUser);

      res.status(200).json({
        status: 'success',
        message: 'Item added to cart',
        data: {
          cart,
          userType: cartUser.userType,
        },
      });
    }
  } catch (error: any) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to add item to cart',
    });
  }
};

/**
 * PATCH /api/v1/cart/:itemId
 * Update cart item quantity - works for both customer and guest
 */
export const updateCartItem = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or session required',
      });
      return;
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) {
      res.status(400).json({
        status: 'error',
        message: 'Valid quantity is required (0 or more)',
      });
      return;
    }

    if (cartUser.userType === 'customer') {
      const customer = await Customer.findById(cartUser.userId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: 'Customer not found',
        });
        return;
      }

      const itemIndex = customer.cart.items.findIndex(
        (item: any) => item.productId.toString() === itemId
      );

      if (itemIndex === -1) {
        res.status(404).json({
          status: 'error',
          message: 'Item not found in cart',
        });
        return;
      }

      if (quantity === 0) {
        // Remove item
        customer.cart.items.splice(itemIndex, 1);
      } else {
        // Update quantity
        customer.cart.items[itemIndex].quantity = Math.min(quantity, 99);
      }

      customer.cart.updatedAt = new Date();
      await customer.save();
    } else {
      const session = await GuestSession.findOne({
        sessionId: cartUser.userId,
        storeId: cartUser.storeId,
      });

      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found',
        });
        return;
      }

      const itemIndex = session.cart.items.findIndex(
        (item) => item.product.toString() === itemId
      );

      if (itemIndex === -1) {
        res.status(404).json({
          status: 'error',
          message: 'Item not found in cart',
        });
        return;
      }

      if (quantity === 0) {
        // Remove item
        session.cart.items.splice(itemIndex, 1);
      } else {
        // Update quantity
        session.cart.items[itemIndex].quantity = Math.min(quantity, 99);
      }

      session.cart.updatedAt = new Date();
      await session.save();
    }

    const cart = await getCartForUser(cartUser);

    res.status(200).json({
      status: 'success',
      message: quantity === 0 ? 'Item removed from cart' : 'Cart updated',
      data: {
        cart,
        userType: cartUser.userType,
      },
    });
  } catch (error: any) {
    console.error('Update cart item error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update cart item',
    });
  }
};

/**
 * DELETE /api/v1/cart/:itemId
 * Remove item from cart - works for both customer and guest
 */
export const removeFromCart = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or session required',
      });
      return;
    }

    const { itemId } = req.params;
    const { variantId } = req.query;

    if (cartUser.userType === 'customer') {
      const customer = await Customer.findById(cartUser.userId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: 'Customer not found',
        });
        return;
      }

      const initialLength = customer.cart.items.length;
      customer.cart.items = customer.cart.items.filter((item: any) => {
        const productMatch = item.productId.toString() === itemId;
        const variantMatch = variantId
          ? item.variantId === variantId
          : true;
        return !(productMatch && variantMatch);
      });

      if (customer.cart.items.length === initialLength) {
        res.status(404).json({
          status: 'error',
          message: 'Item not found in cart',
        });
        return;
      }

      customer.cart.updatedAt = new Date();
      await customer.save();
    } else {
      const session = await GuestSession.findOne({
        sessionId: cartUser.userId,
        storeId: cartUser.storeId,
      });

      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found',
        });
        return;
      }

      const initialLength = session.cart.items.length;
      session.cart.items = session.cart.items.filter((item) => {
        const productMatch = item.product.toString() === itemId;
        const variantMatch = variantId
          ? item.variantId === variantId
          : true;
        return !(productMatch && variantMatch);
      });

      if (session.cart.items.length === initialLength) {
        res.status(404).json({
          status: 'error',
          message: 'Item not found in cart',
        });
        return;
      }

      session.cart.updatedAt = new Date();
      await session.save();
    }

    const cart = await getCartForUser(cartUser);

    res.status(200).json({
      status: 'success',
      message: 'Item removed from cart',
      data: {
        cart,
        userType: cartUser.userType,
      },
    });
  } catch (error: any) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to remove item from cart',
    });
  }
};

/**
 * DELETE /api/v1/cart
 * Clear entire cart - works for both customer and guest
 */
export const clearCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication or session required',
      });
      return;
    }

    if (cartUser.userType === 'customer') {
      const customer = await Customer.findById(cartUser.userId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: 'Customer not found',
        });
        return;
      }

      customer.cart.items = [];
      customer.cart.updatedAt = new Date();
      await customer.save();
    } else {
      const session = await GuestSession.findOne({
        sessionId: cartUser.userId,
        storeId: cartUser.storeId,
      });

      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found',
        });
        return;
      }

      session.cart.items = [];
      session.cart.updatedAt = new Date();
      await session.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Cart cleared',
      data: {
        cart: {
          items: [],
          itemCount: 0,
          updatedAt: new Date(),
        },
        userType: cartUser.userType,
      },
    });
  } catch (error: any) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to clear cart',
    });
  }
};

/**
 * POST /api/v1/cart/guest-checkout-info
 * Save guest checkout info (email, phone, name) for guest orders
 */
export const saveGuestCheckoutInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(401).json({
        status: 'error',
        message: 'Session required',
      });
      return;
    }

    if (cartUser.userType !== 'guest') {
      res.status(400).json({
        status: 'error',
        message: 'This endpoint is only for guest users',
      });
      return;
    }

    const { email, phone, fullName } = req.body;

    if (!email || !fullName) {
      res.status(400).json({
        status: 'error',
        message: 'Email and full name are required',
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address',
      });
      return;
    }

    const session = await GuestSession.findOne({
      sessionId: cartUser.userId,
      storeId: cartUser.storeId,
    });

    if (!session) {
      res.status(404).json({
        status: 'error',
        message: 'Session not found',
      });
      return;
    }

    session.guestCheckout = {
      email: email.toLowerCase().trim(),
      phone: phone?.trim(),
      fullName: fullName.trim(),
    };

    await session.save();

    res.status(200).json({
      status: 'success',
      message: 'Guest checkout info saved',
      data: {
        guestCheckout: session.guestCheckout,
      },
    });
  } catch (error: any) {
    console.error('Save guest checkout info error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to save guest checkout info',
    });
  }
};

/**
 * GET /api/v1/cart/session-info
 * Get current session info (useful for debugging and UI state)
 */
export const getSessionInfo = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const cartUser = req.cartUser;

    if (!cartUser) {
      res.status(200).json({
        status: 'success',
        data: {
          hasSession: false,
          userType: null,
        },
      });
      return;
    }

    if (cartUser.userType === 'customer') {
      res.status(200).json({
        status: 'success',
        data: {
          hasSession: true,
          userType: 'customer',
          customerId: cartUser.userId,
          email: cartUser.customer?.email,
        },
      });
    } else {
      const session = cartUser.guestSession;
      res.status(200).json({
        status: 'success',
        data: {
          hasSession: true,
          userType: 'guest',
          sessionId: cartUser.userId,
          hasGuestCheckoutInfo: !!session?.guestCheckout,
          guestCheckout: session?.guestCheckout
            ? {
                email: session.guestCheckout.email,
                fullName: session.guestCheckout.fullName,
              }
            : null,
          cartItemCount: session?.cart.items.reduce(
            (sum, item) => sum + item.quantity,
            0
          ) || 0,
          expiresAt: session?.expiresAt,
        },
      });
    }
  } catch (error: any) {
    console.error('Get session info error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get session info',
    });
  }
};
