import {
     pgEnum,
     pgTable,
     timestamp,
     uuid,
     varchar,
     integer,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';
import { coupons } from './coupons.schema';

export const paymentStatusEnum = ['created', 'completed', 'failed'] as const;
export const payment_status = pgEnum('payment_status', paymentStatusEnum);

export const payments = pgTable('payments', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id').references(() => books.id, {
          onDelete: 'cascade',
     }),
     tier: varchar('tier'),
     razorpay_order_id: varchar('razorpay_order_id').notNull(),
     razorpay_payment_id: varchar('razorpay_payment_id'),
     razorpay_signature: varchar('razorpay_signature'),
     shippingAddress: varchar('shipping_address', { length: 500 }),
     billingAddress: varchar('billing_address', { length: 500 }),
     original_amount: integer('original_amount'), // Price before coupon in paise
     discount_amount: integer('discount_amount').default(0).notNull(), // Discount in paise
     coupon_id: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
     amount: integer('amount').notNull(), // Amount paid in cents/paise
     status: payment_status('status').notNull().default('created'),
     invoice_key: varchar('invoice_key'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
