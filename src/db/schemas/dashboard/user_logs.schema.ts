import { pgTable, timestamp, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';

export const userLogs = pgTable('user_logs', {
     id: uuid('id').primaryKey().defaultRandom().notNull(),
     userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
     userName: varchar('user_name', { length: 255 }),
     action: varchar('action', { length: 255 }).notNull(),
     details: text('details'),
     ipAddress: varchar('ip_address', { length: 45 }),
     createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type UserLog = typeof userLogs.$inferSelect;
export type NewUserLog = typeof userLogs.$inferInsert;
