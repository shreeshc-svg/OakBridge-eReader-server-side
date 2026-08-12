import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { library_controller } from './library.controller';

const router = Router();

router.post('/add', authenticate, library_controller.add_book);
router.get('/my-books', authenticate, library_controller.get_my_library);
router.delete('/remove/:book_id', authenticate, library_controller.remove_book);

export default router;
