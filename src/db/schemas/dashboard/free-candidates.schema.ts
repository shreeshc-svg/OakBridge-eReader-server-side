import { pgTable, uuid, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const free_candidate_allowed_books = pgTable(
     'free_candidate_allowed_books',
     {
          user_id: uuid('user_id')
               .notNull()
               .references(() => users.id, { onDelete: 'cascade' }),
          book_id: uuid('book_id')
               .notNull()
               .references(() => books.id, { onDelete: 'cascade' }),
          createdAt: timestamp('created_at').notNull().defaultNow(),
     },
     (t) => [primaryKey({ columns: [t.user_id, t.book_id] })]
);
