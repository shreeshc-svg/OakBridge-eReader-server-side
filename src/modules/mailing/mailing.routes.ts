import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { mailing_controller } from './mailing.controller';

const router = Router();

// Public: unsubscribe link in marketing emails (protected by a signed token)
router.get('/unsubscribe', mailing_controller.unsubscribe_page);
router.post('/unsubscribe', mailing_controller.unsubscribe);

// Admin 'Email Updates' page (SUPERADMIN only)
router.use(authenticate, check_role(['SUPERADMIN']));

router.get('/overview', mailing_controller.get_overview);
router.get('/users', mailing_controller.search_users);
router.post('/users/match', mailing_controller.match_emails);
router.post('/audience/preview', mailing_controller.preview_audience);
router.post('/announce', mailing_controller.announce_books);
router.put('/automatic', mailing_controller.update_automatic);

export default router;
