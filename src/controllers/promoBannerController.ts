import { Response } from 'express';
import PromoBanner from '../models/PromoBanner';
import { AuthenticatedRequest } from '../types';

export const promoBannerController = {
  async createPromoBanners(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of promo banner items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        image: item.image,
        title: item.title,
        subtitle: item.subtitle,
        ctaText: item.ctaText,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true,
        backgroundColor: item.backgroundColor || '#ffffff',
        textColor: item.textColor || '#000000',
        buttonColor: item.buttonColor || '#007bff'
      }));

      await PromoBanner.deleteMany({ storeId: req.storeId });

      const createdItems = await PromoBanner.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Promo banners created successfully',
        data: createdItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create promo banners'
      });
    }
  },

  async updatePromoBanners(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of promo banner items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
        image: item.image,
        title: item.title,
        subtitle: item.subtitle,
        ctaText: item.ctaText,
        collectionId: item.collectionId,
        position: item.position !== undefined ? item.position : index,
        isActive: item.isActive !== undefined ? item.isActive : true,
        backgroundColor: item.backgroundColor || '#ffffff',
        textColor: item.textColor || '#000000',
        buttonColor: item.buttonColor || '#007bff'
      }));

      await PromoBanner.deleteMany({ storeId: req.storeId });

      const updatedItems = await PromoBanner.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Promo banners updated successfully',
        data: updatedItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update promo banners'
      });
    }
  },

  async getPromoBanners(req: AuthenticatedRequest, res: Response) {
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

      const items = await PromoBanner.find(query)
        .sort({ position: 1 })
        .lean();

      res.status(200).json({
        success: true,
        data: items
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch promo banners'
      });
    }
  },

  async deletePromoBanner(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      const deletedItem = await PromoBanner.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

      if (!deletedItem) {
        return res.status(404).json({
          success: false,
          error: 'Promo banner not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Promo banner deleted successfully',
        data: deletedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete promo banner'
      });
    }
  },

  async updatePromoBannerStatus(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;
      const isActive = (req.body as any)?.isActive;

      const updatedItem = await PromoBanner.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
        { isActive },
        { new: true }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          error: 'Promo banner not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Promo banner status updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update promo banner status'
      });
    }
  }
};
