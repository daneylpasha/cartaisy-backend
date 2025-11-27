import { Router } from 'express';
import { categoryCollectionGridController } from '../controllers/categoryCollectionGridController';
import { requireStoreAdmin } from '../middleware/auth';

const router = Router();

router.get('/category-collection-grids', categoryCollectionGridController.getCategoryCollectionGrids);

router.post('/admin/category-collection-grids', requireStoreAdmin, categoryCollectionGridController.createCategoryCollectionGrids);

router.put('/admin/category-collection-grids', requireStoreAdmin, categoryCollectionGridController.updateCategoryCollectionGrids);

router.delete('/admin/category-collection-grids/:id', requireStoreAdmin, categoryCollectionGridController.deleteCategoryCollectionGrid);

router.patch('/admin/category-collection-grids/:id/status', requireStoreAdmin, categoryCollectionGridController.updateCategoryCollectionGridStatus);

export default router;
