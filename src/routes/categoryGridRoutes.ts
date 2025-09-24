import { Router } from 'express';
import { categoryGridController } from '../controllers/categoryGridController';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

router.get('/category-grid', categoryGridController.getCategoryGridItems);

router.post('/admin/category-grid', authenticateAdmin, categoryGridController.createCategoryGridItems);

router.put('/admin/category-grid', authenticateAdmin, categoryGridController.updateCategoryGridItems);

router.delete('/admin/category-grid/:id', authenticateAdmin, categoryGridController.deleteCategoryGridItem);

router.patch('/admin/category-grid/:id/status', authenticateAdmin, categoryGridController.updateCategoryGridItemStatus);

export default router;