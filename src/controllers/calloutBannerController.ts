import { Response } from 'express';
import CalloutBanner from '../models/CalloutBanner';
import {
  HomeModuleShopifyValidationError,
  singleCollectionReference,
  validateHomeModuleCollectionReferences
} from '../services/homeModuleShopifyValidationService';
import { AuthenticatedRequest } from '../types';

export const calloutBannerController = {
  async createCalloutBanners(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of callout banner items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
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

      await validateHomeModuleCollectionReferences(
        req.storeId,
        items
          .map((item: any, index: number) => ({
            collectionId: item.action?.collectionId,
            field: `[${index}].action.collectionId`,
            type: item.action?.type
          }))
          .filter((reference: any) => reference.type === 'collection')
      );

      await CalloutBanner.deleteMany({ storeId: req.storeId });

      const createdItems = await CalloutBanner.insertMany(validatedItems);

      res.status(201).json({
        success: true,
        message: 'Callout banners created successfully',
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
        error: error.message || 'Failed to create callout banners'
      });
    }
  },

  async updateCalloutBanners(req: AuthenticatedRequest, res: Response) {
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
          error: 'Request body must be a non-empty array of callout banner items'
        });
      }

      const validatedItems = items.map((item: any, index: number) => ({
        storeId: req.storeId,
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

      await validateHomeModuleCollectionReferences(
        req.storeId,
        items
          .map((item: any, index: number) => ({
            collectionId: item.action?.collectionId,
            field: `[${index}].action.collectionId`,
            type: item.action?.type
          }))
          .filter((reference: any) => reference.type === 'collection')
      );

      await CalloutBanner.deleteMany({ storeId: req.storeId });

      const updatedItems = await CalloutBanner.insertMany(validatedItems);

      res.status(200).json({
        success: true,
        message: 'Callout banners updated successfully',
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
        error: error.message || 'Failed to update callout banners'
      });
    }
  },

  async getCalloutBanners(req: AuthenticatedRequest, res: Response) {
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

  async deleteCalloutBanner(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.storeId) {
        return res.status(401).json({
          success: false,
          error: 'Store authentication required'
        });
      }

      const id = (req.params as any)?.id as string;

      const deletedItem = await CalloutBanner.findOneAndDelete({
        _id: id,
        storeId: req.storeId
      });

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

  async updateCalloutBannerStatus(req: AuthenticatedRequest, res: Response) {
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
        const item = await CalloutBanner.findOne({ _id: id, storeId: req.storeId })
          .select('action')
          .lean();

        if (!item) {
          return res.status(404).json({
            success: false,
            error: 'Callout banner not found'
          });
        }

        if (item.action?.type === 'collection') {
          await validateHomeModuleCollectionReferences(
            req.storeId,
            singleCollectionReference(item.action.collectionId, 'action.collectionId')
          );
        }
      }

      const updatedItem = await CalloutBanner.findOneAndUpdate(
        { _id: id, storeId: req.storeId },
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
      if (error instanceof HomeModuleShopifyValidationError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update callout banner status'
      });
    }
  }
};
