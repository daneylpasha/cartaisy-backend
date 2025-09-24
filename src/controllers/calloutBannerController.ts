import { Request, Response } from 'express';
import CalloutBanner, { ICalloutBanner } from '../models/CalloutBanner';

export const calloutBannerController = {
  async createCalloutBanners(req: Request, res: Response) {
    try {
      const items: ICalloutBanner[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of callout banner items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        title: item.title,
        subTitle: item.subTitle,
        buttonText: item.buttonText,
        action: item.action,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true,
        backgroundColor: item.backgroundColor || '#ffffff',
        textColor: item.textColor || '#000000',
        buttonColor: item.buttonColor || '#007bff'
      }));

      await CalloutBanner.deleteMany({});

      const createdItems = await CalloutBanner.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Callout banners created successfully',
        data: createdItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create callout banners'
      });
    }
  },

  async updateCalloutBanners(req: Request, res: Response) {
    try {
      const items: ICalloutBanner[] = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must be a non-empty array of callout banner items'
        });
      }

      const validatedItems = items.map((item, index) => ({
        imageUrl: item.imageUrl,
        title: item.title,
        subTitle: item.subTitle,
        buttonText: item.buttonText,
        action: item.action,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true,
        backgroundColor: item.backgroundColor || '#ffffff',
        textColor: item.textColor || '#000000',
        buttonColor: item.buttonColor || '#007bff'
      }));

      await CalloutBanner.deleteMany({});

      const updatedItems = await CalloutBanner.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Callout banners updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update callout banners'
      });
    }
  },

  async getCalloutBanners(req: Request, res: Response) {
    try {
      const { active } = req.query;

      const query: any = {};
      if (active !== undefined) {
        query.isActive = active === 'true';
      }

      const items = await CalloutBanner.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch callout banners'
      });
    }
  },

  async deleteCalloutBanner(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deletedItem = await CalloutBanner.findByIdAndDelete(id);

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Callout banner not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Callout banner deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete callout banner'
      });
    }
  },

  async updateCalloutBannerStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const updatedItem = await CalloutBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Callout banner not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Callout banner status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update callout banner status'
      });
    }
  }
};