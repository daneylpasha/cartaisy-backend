import { Request, Response } from 'express';
import CollectionDisplay from '../models/CollectionDisplay';

export const collectionDisplayController = {
  async getCollectionDisplays(req: Request, res: Response) {
    try {
      const collectionDisplays = await CollectionDisplay.find({ isActive: true })
        .sort({ order: 1 })
        .select('type collectionId order title')
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

  async createCollectionDisplays(req: Request, res: Response) {
    try {
      const { collectionDisplays } = req.body;

      if (!Array.isArray(collectionDisplays) || collectionDisplays.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'collectionDisplays array is required and must not be empty'
        });
      }

      const validTypes = ['large_row', 'small_grid', 'medium_row'];
      for (const display of collectionDisplays) {
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

      const createdDisplays = await CollectionDisplay.insertMany(collectionDisplays);

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

  async updateCollectionDisplays(req: Request, res: Response) {
    try {
      const { collectionDisplays } = req.body;

      if (!Array.isArray(collectionDisplays) || collectionDisplays.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'collectionDisplays array is required and must not be empty'
        });
      }

      await CollectionDisplay.deleteMany({});
      const updatedDisplays = await CollectionDisplay.insertMany(collectionDisplays);

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

  async deleteCollectionDisplay(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const deletedDisplay = await CollectionDisplay.findByIdAndDelete(id);

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

  async updateCollectionDisplayStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updatedDisplay = await CollectionDisplay.findByIdAndUpdate(
        id,
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