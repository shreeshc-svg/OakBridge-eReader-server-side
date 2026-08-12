import { Request, Response } from 'express';
import { notifications_service } from './notifications.service';

export const notifications_controller = {
     async get_notifications(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const result = await notifications_service.get_user_notifications(userId);
               return res.status(200).json({
                    message: 'Notifications retrieved successfully',
                    notifications: result,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to retrieve notifications',
               });
          }
     },

     async mark_notification_read(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const id = req.params.id as string;
               if (!id) {
                    return res.status(400).json({ message: 'Notification ID is required' });
               }

               const result = await notifications_service.mark_as_read(id, userId);
               if (!result) {
                    return res.status(404).json({ message: 'Notification not found or access denied' });
               }

               return res.status(200).json({
                    message: 'Notification marked as read successfully',
                    notification: result,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to update notification status',
               });
          }
     },

     async mark_all_read(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               await notifications_service.mark_all_as_read(userId);
               return res.status(200).json({
                    message: 'All notifications marked as read',
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to mark all notifications as read',
               });
          }
     },
};
