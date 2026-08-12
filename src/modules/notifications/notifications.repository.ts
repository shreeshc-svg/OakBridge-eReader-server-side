import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db/db';
import { notifications } from '../../db/schemas';

export const notifications_repository = {
     async get_user_notifications(userId: string) {
          return await db
               .select()
               .from(notifications)
               .where(eq(notifications.userId, userId))
               .orderBy(desc(notifications.createdAt));
     },

     async mark_as_read(id: string, userId: string) {
          const result = await db
               .update(notifications)
               .set({ isRead: true })
               .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
               .returning();
          return result[0];
     },

     async mark_all_as_read(userId: string) {
          return await db
               .update(notifications)
               .set({ isRead: true })
               .where(eq(notifications.userId, userId))
               .returning();
     },

     async create_notifications(data: Array<{ id: string; userId: string; title: string; message: string }>) {
          if (data.length === 0) return [];
          return await db.insert(notifications).values(data).returning();
     },
};
