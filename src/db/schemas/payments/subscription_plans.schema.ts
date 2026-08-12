import {
     pgTable,
     timestamp,
     uuid,
     varchar,
     integer,
     boolean,
     jsonb,
} from 'drizzle-orm/pg-core';

export const subscription_plans = pgTable('subscription_plans', {
     id: uuid('id').primaryKey().notNull(),
     tier: varchar('tier', { length: 50 }).notNull().unique(), // e.g., 'GOLD', 'PLATINUM'
     name: varchar('name', { length: 255 }).notNull(),
     price: integer('price').notNull(), // Price in paise
     memberLimit: integer('member_limit').notNull(),
     durationMonths: integer('duration_months').notNull().default(12),
     features: jsonb('features').$type<string[]>().notNull(),
     isBestValue: boolean('is_best_value').notNull().default(false),
     isActive: boolean('is_active').notNull().default(true),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
