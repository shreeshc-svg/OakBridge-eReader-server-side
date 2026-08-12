import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { notifications_controller } from './notifications.controller';

const router = Router();

// Retrieve all notifications for the current user
router.get('/', authenticate, notifications_controller.get_notifications);

// Mark all notifications for the current user as read
router.patch('/read', authenticate, notifications_controller.mark_all_read);

// Mark a single notification as read
router.patch('/:id/read', authenticate, notifications_controller.mark_notification_read);

export default router;
