import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { check_role } from '../../middlewares/role.middleware';
import * as superadminController from './superadmin.controller';

const router = Router();

// Public route to submit a contact message
router.post('/contact-messages', superadminController.createContactMessage);

// Protect all routes under superadmin to SUPERADMIN, ADMIN and MANAGER roles
router.use(authenticate, check_role(['SUPERADMIN', 'ADMIN', 'MANAGER']));

// Protected route to fetch all contact messages
router.get('/contact-messages', superadminController.getContactMessages);
router.delete('/contact-messages/:id', superadminController.deleteContactMessage);

router.get('/analytics/revenue', superadminController.getRevenueAnalytics);
router.get('/analytics/reports', superadminController.getReportData);
router.get('/analytics/logs', superadminController.getActivityLogs);
router.get('/analytics/orders/export', superadminController.exportOrdersReport);
router.get('/analytics/reports/export', superadminController.exportReport);
router.get('/institutions', check_role(['SUPERADMIN']), superadminController.getInstitutions);
router.get('/institutions/:id/allowed-categories', check_role(['SUPERADMIN']), superadminController.getInstitutionAllowedCategories);
router.post('/institutions/:id/allowed-categories', check_role(['SUPERADMIN']), superadminController.updateInstitutionAllowedCategories);
router.get('/institutions/:id/allowed-books', check_role(['SUPERADMIN']), superadminController.getInstitutionAllowedBooks);
router.post('/institutions/:id/allowed-books', check_role(['SUPERADMIN']), superadminController.updateInstitutionAllowedBooks);
router.delete('/institutions/:id', check_role(['SUPERADMIN']), superadminController.deleteInstitution);
router.put('/institutions/:id', check_role(['SUPERADMIN']), superadminController.updateInstitution);

// Subscription plans management routes (SUPERADMIN role only)
router.get('/subscription-plans', check_role(['SUPERADMIN']), superadminController.getSubscriptionPlans);
router.post('/subscription-plans', check_role(['SUPERADMIN']), superadminController.createSubscriptionPlan);
router.put('/subscription-plans/:id', check_role(['SUPERADMIN']), superadminController.updateSubscriptionPlan);
router.delete('/subscription-plans/:id', check_role(['SUPERADMIN']), superadminController.deleteSubscriptionPlan);

// Free candidates management routes (SUPERADMIN role only)
router.get('/free-candidates', check_role(['SUPERADMIN']), superadminController.getFreeCandidates);
router.post('/free-candidates', check_role(['SUPERADMIN']), superadminController.createFreeCandidate);
router.get('/free-candidates/:id/allowed-books', check_role(['SUPERADMIN']), superadminController.getFreeCandidateAllowedBooks);
router.post('/free-candidates/:id/allowed-books', check_role(['SUPERADMIN']), superadminController.updateFreeCandidateAllowedBooks);

// Coupon management routes (SUPERADMIN role only)
router.get('/coupons', check_role(['SUPERADMIN']), superadminController.getCoupons);
router.post('/coupons', check_role(['SUPERADMIN']), superadminController.createCoupon);
router.put('/coupons/:id', check_role(['SUPERADMIN']), superadminController.updateCoupon);
router.delete('/coupons/:id', check_role(['SUPERADMIN']), superadminController.deleteCoupon);

export default router;
