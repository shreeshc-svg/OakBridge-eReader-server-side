import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { institution_controller } from './institution.controller';

const router = Router();

// Protect all institution routes to INSTITUTION_ADMIN only
router.use(authenticate);
router.use(check_role(['INSTITUTION_ADMIN']));

router.get('/members', institution_controller.get_members);
router.post('/members', institution_controller.add_member);
router.delete('/members/:id', institution_controller.remove_member);

export default router;
