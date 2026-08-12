import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const bookmarks = pgTable('bookmarks', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     cfi: varchar('cfi').notNull(),
     label: varchar('label', { length: 255 }),
     created_at: timestamp('created_at').notNull().defaultNow(),
});
