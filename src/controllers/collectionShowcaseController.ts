import { Response } from 'express';
import CollectionShowcase from '../models/CollectionShowcase';
import { AuthenticatedRequest } from '../types';

export const collectionShowcaseController = {
  async createCollectionShowcases(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of collection showcase items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        type: item.type,
        title: item.title,
        icon: item.icon,
        collections: item.collections,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CollectionShowcase.deleteMany({ storeId: req.storeId });

      const createdItems = await CollectionShowcase.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Collection showcases created successfully',
        data: createdItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create collection showcases'
      });
    }
  },

  async updateCollectionShowcases(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of collection showcase items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        type: item.type,
        title: item.title,
        icon: item.icon,
        collections: item.collections,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true
      }));

      await CollectionShowcase.deleteMany({ storeId: req.storeId });

      const updatedItems = await CollectionShowcase.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Collection showcases updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update collection showcases'
      });
    }
  },

  async getCollectionShowcases(req: AuthenticatedRequest, res: Response) {
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

      const items = await CollectionShowcase.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch collection showcases'
      });
    }
  },

  async deleteCollectionShowcase(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      const deletedItem = await CollectionShowcase.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Collection showcase not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Collection showcase deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete collection showcase'
      });
    }
  },

  async updateCollectionShowcaseStatus(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      const updatedItem = await CollectionShowcase.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Collection showcase not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Collection showcase status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update collection showcase status'
      });
    }
  }
};
