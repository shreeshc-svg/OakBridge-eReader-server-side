import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { cart_controller } from './cart.controller';

const router = Router();

router.get('/', authenticate, cart_controller.get_cart);
router.post('/add', authenticate, cart_controller.add_to_cart);
router.delete('/remove/:book_id', authenticate, cart_controller.remove_from_cart);
router.delete('/clear', authenticate, cart_controller.clear_cart);
router.patch('/save/:book_id', authenticate, cart_controller.move_to_saved);
router.patch('/activate/:book_id', authenticate, cart_controller.move_to_cart);
router.get('/count', authenticate, cart_controller.get_cart_count);

export default router;
