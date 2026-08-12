import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { categories_controller } from './categories.controller';

const router = Router();

router
     .route('/create-category')
     .post(
          authenticate,
          check_role(['SUPERADMIN', 'ADMIN']),
          categories_controller.create_category
     );

router
     .route('/get-all-categories')
     .get(categories_controller.get_all_categories);

router
     .route('/update-category')
     .put(
          authenticate,
          check_role(['SUPERADMIN', 'ADMIN']),
          categories_controller.update_category
     );

router
     .route('/delete-category')
     .delete(
          authenticate,
          check_role(['SUPERADMIN', 'ADMIN']),
          categories_controller.delete_category
     );

export default router;
