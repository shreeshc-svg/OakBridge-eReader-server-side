import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';

export const notifications = pgTable('notifications', {
     id: uuid('id').primaryKey().notNull(),
     userId: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     title: varchar('title', { length: 255 }).notNull(),
     message: varchar('message', { length: 1000 }).notNull(),
     isRead: boolean('is_read').notNull().default(false),
     createdAt: timestamp('created_at').notNull().defaultNow(),
});
