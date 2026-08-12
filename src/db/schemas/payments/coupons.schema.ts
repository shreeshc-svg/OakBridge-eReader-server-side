import { pgTable, uuid, varchar, integer, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';

export const coupons = pgTable('coupons', {
     id: uuid('id').primaryKey().defaultRandom(),
     code: varchar('code', { length: 50 }).notNull().unique(), // e.g., "OAKBRIDGE20"
     discount_type: varchar('discount_type', { length: 20 }).notNull(), // 'percentage' | 'flat'
     discount_value: integer('discount_value').notNull(), // percentage (e.g. 20) or flat amount in paise (e.g. 10000 = 100 INR)
     min_order_amount: integer('min_order_amount'), // in paise (null if no minimum)
     max_discount_amount: integer('max_discount_amount'), // in paise (caps percentage discounts)
     expires_at: timestamp('expires_at'), // validity date
     usage_limit: integer('usage_limit'), // total times coupon can be used
     used_count: integer('used_count').default(0).notNull(),
     is_active: boolean('is_active').default(true).notNull(),
     createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const user_coupons = pgTable('user_coupons', {
     id: uuid('id').primaryKey().defaultRandom(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     coupon_id: uuid('coupon_id')
          .notNull()
          .references(() => coupons.id, { onDelete: 'cascade' }),
     used_at: timestamp('used_at').defaultNow().notNull(),
});
