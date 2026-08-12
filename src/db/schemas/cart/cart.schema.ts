import {
     pgTable,
     timestamp,
     uuid,
     varchar,
     unique,
     boolean,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const cart_items = pgTable(
     'cart_items',
     {
          id: uuid('id').primaryKey().notNull(),
          user_id: uuid('user_id')
               .notNull()
               .references(() => users.id, { onDelete: 'cascade' }),
          book_id: uuid('book_id')
               .notNull()
               .references(() => books.id, { onDelete: 'cascade' }),
          status: varchar('status', { length: 20 }).notNull().default('active'), // 'active' | 'saved_for_later'
          abandonedNotified: boolean('abandoned_notified').notNull().default(false),
          abandonedNotified12h: boolean('abandoned_notified_12h').notNull().default(false),
          abandonedNotified1w: boolean('abandoned_notified_1w').notNull().default(false),
          abandonedNotified1m: boolean('abandoned_notified_1m').notNull().default(false),
          createdAt: timestamp('created_at').notNull().defaultNow(),
          updatedAt: timestamp('updated_at').notNull().defaultNow(),
     },
     (t) => [unique().on(t.user_id, t.book_id)]
);
