import { pgTable, timestamp, uuid, varchar, text } from 'drizzle-orm/pg-core';

export const contactMessages = pgTable('contact_messages', {
     id: uuid('id').primaryKey().defaultRandom().notNull(),
     name: varchar('name', { length: 255 }).notNull(),
     email: varchar('email', { length: 255 }).notNull(),
     subject: varchar('subject', { length: 255 }),
     message: text('message').notNull(),
     createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewContactMessage = typeof contactMessages.$inferInsert;
