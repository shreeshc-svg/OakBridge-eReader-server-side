import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import { settings_controller } from './settings.controller';

const router = Router();

router.get('/:key', settings_controller.get_setting);
router.put(
     '/update',
     authenticate,
     check_role(['SUPERADMIN']),
     settings_controller.update_setting
);

export default router;
