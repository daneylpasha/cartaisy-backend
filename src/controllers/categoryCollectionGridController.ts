import { Response } from 'express';
import CategoryCollectionGrid from '../models/CategoryCollectionGrid';
import {
  HomeModuleShopifyValidationError,
  collectionArrayReferences,
  validateHomeModuleCollectionReferences
} from '../services/homeModuleShopifyValidationService';
import { AuthenticatedRequest } from '../types';

export const categoryCollectionGridController = {
  async createCategoryCollectionGrids(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of category collection grid items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        title: item.title,
        subtitle: item.subtitle,
        collections: item.collections,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await validateHomeModuleCollectionReferences(
        req.storeId,
        items.reduce((references: any[], item: any, index: number) => [
          ...references,
          ...collectionArrayReferences(item.collections, `[${index}].collections`)
        ], [])
      );

      await CategoryCollectionGrid.deleteMany({ storeId: req.storeId });

      const createdItems = await CategoryCollectionGrid.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Category collection grids created successfully',
        data: createdItems
      });
    } catch (error: any) {
      if (error instanceof HomeModuleShopifyValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create category collection grids'
      });
    }
  },

  async updateCategoryCollectionGrids(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of category collection grid items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        title: item.title,
        subtitle: item.subtitle,
        collections: item.collections,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await validateHomeModuleCollectionReferences(
        req.storeId,
        items.reduce((references: any[], item: any, index: number) => [
          ...references,
          ...collectionArrayReferences(item.collections, `[${index}].collections`)
        ], [])
      );

      await CategoryCollectionGrid.deleteMany({ storeId: req.storeId });

      const updatedItems = await CategoryCollectionGrid.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Category collection grids updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      if (error instanceof HomeModuleShopifyValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update category collection grids'
      });
    }
  },

  async getCategoryCollectionGrids(req: AuthenticatedRequest, res: Response) {
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

      const items = await CategoryCollectionGrid.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch category collection grids'
      });
    }
  },

  async deleteCategoryCollectionGrid(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      const deletedItem = await CategoryCollectionGrid.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Category collection grid not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Category collection grid deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete category collection grid'
      });
    }
  },

  async updateCategoryCollectionGridStatus(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      if (isActive === true) {
        const item = await CategoryCollectionGrid.findOne({ _id: id, storeId: req.storeId })
          .select('collections')
          .lean();

        if (!item) {
          return res.status(404).json({
            success: false,
            error: 'Category collection grid not found'
          });
        }

        await validateHomeModuleCollectionReferences(
          req.storeId,
          collectionArrayReferences(item.collections, 'collections')
        );
      }

      const updatedItem = await CategoryCollectionGrid.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Category collection grid not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Category collection grid status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      if (error instanceof HomeModuleShopifyValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update category collection grid status'
      });
    }
  }
};
