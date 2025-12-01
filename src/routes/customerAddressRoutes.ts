import { Router } from 'express';
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from '../controllers/customerAddressController';
import { authenticateCustomer } from '../middleware/customerAuth';

const router = Router();

// All routes require customer authentication
router.use(authenticateCustomer);

router.get('/', getAddresses);
router.post('/', addAddress);
router.patch('/:addressId', updateAddress);
router.delete('/:addressId', deleteAddress);
router.patch('/:addressId/default', setDefaultAddress);

export default router;
