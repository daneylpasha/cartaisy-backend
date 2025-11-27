import { Response } from 'express';
import CollectionDisplay from '../models/CollectionDisplay';
import { AuthenticatedRequest } from '../types';

export const collectionDisplayController = {
  async getCollectionDisplays(req: AuthenticatedRequest, res: Response) {
    try {
      const query: any = { isActive: true };
      if (req.storeId) {
        query.storeId = req.storeId;
      }

      const collectionDisplays = await CollectionDisplay.find(query)
        .sort({ order: 1 })
        .select('type collectionId order title storeId')
        .lean();

      res.status(200).json({
        success: true,
        data: collectionDisplays
      });
    } catch (error: any) {
      console.error('Error fetching collection displays:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch collection displays'
      });
    }
  },

  async createCollectionDisplays(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const requestBody = req.body as any;
      const displays = requestBody?.collectionDisplays as any[] || [];

      if (!Array.isArray(displays) || displays.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'collectionDisplays array is required and must not be empty'
        });
      }

      const validTypes = ['large_row', 'small_grid', 'medium_row'];
      for (const display of displays) {
        if (!validTypes.includes(display.type)) {
          return res.status(400).json({
            success: false,
            error: `Invalid type: ${display.type}. Must be one of: ${validTypes.join(', ')}`
          });
        }
        if (!display.collectionId || !display.order) {
          return res.status(400).json({
            success: false,
            error: 'collectionId and order are required for each collection display'
          });
        }
      }

      const validatedDisplays = displays.map((display: any) => ({
        storeId: req.storeId,
        ...display
      }));

      const createdDisplays = await CollectionDisplay.insertMany(validatedDisplays);

      res.status(201).json({
        success: true,
        data: createdDisplays,
        message: `${createdDisplays.length} collection displays created successfully`
      });
    } catch (error: any) {
      console.error('Error creating collection displays:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create collection displays'
      });
    }
  },

  async updateCollectionDisplays(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const requestBody = req.body as any;
      const displays = requestBody?.collectionDisplays as any[] || [];

      if (!Array.isArray(displays) || displays.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'collectionDisplays array is required and must not be empty'
        });
      }

      const validatedDisplays = displays.map((display: any) => ({
        storeId: req.storeId,
        ...display
      }));

      await CollectionDisplay.deleteMany({ storeId: req.storeId });
      const updatedDisplays = await CollectionDisplay.insertMany(validatedDisplays);

      res.status(200).json({
        success: true,
        data: updatedDisplays,
        message: `Collection displays updated successfully with ${updatedDisplays.length} items`
      });
    } catch (error: any) {
      console.error('Error updating collection displays:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update collection displays'
      });
    }
  },

  async deleteCollectionDisplay(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const deletedDisplay = await CollectionDisplay.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

      if (!deletedDisplay) {
        return res.status(404).json({
          success: false,
          error: 'Collection display not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Collection display deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting collection display:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete collection display'
      });
    }
  },

  async updateCollectionDisplayStatus(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      const updatedDisplay = await CollectionDisplay.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
        { isActive },
        { new: true }
      );

      if (!updatedDisplay) {
        return res.status(404).json({
          success: false,
          error: 'Collection display not found'
        });
      }

      res.status(200).json({
        success: true,
        data: updatedDisplay,
        message: 'Collection display status updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating collection display status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update collection display status'
      });
    }
  }
};