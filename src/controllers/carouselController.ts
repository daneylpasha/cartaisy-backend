import { Request, Response } from 'express';
import CarouselItem, { ICarouselItem } from '../models/CarouselItem';

export const carouselController = {
  async createCarouselItems(req: Request, res: Response) {
    try {
      const items: ICarouselItem[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of carousel items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        label: item.label,
        title: item.title,
        subTitle: item.subTitle,
        buttonText: item.buttonText || 'Shop Now',
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CarouselItem.deleteMany({});

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

  async updateCarouselItems(req: Request, res: Response) {
    try {
      const items: ICarouselItem[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of carousel items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        label: item.label,
        title: item.title,
        subTitle: item.subTitle,
        buttonText: item.buttonText || 'Shop Now',
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CarouselItem.deleteMany({});

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

  async getCarouselItems(req: Request, res: Response) {
    try {
      const { active } = req.query;

      const query: any = {};
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

  async deleteCarouselItem(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deletedItem = await CarouselItem.findByIdAndDelete(id);

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

  async updateCarouselItemStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updatedItem = await CarouselItem.findByIdAndUpdate(
        id,
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