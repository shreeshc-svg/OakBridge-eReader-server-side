import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const bookshelves = pgTable('bookshelves', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     shelf_name: varchar('shelf_name', { length: 100 }).notNull(), // e.g. 'Reading Queue', 'Favorites'
     added_at: timestamp('added_at').notNull().defaultNow(),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
