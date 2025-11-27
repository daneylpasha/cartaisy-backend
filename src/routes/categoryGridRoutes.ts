import { Router } from 'express';
import { categoryGridController } from '../controllers/categoryGridController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/category-grid', categoryGridController.getCategoryGridItems);

router.post('/admin/category-grid', requireStoreAdmin, categoryGridController.createCategoryGridItems);

router.put('/admin/category-grid', requireStoreAdmin, categoryGridController.updateCategoryGridItems);

router.delete('/admin/category-grid/:id', requireStoreAdmin, categoryGridController.deleteCategoryGridItem);

router.patch('/admin/category-grid/:id/status', requireStoreAdmin, categoryGridController.updateCategoryGridItemStatus);

export default router;