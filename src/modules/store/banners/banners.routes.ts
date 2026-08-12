import { Router } from 'express';
import {
     getBanners,
     getAllBanners,
     createBanner,
     updateBanner,
     deleteBanner,
     reorderBanners,
} from './banners.controller';
import { authenticate } from '../../../middlewares/auth.middleware';
import { check_role } from '../../../middlewares/role.middleware';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public route for Store Page
router.get('/', getBanners);

// Protected routes for Superadmin Dashboard
router.use(authenticate);
router.use(check_role(['SUPERADMIN', 'ADMIN']));

router.get('/all', getAllBanners);
router.put('/reorder', reorderBanners);
router.post('/', upload.single('image'), createBanner);
router.put('/:id', upload.single('image'), updateBanner);
router.delete('/:id', deleteBanner);

export default router;
