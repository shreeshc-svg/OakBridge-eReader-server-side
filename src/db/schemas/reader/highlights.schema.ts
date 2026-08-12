import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const highlights = pgTable('highlights', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     cfi_range: varchar('cfi_range').notNull(),
     text: text('text').notNull(),
     color: varchar('color', { length: 50 }).notNull(),
     note: text('note'),
     created_at: timestamp('created_at').notNull().defaultNow(),
});
