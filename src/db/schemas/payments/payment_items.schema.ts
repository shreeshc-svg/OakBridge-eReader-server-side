import {
     pgTable,
     uuid,
     integer,
} from 'drizzle-orm/pg-core';
import { payments } from './payment.schema';
import { books } from '../books/books.schema';

export const payment_items = pgTable('payment_items', {
     id: uuid('id').primaryKey().notNull(),
     payment_id: uuid('payment_id')
          .notNull()
          .references(() => payments.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     price: integer('price').notNull(), // Snapshot of book price at time of purchase (in paise)
});
