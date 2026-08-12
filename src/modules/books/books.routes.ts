import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { books_controller } from './books.controller';
import multer from 'multer';

const router = Router();
const upload = multer({
     storage: multer.memoryStorage(),
     limits: {
          fileSize: 500 * 1024 * 1024, // 500 MB limit
     },
});

const uploadFields = upload.fields([
     { name: 'cover_image', maxCount: 1 },
     { name: 'book_file', maxCount: 1 },
     { name: 'preview_pages', maxCount: 20 },
]);

// Route to create a new book (Only SUPERADMIN/ADMIN can create/upload books)
router.post(
     '/create-book',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     uploadFields,
     books_controller.create_book
);

// Route to get all books (Publicly accessible)
router.get('/get-all-books', books_controller.get_all_books);

// Route to get publisher recommendations for a user (Authenticated)
router.get(
     '/get-recommendations',
     authenticate,
     books_controller.get_recommendations
);

// Route to get a specific book by ID (Publicly accessible)
router.get('/get-book', books_controller.get_book_by_id);

// Route to proxy public preview files to bypass CORS
router.get('/preview-proxy', books_controller.preview_proxy);

// Route to download a specific book via proxy
router.get('/download-book', authenticate, books_controller.download_book);

// Route to get DRM decryption key for a book
router.get('/drm-key', authenticate, books_controller.get_drm_key);

// Route to update a book (Only SUPERADMIN/ADMIN can update books)
router.put(
     '/update-book',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     uploadFields,
     books_controller.update_book
);

// Route to delete a book (Only SUPERADMIN can delete books)
router.delete(
     '/delete-book',
     authenticate,
     check_role(['SUPERADMIN']),
     books_controller.delete_book
);

export default router;
