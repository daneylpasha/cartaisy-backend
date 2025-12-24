import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Customer from '../../models/Customer';
import Order from '../../models/Order';
import PaymentMethod from '../../models/PaymentMethod';
import SearchHistory from '../../models/SearchHistory';
import ProductView from '../../models/ProductView';
import CartActivity from '../../models/CartActivity';
import AuditLog from '../../models/AuditLog';
import NotificationEngagement from '../../models/NotificationEngagement';
import DataExport from '../../models/DataExport';
import Wishlist from '../../models/Wishlist';
import * as DataExportService from '../../services/dataExportService';

/**
 * GDPR Compliance Controller
 *
 * Handles GDPR-compliant data export and deletion requests for dashboard.
 * All routes require admin authentication.
 */

// =============================================================================
// 1. EXPORT SINGLE CUSTOMER DATA
// =============================================================================

/**
 * POST /api/v1/stores/:storeId/compliance/export/customer/:customerId
 *
 * Export all data for a specific customer (GDPR Article 20)
 */
export async function exportCustomerData(req: Request, res: Response): Promise<void> {
  try {
    const { storeId, customerId } = req.params;
    const adminUserId = (req as any).userId;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store or customer ID',
      });
      return;
    }

    // Verify customer exists and belongs to store
    const customer = await Customer.findOne({ _id: customerId, storeId }).select('_id email name');
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create export request
    const exportRequest = await DataExportService.createExportRequest(
      storeId,
      customerId,
      'merchant',
      adminUserId
    );

    // Process export (in production, this would be queued)
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
        customerId,
        customerEmail: customer.email,
        customerName: customer.name,
        requestedAt: exportRequest.requestedAt,
        completedAt: new Date(),
        dataCategories: result.data?.dataCategories,
        exportData: result.data,
      },
    });
  } catch (error: any) {
    console.error('Error exporting customer data:', error);

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

// =============================================================================
// 2. EXPORT ALL CUSTOMERS DATA (BULK)
// =============================================================================

/**
 * POST /api/v1/stores/:storeId/compliance/export/all
 *
 * Export all customer data for the entire store (bulk GDPR export)
 */
export async function exportAllCustomersData(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  try {
    const { storeId } = req.params;
    const adminUserId = (req as any).userId;
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Get all customers for the store
    const customers = await Customer.find({ storeId, isActive: true })
      .select('_id email name')
      .lean();

    if (customers.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          exportId: new mongoose.Types.ObjectId().toString(),
          status: 'completed',
          totalCustomers: 0,
          message: 'No active customers found',
          exports: [],
        },
      });
      return;
    }

    // Create a bulk export record
    const bulkExportId = new mongoose.Types.ObjectId();
    const exportResults: any[] = [];
    const errors: any[] = [];

    // Process each customer (in production, this would be batched/queued)
    for (const customer of customers) {
      try {
        const customerId = (customer._id as mongoose.Types.ObjectId).toString();
        const userData = await DataExportService.collectUserData(storeId, customerId);
        exportResults.push({
          customerId: customer._id,
          email: customer.email,
          name: customer.name,
          data: userData,
        });
      } catch (err: any) {
        errors.push({
          customerId: customer._id,
          email: customer.email,
          error: err.message,
        });
      }
    }

    // Create audit log for bulk export
    await AuditLog.create({
      storeId,
      userId: adminUserId,
      action: 'bulk_data_export',
      endpoint: `/stores/${storeId}/compliance/export/all`,
      method: 'POST',
      ip: clientIp,
      statusCode: 200,
      duration: Date.now() - startTime,
      requestBody: {
        totalCustomers: customers.length,
        successCount: exportResults.length,
        errorCount: errors.length,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        exportId: bulkExportId.toString(),
        status: 'completed',
        totalCustomers: customers.length,
        successCount: exportResults.length,
        errorCount: errors.length,
        requestedAt: new Date(),
        completedAt: new Date(),
        exports: exportResults,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error: any) {
    console.error('Error exporting all customers data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export all customers data',
    });
  }
}

// =============================================================================
// 3. GET EXPORT STATUS
// =============================================================================

/**
 * GET /api/v1/stores/:storeId/compliance/export/:exportId
 *
 * Get status of a specific export request
 */
export async function getExportStatus(req: Request, res: Response): Promise<void> {
  try {
    const { storeId, exportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(exportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store or export ID',
      });
      return;
    }

    const exportRecord = await DataExport.findOne({ _id: exportId, storeId })
      .populate('customerId', 'email name')
      .lean();

    if (!exportRecord) {
      res.status(404).json({
        success: false,
        error: 'Export not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        exportId: exportRecord._id,
        status: exportRecord.status,
        customerId: (exportRecord.customerId as any)?._id || exportRecord.customerId,
        customerEmail: (exportRecord.customerId as any)?.email,
        customerName: (exportRecord.customerId as any)?.name,
        requestedBy: exportRecord.requestedBy,
        requestedAt: exportRecord.requestedAt,
        processingStartedAt: exportRecord.processingStartedAt,
        completedAt: exportRecord.completedAt,
        expiresAt: exportRecord.expiresAt,
        fileSize: exportRecord.fileSize,
        dataCategories: exportRecord.dataCategories,
        errorMessage: exportRecord.errorMessage,
        // Download URL would be here if using cloud storage
        downloadUrl: exportRecord.status === 'completed'
          ? `/api/v1/stores/${storeId}/compliance/export/${exportId}/download`
          : null,
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

// =============================================================================
// 4. GET EXPORT HISTORY
// =============================================================================

/**
 * GET /api/v1/stores/:storeId/compliance/exports
 *
 * Get all export requests for the store
 */
export async function getExportHistory(req: Request, res: Response): Promise<void> {
  try {
    const { storeId } = req.params;
    const { limit = '20', offset = '0', status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
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
          exportId: exp._id,
          customerId: exp.customerId?._id || exp.customerId,
          customerEmail: exp.customerId?.email,
          customerName: exp.customerId?.name,
          status: exp.status,
          requestedBy: exp.requestedBy,
          requestedAt: exp.requestedAt,
          completedAt: exp.completedAt,
          expiresAt: exp.expiresAt,
          fileSize: exp.fileSize,
          dataCategories: exp.dataCategories,
        })),
        pagination: {
          total,
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          hasMore: parseInt(offset as string, 10) + parseInt(limit as string, 10) < total,
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

// =============================================================================
// 5. DELETE CUSTOMER DATA (RIGHT TO BE FORGOTTEN - GDPR ARTICLE 17)
// =============================================================================

/**
 * POST /api/v1/stores/:storeId/compliance/delete/customer/:customerId
 *
 * Delete all personal data for a customer while preserving anonymized order history
 */
export async function deleteCustomerData(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  try {
    const { storeId, customerId } = req.params;
    const adminUserId = (req as any).userId;
    const clientIp = req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
    const { reason, confirmDelete } = req.body;

    // Require confirmation
    if (confirmDelete !== true) {
      res.status(400).json({
        success: false,
        error: 'Please confirm deletion by setting confirmDelete: true',
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(customerId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store or customer ID',
      });
      return;
    }

    // Get customer before deletion for audit
    const customer = await Customer.findOne({ _id: customerId, storeId });
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    const customerEmail = customer.email;
    const deletionSummary: Record<string, number> = {};

    // 1. Anonymize orders (keep for financial records but remove PII)
    const ordersResult = await Order.updateMany(
      { customer: customerId },
      {
        $set: {
          email: `deleted-${customerId}@anonymized.local`,
          'shippingAddress.firstName': 'DELETED',
          'shippingAddress.lastName': 'USER',
          'shippingAddress.phone': null,
          'shippingAddress.address1': 'REDACTED',
          'shippingAddress.address2': null,
          'billingAddress.firstName': 'DELETED',
          'billingAddress.lastName': 'USER',
          'billingAddress.phone': null,
          'billingAddress.address1': 'REDACTED',
          'billingAddress.address2': null,
          'customerNotes': null,
          'specialInstructions': null,
        },
      }
    );
    deletionSummary.ordersAnonymized = ordersResult.modifiedCount;

    // 2. Delete payment methods
    const paymentResult = await PaymentMethod.deleteMany({ userId: customerId });
    deletionSummary.paymentMethodsDeleted = paymentResult.deletedCount;

    // 3. Delete search history
    const searchResult = await SearchHistory.deleteMany({ customerId });
    deletionSummary.searchHistoryDeleted = searchResult.deletedCount;

    // 4. Delete product views
    const viewsResult = await ProductView.deleteMany({ customer: customerId });
    deletionSummary.productViewsDeleted = viewsResult.deletedCount;

    // 5. Delete cart activity
    const cartResult = await CartActivity.deleteMany({ customerId });
    deletionSummary.cartActivityDeleted = cartResult.deletedCount;

    // 6. Delete wishlists
    const wishlistResult = await Wishlist.deleteMany({ customer: customerId });
    deletionSummary.wishlistsDeleted = wishlistResult.deletedCount;

    // 7. Delete notification engagements
    const engagementResult = await NotificationEngagement.deleteMany({ customerId });
    deletionSummary.notificationEngagementsDeleted = engagementResult.deletedCount;

    // 8. Delete data exports
    const exportsResult = await DataExport.deleteMany({ customerId });
    deletionSummary.dataExportsDeleted = exportsResult.deletedCount;

    // 9. Anonymize audit logs (keep for security but remove identifying info)
    const auditResult = await AuditLog.updateMany(
      { userId: customerId },
      {
        $set: {
          userId: `anonymized-${customerId}`,
          metadata: { anonymized: true, originalCustomerId: customerId },
        },
      }
    );
    deletionSummary.auditLogsAnonymized = auditResult.modifiedCount;

    // 10. Finally, delete the customer account
    await Customer.deleteOne({ _id: customerId });
    deletionSummary.customerDeleted = 1;

    // Create audit log for deletion
    await AuditLog.create({
      storeId,
      userId: adminUserId,
      action: 'gdpr_customer_deletion',
      endpoint: `/stores/${storeId}/compliance/delete/customer/${customerId}`,
      method: 'POST',
      ip: clientIp,
      statusCode: 200,
      duration: Date.now() - startTime,
      requestBody: {
        deletedCustomerId: customerId,
        deletedCustomerEmail: customerEmail,
        reason: reason || 'GDPR Article 17 - Right to be Forgotten',
        deletionSummary,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        message: 'Customer data deleted successfully',
        customerId,
        customerEmail,
        deletedAt: new Date(),
        reason: reason || 'GDPR Article 17 - Right to be Forgotten',
        deletionSummary,
        note: 'Orders have been anonymized but preserved for financial records. All other personal data has been permanently deleted.',
      },
    });
  } catch (error: any) {
    console.error('Error deleting customer data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete customer data',
    });
  }
}

// =============================================================================
// BONUS: DOWNLOAD EXPORT DATA
// =============================================================================

/**
 * GET /api/v1/stores/:storeId/compliance/export/:exportId/download
 *
 * Download the exported data as JSON file
 */
export async function downloadExportData(req: Request, res: Response): Promise<void> {
  try {
    const { storeId, exportId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId) || !mongoose.Types.ObjectId.isValid(exportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store or export ID',
      });
      return;
    }

    const exportRecord = await DataExport.findOne({ _id: exportId, storeId });

    if (!exportRecord) {
      res.status(404).json({
        success: false,
        error: 'Export not found',
      });
      return;
    }

    if (exportRecord.status !== 'completed') {
      res.status(400).json({
        success: false,
        error: `Export is ${exportRecord.status}, not available for download`,
      });
      return;
    }

    if (exportRecord.expiresAt && new Date() > exportRecord.expiresAt) {
      res.status(410).json({
        success: false,
        error: 'Export has expired. Please request a new export.',
      });
      return;
    }

    // Re-generate the export data
    const exportData = await DataExportService.collectUserData(storeId, exportRecord.customerId);

    // Set headers for JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="customer-data-export-${exportRecord.customerId}-${new Date().toISOString().split('T')[0]}.json"`
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
