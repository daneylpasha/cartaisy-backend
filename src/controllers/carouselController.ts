import { Response } from 'express';
import CarouselItem from '../models/CarouselItem';
import { AuthenticatedRequest } from '../types';

export const carouselController = {
  // Create a single carousel item
  async createCarouselItem(req: AuthenticatedRequest, res: Response) {
    try {
      // Check for store authentication
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const item = req.body as any;

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a carousel item object'
        });
      }

      // Get current max position for this store
      const maxPositionItem = await CarouselItem.findOne({ storeId: req.storeId })
        .sort({ position: -1 })
        .select('position')
        .lean();
      const nextPosition = maxPositionItem ? (maxPositionItem.position || 0) + 1 : 0;

      const newItem = new CarouselItem({
        storeId: req.storeId,
        imageUrl: item.imageUrl,
        label: item.label,
        title: item.title,
        subtitle: item.subtitle,
        ctaText: item.ctaText || 'Shop Now',
        collectionId: item.collectionId,
        endsAt: item.endsAt,
        promoTag: item.promoTag,
        position: item.position !== undefined ? item.position : nextPosition,
        isActive: item.isActive !== undefined ? item.isActive : true
      });

      const savedItem = await newItem.save();

      res.status(201).json({
        success: true,
        message: 'Carousel item created successfully',
        data: savedItem
      });
    } catch (error: any) {
      console.error('Create carousel item error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create carousel item'
      });
    }
  },

  // Create multiple carousel items (bulk)
  async createCarouselItems(req: AuthenticatedRequest, res: Response) {
    try {
      // Check for store authentication
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const items = req.body as any[];

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of carousel items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        imageUrl: item.imageUrl,
        label: item.label,
        title: item.title,
        subtitle: item.subtitle,
        ctaText: item.ctaText || 'Shop Now',
        collectionId: item.collectionId,
        endsAt: item.endsAt,
        promoTag: item.promoTag,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      // Delete only items from this store
      await CarouselItem.deleteMany({ storeId: req.storeId });

      const createdItems = await CarouselItem.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Carousel items created successfully',
        data: createdItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create carousel items'
      });
    }
  },

  async updateCarouselItems(req: AuthenticatedRequest, res: Response) {
    try {
      // Check for store authentication
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const items = req.body as any[];

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of carousel items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        imageUrl: item.imageUrl,
        label: item.label,
        title: item.title,
        subtitle: item.subtitle,
        ctaText: item.ctaText || 'Shop Now',
        collectionId: item.collectionId,
        endsAt: item.endsAt,
        promoTag: item.promoTag,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      // Delete only items from this store
      await CarouselItem.deleteMany({ storeId: req.storeId });

      const updatedItems = await CarouselItem.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Carousel items updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update carousel items'
      });
    }
  },

  async getCarouselItems(req: AuthenticatedRequest, res: Response) {
    try {
      const queryParams = req.query as any;
      const active = queryParams?.active as string | undefined;

      // Build query with storeId filter if available
      const query: any = {};
      if (req.storeId) {
        query.storeId = req.storeId;
      }
      if (active !== undefined) {
        query.isActive = active === 'true';
      }

      const items = await CarouselItem.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch carousel items'
      });
    }
  },

  async deleteCarouselItem(req: AuthenticatedRequest, res: Response) {
    try {
      // Check for store authentication
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      // Ensure user can only delete from their store
      const deletedItem = await CarouselItem.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Carousel item not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Carousel item deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete carousel item'
      });
    }
  },

  async updateCarouselItemStatus(req: AuthenticatedRequest, res: Response) {
    try {
      // Check for store authentication
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      // Ensure user can only update items from their store
      const updatedItem = await CarouselItem.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Carousel item not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Carousel item status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update carousel item status'
      });
    }
  }
};