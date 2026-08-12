import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { reviews_controller } from './reviews.controller';

const router = Router();

// Route to submit a review (Authenticated users)
router.post('/submit', authenticate, reviews_controller.submit_review);

// Route to fetch pending reviews (Superadmin and Admin)
router.get(
     '/pending',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     reviews_controller.get_pending_reviews
);

// Route to fetch all reviews with optional status filter (Superadmin and Admin)
router.get(
     '/admin/all',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     reviews_controller.get_all_reviews_for_admin
);

// Route to approve/reject a review (Superadmin and Admin)
router.put(
     '/:id/status',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     reviews_controller.moderate_review
);

// Route to get approved reviews for a specific book (Public)
router.get('/book/:bookId', reviews_controller.get_book_reviews);

export default router;
