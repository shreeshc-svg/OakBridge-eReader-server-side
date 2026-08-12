import { Router } from 'express';
import { auth_controller } from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

import { authLimiter } from '../../middlewares/rate_limiter.middleware';

// Route to send OTP
router.post('/send-otp', authLimiter, auth_controller.send_otp);

// Route to register user using OTP verification
router.post('/create-user', authLimiter, auth_controller.register);

// Institutional routes
router.post('/institution/send-otp', authLimiter, auth_controller.send_institution_otp);
router.post('/institution/login', authLimiter, auth_controller.login_institution);

// Route to login user
router.post('/login-user', authLimiter, auth_controller.login_user);

// Forgot and Reset Password routes (for normal users)
router.post('/forgot-password', authLimiter, auth_controller.forgot_password);
router.post('/reset-password', authLimiter, auth_controller.reset_password);

// Route to refresh access token
router.post('/refresh-token', auth_controller.refresh_token);

import { check_role } from '../../middlewares/role.middleware';

// Route to get user detail
router.get('/me', authenticate, auth_controller.get_me);

// Route to update user profile
router.put('/update-profile', authenticate, auth_controller.update_profile);

// Route to logout user (requires authorization)
router.post('/logout-user', auth_controller.logout_user);

// Admins management routes (Superadmin only)
router.get(
     '/admins',
     authenticate,
     check_role(['SUPERADMIN']),
     auth_controller.get_admins
);
router.post(
     '/admins',
     authenticate,
     check_role(['SUPERADMIN']),
     auth_controller.add_admin
);
router.delete(
     '/admins/:id',
     authenticate,
     check_role(['SUPERADMIN']),
     auth_controller.remove_admin
);

// Managers management routes (Superadmin & Admin allowed)
router.get(
     '/managers',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     auth_controller.get_managers
);
router.post(
     '/managers',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     auth_controller.add_manager
);
router.delete(
     '/managers/:id',
     authenticate,
     check_role(['SUPERADMIN', 'ADMIN']),
     auth_controller.remove_manager
);

export default router;
