import { notifications_repository } from './notifications.repository';
import { db } from '../../db/db';
import { users } from '../../db/schemas';
import { and, ne, eq } from 'drizzle-orm';
import crypto from 'crypto';

export const notifications_service = {
     async get_user_notifications(userId: string) {
          return await notifications_repository.get_user_notifications(userId);
     },

     async mark_as_read(id: string, userId: string) {
          return await notifications_repository.mark_as_read(id, userId);
     },

     async mark_all_as_read(userId: string) {
          return await notifications_repository.mark_all_as_read(userId);
     },

     async notify_new_book(bookTitle: string) {
          try {
               // Get all users who are not superadmins or admins
               const targetUsers = await db
                    .select({ id: users.id })
                    .from(users)
                    .where(
                         and(
                              ne(users.role, 'SUPERADMIN'),
                              ne(users.role, 'ADMIN')
                         )
                    );

               if (targetUsers.length === 0) return;

               const notificationRows = targetUsers.map((user) => ({
                    id: crypto.randomUUID(),
                    userId: user.id,
                    title: 'New Book Added! 📚',
                    message: `"${bookTitle}" is now available in the store. Check it out!`,
               }));

               // Bulk insert notifications
               await notifications_repository.create_notifications(notificationRows);
          } catch (error) {
               console.error('Failed to notify users about new book:', error);
          }
     },

     async notify_new_review(reviewerName: string, bookTitle: string) {
          try {
               const superAdmins = await db
                    .select({ id: users.id })
                    .from(users)
                    .where(eq(users.role, 'SUPERADMIN'));

               if (superAdmins.length === 0) return;

               const notificationRows = superAdmins.map((admin) => ({
                    id: crypto.randomUUID(),
                    userId: admin.id,
                    title: 'New Book Review Submitted ✍️',
                    message: `"${reviewerName}" has submitted a review for "${bookTitle}".`,
               }));

               await notifications_repository.create_notifications(notificationRows);
          } catch (error) {
               console.error('Failed to notify superadmins about new review:', error);
          }
     },
};
