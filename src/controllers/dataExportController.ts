import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as DataExportService from '../services/dataExportService';

/**
 * Data Export Controller
 *
 * Handles GDPR-compliant user data export requests.
 * Provides endpoints for customers to request and download their data.
 */

/**
 * Request a new data export (Customer)
 * POST /api/v1/customer/data-export/request
 *
 * Rate limited to 1 request per 24 hours per customer.
 */
export async function requestDataExport(req: Request, res: Response): Promise<void> {
  try {
    const customerId = (req as any).customer?.id;
    const storeId = (req as any).storeId;

    if (!customerId || !storeId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Create export request
    const exportRequest = await DataExportService.createExportRequest(
      storeId,
      customerId,
      'customer'
    );

    // Process export immediately (in production, this would be queued)
    // For now, we process synchronously
    const result = await DataExportService.processExportRequest(exportRequest._id as string);

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to process export',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        exportId: exportRequest._id,
        status: 'completed',
        requestedAt: exportRequest.requestedAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        dataCategories: result.data?.dataCategories,
        // Include the actual data in the response
        exportData: result.data,
      },
      message: 'Your data export is ready',
    });
  } catch (error: any) {
    console.error('Error requesting data export:', error);

    // Handle rate limiting error
    if (error.nextAvailableAt) {
      res.status(429).json({
        success: false,
        error: 'Export request limit reached',
        nextAvailableAt: error.nextAvailableAt,
        message: `You can request another export after ${error.nextAvailableAt.toISOString()}`,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to request data export',
    });
  }
}

/**
 * Get export status (Customer)
 * GET /api/v1/customer/data-export/status
 *
 * Returns the status of the latest export and whether a new request can be made.
 */
export async function getDataExportStatus(req: Request, res: Response): Promise<void> {
  try {
    const customerId = (req as any).customer?.id;

    if (!customerId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const status = await DataExportService.getExportStatus(customerId);

    res.status(200).json({
      success: true,
      data: {
        latestExport: status.latestExport
          ? {
              id: status.latestExport._id,
              status: status.latestExport.status,
              requestedAt: status.latestExport.requestedAt,
              completedAt: status.latestExport.completedAt,
              expiresAt: status.latestExport.expiresAt,
              dataCategories: status.latestExport.dataCategories,
              fileSize: status.latestExport.fileSize,
            }
          : null,
        canRequestNew: status.canRequestNew,
        nextAvailableAt: status.nextAvailableAt,
      },
    });
  } catch (error: any) {
    console.error('Error getting export status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get export status',
    });
  }
}

/**
 * Get export history (Customer)
 * GET /api/v1/customer/data-export/history
 *
 * Returns paginated list of all export requests for the customer.
 */
export async function getDataExportHistory(req: Request, res: Response): Promise<void> {
  try {
    const customerId = (req as any).customer?.id;
    const { limit = '10', offset = '0' } = req.query;

    if (!customerId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const { exports, total } = await DataExportService.getCustomerExports(customerId, {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.status(200).json({
      success: true,
      data: {
        exports: exports.map((exp) => ({
          id: exp._id,
          status: exp.status,
          requestedAt: exp.requestedAt,
          completedAt: exp.completedAt,
          expiresAt: exp.expiresAt,
          dataCategories: exp.dataCategories,
          fileSize: exp.fileSize,
        })),
        pagination: {
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting export history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get export history',
    });
  }
}

/**
 * Download export data (Customer)
 * GET /api/v1/customer/data-export/:exportId/download
 *
 * Returns the full export data as JSON.
 */
export async function downloadDataExport(req: Request, res: Response): Promise<void> {
  try {
    const customerId = (req as any).customer?.id;
    const storeId = (req as any).storeId;
    const { exportId } = req.params;

    if (!customerId || !storeId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Validate exportId
    if (!mongoose.Types.ObjectId.isValid(exportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid export ID',
      });
      return;
    }

    // Import DataExport model to check ownership
    const DataExport = mongoose.model('DataExport');
    const exportRecord = await DataExport.findOne({
      _id: exportId,
      customerId,
      storeId,
    });

    if (!exportRecord) {
      res.status(404).json({
        success: false,
        error: 'Export not found',
      });
      return;
    }

    if ((exportRecord as any).status !== 'completed') {
      res.status(400).json({
        success: false,
        error: `Export is ${(exportRecord as any).status}, not available for download`,
      });
      return;
    }

    // Check if export has expired
    if ((exportRecord as any).expiresAt && new Date() > (exportRecord as any).expiresAt) {
      res.status(410).json({
        success: false,
        error: 'Export has expired. Please request a new export.',
      });
      return;
    }

    // Re-generate the export data
    const exportData = await DataExportService.collectUserData(storeId, customerId);

    // Set headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user-data-export-${new Date().toISOString().split('T')[0]}.json"`
    );

    res.status(200).json(exportData);
  } catch (error: any) {
    console.error('Error downloading export:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download export',
    });
  }
}

// =============================================================================
// ADMIN ENDPOINTS
// =============================================================================

/**
 * Initiate data export for a customer (Admin/Merchant)
 * POST /stores/:storeId/customers/:customerId/data-export
 *
 * Allows merchants to initiate GDPR data exports on behalf of customers.
 */
export async function adminRequestDataExport(req: Request, res: Response): Promise<void> {
  try {
    const { customerId, storeId } = req.params;
    const adminUserId = (req as any).userId;

    if (!adminUserId || !storeId) {
      res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
      return;
    }

    // Validate customerId
    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid customer ID',
      });
      return;
    }

    // Verify customer belongs to this store
    const Customer = mongoose.model('Customer');
    const customer = await Customer.findOne({
      _id: customerId,
      storeId,
    });

    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create export request (merchant-initiated)
    const exportRequest = await DataExportService.createExportRequest(
      storeId,
      customerId,
      'merchant',
      adminUserId
    );

    // Process export
    const result = await DataExportService.processExportRequest(exportRequest._id as string);

    if (!result.success) {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to process export',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        exportId: exportRequest._id,
        customerId,
        status: 'completed',
        requestedAt: exportRequest.requestedAt,
        requestedBy: 'merchant',
        dataCategories: result.data?.dataCategories,
        exportData: result.data,
      },
      message: 'Customer data export completed',
    });
  } catch (error: any) {
    console.error('Error in admin data export:', error);

    // Handle rate limiting
    if (error.nextAvailableAt) {
      res.status(429).json({
        success: false,
        error: 'Export request limit reached for this customer',
        nextAvailableAt: error.nextAvailableAt,
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export customer data',
    });
  }
}

/**
 * Get all data exports for a store (Admin/Merchant)
 * GET /stores/:storeId/data-exports
 *
 * Returns paginated list of all export requests for the store.
 */
export async function adminGetDataExports(req: Request, res: Response): Promise<void> {
  try {
    const { storeId } = req.params;
    const { limit = '20', offset = '0', status } = req.query;

    if (!storeId) {
      res.status(401).json({
        success: false,
        error: 'Admin authentication required',
      });
      return;
    }

    const { exports, total } = await DataExportService.getStoreExports(storeId, {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      status: status as any,
    });

    res.status(200).json({
      success: true,
      data: {
        exports: exports.map((exp: any) => ({
          id: exp._id,
          customerId: exp.customerId?._id || exp.customerId,
          customerEmail: exp.customerId?.email,
          customerName: exp.customerId?.name,
          status: exp.status,
          requestedBy: exp.requestedBy,
          requestedAt: exp.requestedAt,
          completedAt: exp.completedAt,
          expiresAt: exp.expiresAt,
          dataCategories: exp.dataCategories,
          fileSize: exp.fileSize,
        })),
        pagination: {
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting store exports:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get exports',
    });
  }
}
