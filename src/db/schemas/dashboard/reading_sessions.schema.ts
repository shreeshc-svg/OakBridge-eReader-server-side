import { integer, pgTable, timestamp, uuid, date } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';

export const reading_sessions = pgTable('reading_sessions', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     date: date('date').notNull(), // stored as YYYY-MM-DD
     minutes_read: integer('minutes_read').notNull().default(0),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
