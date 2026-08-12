import {
     integer,
     pgTable,
     timestamp,
     uuid,
     varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { books } from '../books/books.schema';

export const reading_progress = pgTable('reading_progress', {
     id: uuid('id').primaryKey().notNull(),
     user_id: uuid('user_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     book_id: uuid('book_id')
          .notNull()
          .references(() => books.id, { onDelete: 'cascade' }),
     current_chapter: varchar('current_chapter', { length: 255 }),
     current_cfi: varchar('current_cfi', { length: 255 }),
     progress_percentage: integer('progress_percentage').notNull().default(0),
     time_left: varchar('time_left', { length: 255 }),
     last_read_at: timestamp('last_read_at').notNull().defaultNow(),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
