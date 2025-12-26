import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  getAbandonedCartsForAdmin,
  getAbandonedCartSettings,
  updateAbandonedCartSettings,
  clearSettingsCache,
  AbandonedCartSettings,
} from '../../services/abandonedCartService';
import { abandonedCartScheduler } from '../../services/abandonedCartScheduler';
import CartActivity from '../../models/CartActivity';
import Customer from '../../models/Customer';

/**
 * Abandoned Cart Admin Controller
 *
 * Provides admin endpoints for:
 * - Viewing abandoned carts
 * - Managing abandoned cart notification settings
 * - Manually triggering notifications
 * - Viewing scheduler status
 */

// =============================================================================
// ABANDONED CARTS LIST
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/abandoned-carts
 *
 * List currently abandoned carts for manual review
 */
export const listAbandonedCarts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { limit, offset, minHours } = req.query;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const result = await getAbandonedCartsForAdmin(storeId, {
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0,
      minHoursAbandoned: minHours ? parseInt(minHours as string, 10) : 1,
    });

    res.json({
      success: true,
      data: {
        carts: result.carts,
        pagination: {
          total: result.total,
          limit: limit ? parseInt(limit as string, 10) : 20,
          offset: offset ? parseInt(offset as string, 10) : 0,
          hasMore:
            (offset ? parseInt(offset as string, 10) : 0) +
              (limit ? parseInt(limit as string, 10) : 20) <
            result.total,
        },
      },
    });
  } catch (error) {
    console.error('Error listing abandoned carts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list abandoned carts',
    });
  }
};

/**
 * GET /api/v1/admin/stores/:storeId/abandoned-carts/stats
 *
 * Get abandoned cart statistics
 */
export const getAbandonedCartStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const storeObjectId = new mongoose.Types.ObjectId(storeId);
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalAbandoned,
      abandonedLastHour,
      abandonedLastDay,
      abandonedLastWeek,
      notificationsSent,
      recoveredCarts,
      totalCartValue,
    ] = await Promise.all([
      // Total abandoned carts
      CartActivity.countDocuments({
        storeId: storeObjectId,
        itemCount: { $gt: 0 },
        hasCompletedCheckout: false,
      }),

      // Abandoned in last hour
      CartActivity.countDocuments({
        storeId: storeObjectId,
        itemCount: { $gt: 0 },
        hasCompletedCheckout: false,
        lastCartUpdate: { $lt: oneHourAgo },
      }),

      // Abandoned in last 24 hours
      CartActivity.countDocuments({
        storeId: storeObjectId,
        itemCount: { $gt: 0 },
        hasCompletedCheckout: false,
        lastCartUpdate: { $gte: oneDayAgo, $lt: oneHourAgo },
      }),

      // Abandoned in last week
      CartActivity.countDocuments({
        storeId: storeObjectId,
        itemCount: { $gt: 0 },
        hasCompletedCheckout: false,
        lastCartUpdate: { $gte: oneWeekAgo },
      }),

      // Total notifications sent
      CartActivity.aggregate([
        { $match: { storeId: storeObjectId } },
        { $group: { _id: null, total: { $sum: '$abandonedCartNotificationCount' } } },
      ]),

      // Recovered carts (completed checkout after notification)
      CartActivity.countDocuments({
        storeId: storeObjectId,
        hasCompletedCheckout: true,
        abandonedCartNotificationCount: { $gt: 0 },
      }),

      // Total value of abandoned carts
      CartActivity.aggregate([
        {
          $match: {
            storeId: storeObjectId,
            itemCount: { $gt: 0 },
            hasCompletedCheckout: false,
          },
        },
        { $group: { _id: null, total: { $sum: '$cartTotal' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalAbandoned,
          abandonedLastHour,
          abandonedLastDay,
          abandonedLastWeek,
        },
        notifications: {
          totalSent: notificationsSent[0]?.total || 0,
          recoveredCarts,
          recoveryRate:
            notificationsSent[0]?.total > 0
              ? Math.round((recoveredCarts / notificationsSent[0].total) * 100)
              : 0,
        },
        value: {
          totalAbandonedValue: Math.round((totalCartValue[0]?.total || 0) * 100) / 100,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting abandoned cart stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get abandoned cart stats',
    });
  }
};

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

/**
 * GET /api/v1/admin/stores/:storeId/settings/abandoned-cart
 *
 * Get abandoned cart settings for a store
 */
export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const settings = await getAbandonedCartSettings(storeId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error getting abandoned cart settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings',
    });
  }
};

/**
 * PATCH /api/v1/admin/stores/:storeId/settings/abandoned-cart
 *
 * Update abandoned cart settings for a store
 */
export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const updates = req.body as Partial<AbandonedCartSettings>;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    // Validate settings
    if (updates.abandonmentThresholdMinutes !== undefined) {
      if (updates.abandonmentThresholdMinutes < 1 || updates.abandonmentThresholdMinutes > 1440) {
        res.status(400).json({
          success: false,
          error: 'Abandonment threshold must be between 1 and 1440 minutes',
        });
        return;
      }
    }

    if (updates.quietHoursStart !== undefined || updates.quietHoursEnd !== undefined) {
      const start = updates.quietHoursStart ?? 22;
      const end = updates.quietHoursEnd ?? 8;
      if (start < 0 || start > 23 || end < 0 || end > 23) {
        res.status(400).json({
          success: false,
          error: 'Quiet hours must be between 0 and 23',
        });
        return;
      }
    }

    if (updates.maxNotificationsPerCart !== undefined) {
      if (updates.maxNotificationsPerCart < 1 || updates.maxNotificationsPerCart > 10) {
        res.status(400).json({
          success: false,
          error: 'Max notifications per cart must be between 1 and 10',
        });
        return;
      }
    }

    const settings = await updateAbandonedCartSettings(storeId, updates);

    res.json({
      success: true,
      data: settings,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating abandoned cart settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
    });
  }
};

// =============================================================================
// SCHEDULER CONTROL
// =============================================================================

/**
 * GET /api/v1/admin/abandoned-carts/scheduler/status
 *
 * Get scheduler status (global, not per-store)
 */
export const getSchedulerStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = abandonedCartScheduler.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status',
    });
  }
};

/**
 * POST /api/v1/admin/stores/:storeId/abandoned-carts/process
 *
 * Manually trigger abandoned cart processing for a store
 */
export const triggerProcessing = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    const result = await abandonedCartScheduler.processStore(storeId);

    res.json({
      success: true,
      data: result,
      message: `Processed ${result.processed} abandoned carts, sent ${result.sent} notifications`,
    });
  } catch (error) {
    console.error('Error triggering abandoned cart processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger processing',
    });
  }
};

/**
 * POST /api/v1/admin/abandoned-carts/scheduler/trigger
 *
 * Manually trigger abandoned cart processing for all stores
 */
export const triggerGlobalProcessing = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await abandonedCartScheduler.triggerProcessing();

    const totalSent = result.stats.reduce((sum, s) => sum + s.sent, 0);
    const totalFailed = result.stats.reduce((sum, s) => sum + s.failed, 0);

    res.json({
      success: true,
      data: {
        duration: result.duration,
        storeCount: result.stats.length,
        totalSent,
        totalFailed,
        stores: result.stats,
      },
      message: `Processed ${result.stats.length} stores, sent ${totalSent} notifications`,
    });
  } catch (error) {
    console.error('Error triggering global processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger global processing',
    });
  }
};

/**
 * POST /api/v1/admin/stores/:storeId/abandoned-carts/reset-notification-count
 *
 * Reset notification count for a customer's cart (for testing)
 */
export const resetNotificationCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const { storeId } = req.params;
    const { email, customerId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid store ID',
      });
      return;
    }

    let targetCustomerId = customerId;

    // If email provided, find customer by email
    if (email && !customerId) {
      const customer = await Customer.findOne({
        storeId: new mongoose.Types.ObjectId(storeId),
        email: email.toLowerCase(),
      });

      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'Customer not found with this email',
        });
        return;
      }
      targetCustomerId = customer._id.toString();
    }

    if (!targetCustomerId) {
      res.status(400).json({
        success: false,
        error: 'Either email or customerId is required',
      });
      return;
    }

    // Reset notification count
    const result = await CartActivity.findOneAndUpdate(
      {
        storeId: new mongoose.Types.ObjectId(storeId),
        customerId: new mongoose.Types.ObjectId(targetCustomerId),
      },
      {
        $set: {
          abandonedCartNotificationCount: 0,
          lastAbandonedCartNotificationSent: null,
        },
      },
      { new: true }
    );

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Cart activity not found for this customer',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Notification count reset successfully',
      data: {
        customerId: targetCustomerId,
        abandonedCartNotificationCount: result.abandonedCartNotificationCount,
        lastAbandonedCartNotificationSent: result.lastAbandonedCartNotificationSent,
      },
    });
  } catch (error) {
    console.error('Error resetting notification count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset notification count',
    });
  }
};
