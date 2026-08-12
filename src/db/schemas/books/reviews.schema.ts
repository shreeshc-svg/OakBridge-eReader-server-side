import {
     pgEnum,
     pgTable,
     timestamp,
     uuid,
     text,
     integer,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from './books.schema';

export const reviewStatusEnum = ['pending', 'approved', 'rejected'] as const;
export const review_status = pgEnum('review_status', reviewStatusEnum);

export const reviews = pgTable('reviews', {
     id: uuid('id').primaryKey().defaultRandom(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     rating: integer('rating').notNull(),
     review_text: text('review_text').notNull(),
     status: review_status('status').notNull().default('pending'),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
