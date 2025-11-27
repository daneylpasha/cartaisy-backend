import { Response } from 'express';
import CategoryGrid from '../models/CategoryGrid';
import { AuthenticatedRequest } from '../types';

export const categoryGridController = {
  async createCategoryGridItems(req: AuthenticatedRequest, res: Response) {
    try {
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
          error: 'Request body must be a non-empty array of category grid items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        imageUrl: item.imageUrl,
        title: item.title,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CategoryGrid.deleteMany({ storeId: req.storeId });

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

  async updateCategoryGridItems(req: AuthenticatedRequest, res: Response) {
    try {
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
          error: 'Request body must be a non-empty array of category grid items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        imageUrl: item.imageUrl,
        title: item.title,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CategoryGrid.deleteMany({ storeId: req.storeId });

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

  async getCategoryGridItems(req: AuthenticatedRequest, res: Response) {
    try {
      const queryParams = req.query as any;
      const active = queryParams?.active as string | undefined;

      const query: any = {};
      if (req.storeId) {
        query.storeId = req.storeId;
      }
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

  async deleteCategoryGridItem(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      const deletedItem = await CategoryGrid.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

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

  async updateCategoryGridItemStatus(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      const updatedItem = await CategoryGrid.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
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