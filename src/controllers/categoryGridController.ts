import { Request, Response } from 'express';
import CategoryGrid, { ICategoryGrid } from '../models/CategoryGrid';

export const categoryGridController = {
  async createCategoryGridItems(req: Request, res: Response) {
    try {
      const items: ICategoryGrid[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of category grid items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        title: item.title,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CategoryGrid.deleteMany({});

      const createdItems = await CategoryGrid.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Category grid items created successfully',
        data: createdItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create category grid items'
      });
    }
  },

  async updateCategoryGridItems(req: Request, res: Response) {
    try {
      const items: ICategoryGrid[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of category grid items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        title: item.title,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CategoryGrid.deleteMany({});

      const updatedItems = await CategoryGrid.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Category grid items updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update category grid items'
      });
    }
  },

  async getCategoryGridItems(req: Request, res: Response) {
    try {
      const { active } = req.query;

      const query: any = {};
      if (active !== undefined) {
        query.isActive = active === 'true';
      }

      const items = await CategoryGrid.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch category grid items'
      });
    }
  },

  async deleteCategoryGridItem(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deletedItem = await CategoryGrid.findByIdAndDelete(id);

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Category grid item not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Category grid item deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete category grid item'
      });
    }
  },

  async updateCategoryGridItemStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updatedItem = await CategoryGrid.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Category grid item not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Category grid item status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update category grid item status'
      });
    }
  }
};