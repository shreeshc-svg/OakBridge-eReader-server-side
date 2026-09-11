import { boolean, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { roleEnum } from '../../../utils/enum';

export const roles = pgEnum('role', [...roleEnum]);
export const subscriptionTierEnum = pgEnum('subscription_tier', [
     'GOLD',
     'PLATINUM',
     'NONE',
]);

export const institutions = pgTable('institutions', {
     id: uuid('id').primaryKey().notNull(),
     name: varchar('name', { length: 255 }).notNull(),
     location: varchar('location', { length: 255 }).notNull(),
     admin_id: uuid('admin_id').notNull(),
     tier: varchar('tier', { length: 50 }).notNull().default('NONE'),
     subscription_expires_at: timestamp('subscription_expires_at'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
     id: uuid('id').primaryKey().notNull(),
     username: varchar('username', { length: 50 }).notNull().unique(),
     email: varchar('email', { length: 50 }).notNull().unique(),
     password: varchar('password').notNull(),
     role: roles('role').notNull(),
     institution_id: uuid('institution_id').references(() => institutions.id, {
          onDelete: 'set null',
     }),
     right_click_allowed: boolean('right_click_allowed').notNull().default(false),
     is_free_candidate: boolean('is_free_candidate').notNull().default(false),
     // false once the user unsubscribes from marketing emails (new books, reminders)
     marketing_emails: boolean('marketing_emails').notNull().default(true),
     billing_address_line1: varchar('billing_address_line1', { length: 255 }),
     billing_address_line2: varchar('billing_address_line2', { length: 255 }),
     billing_city: varchar('billing_city', { length: 100 }),
     billing_state: varchar('billing_state', { length: 100 }),
     billing_postal_code: varchar('billing_postal_code', { length: 20 }),
     billing_country: varchar('billing_country', { length: 100 }).default('India'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const user_devices = pgTable('user_devices', {
     id: uuid('id').primaryKey().notNull(),
     userId: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     deviceId: varchar('device_id', { length: 255 }).notNull(),
     deviceName: varchar('device_name', { length: 255 }).notNull(),
     lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
     createdAt: timestamp('created_at').notNull().defaultNow(),
});
