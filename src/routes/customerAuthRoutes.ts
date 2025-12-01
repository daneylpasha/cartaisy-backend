import { Router } from 'express';
import {
  registerCustomer,
  loginCustomer,
  getCustomerProfile,
  updateCustomerProfile,
  logoutCustomer,
  updateDeviceToken,
} from '../controllers/customerAuthController';
import {
  authenticateCustomer,
  extractStoreId,
} from '../middleware/customerAuth';

const router = Router();

// Public routes - require storeId
router.post('/register', extractStoreId, registerCustomer);
router.post('/login', extractStoreId, loginCustomer);

// Protected routes - require customer JWT
router.get('/profile', authenticateCustomer, getCustomerProfile);
router.patch('/profile', authenticateCustomer, updateCustomerProfile);
router.post('/logout', authenticateCustomer, logoutCustomer);
router.post('/device-token', authenticateCustomer, updateDeviceToken);

export default router;
