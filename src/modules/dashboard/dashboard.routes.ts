import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { dashboard_controller } from './dashboard.controller';

const router = Router();

// Route to get aggregated dashboard data for the authenticated user
router.get(
     '/user-overview',
     authenticate,
     dashboard_controller.get_user_overview
);

// Route to get aggregated dashboard data for the authenticated superadmin
router.get(
     '/superadmin-overview',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN', 'MANAGER']),
     dashboard_controller.get_superadmin_overview
);

// Route to get the list of readers for the superadmin's books
router.get(
     '/readers-list',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN', 'MANAGER']),
     dashboard_controller.get_readers_list
);

// Route to toggle right-click permission for a user
router.patch(
     '/toggle-right-click',
     authenticate,
     check_role(['SUPERADMIN']),
     dashboard_controller.toggle_right_click
);

// Route to manually trigger the cart reminder job for testing/Postman
router.post(
     '/trigger-cart-reminder-test',
     dashboard_controller.trigger_cart_reminder_test
);

export default router;
