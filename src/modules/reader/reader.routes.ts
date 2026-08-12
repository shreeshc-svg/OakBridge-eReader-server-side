import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { reader_controller } from './reader.controller';

const router = Router();

router.get('/progress/:book_id', authenticate, reader_controller.get_progress);
router.post(
     '/progress/:book_id',
     authenticate,
     reader_controller.update_progress
);

router.get(
     '/highlights/:book_id',
     authenticate,
     reader_controller.get_highlights
);
router.post('/highlights', authenticate, reader_controller.add_highlight);
router.delete(
     '/highlights/:highlight_id',
     authenticate,
     reader_controller.remove_highlight
);

router.get(
     '/bookmarks/:book_id',
     authenticate,
     reader_controller.get_bookmarks
);
router.post('/bookmarks', authenticate, reader_controller.add_bookmark);
router.delete(
     '/bookmarks/:bookmark_id',
     authenticate,
     reader_controller.remove_bookmark
);

export default router;
