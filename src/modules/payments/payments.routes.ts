import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { payments_controller } from './payments.controller';
import { getActiveSubscriptionPlans } from '../superadmin/superadmin.controller';

const router = Router();

router.post('/create-order', authenticate, payments_controller.create_order);
router.post('/create-cart-order', authenticate, payments_controller.create_cart_order);
router.post('/verify', authenticate, payments_controller.verify_payment);
router.get('/coupon/validate', authenticate, payments_controller.validate_coupon);
router.post(
     '/subscribe',
     authenticate,
     payments_controller.create_subscription_order
);
router.get(
     '/subscription-plans/active',
     getActiveSubscriptionPlans
);

router.get('/history', authenticate, payments_controller.get_payment_history);
router.get('/invoice/:paymentId', authenticate, payments_controller.download_invoice);

export default router;
