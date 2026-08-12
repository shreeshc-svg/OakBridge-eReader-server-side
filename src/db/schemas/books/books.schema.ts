import {
     integer,
     pgTable,
     text,
     timestamp,
     uuid,
     varchar,
     primaryKey,
     boolean,
} from 'drizzle-orm/pg-core';
import { users } from '../auth/user.schema';
import { categories } from '../categories/categories.schema';

export const books = pgTable('books', {
     id: uuid('id').primaryKey().notNull(),
     title: varchar('title').notNull(),
     slug: varchar('slug').notNull(),
     description: varchar('description').notNull(),
     uploader_id: uuid('uploader_id')
          .notNull()
          .references(() => users.id, { onDelete: 'cascade' }),
     author: varchar('author').notNull(),
     language: varchar('language', { length: 20 }).notNull(),
     isbn: varchar('isbn').notNull().unique(),
     cover_image_url: varchar('cover_image_url').notNull(),
     cover_image_alt: varchar('cover_image_alt').default('').notNull(),
     file_url: varchar('file_url').notNull(),
     preview_pages: text('preview_pages').array().default([]).notNull(),
     preview_pages_alt: text('preview_pages_alt').array().default([]).notNull(),
     total_pages: integer('total_pages').notNull(),
     total_chapters: integer('total_chapters').notNull(),
     price: integer('price').notNull().default(0), // Price in cents/paise. 0 means free.
     access_period_days: integer('access_period_days'),
     isTrending: boolean('is_trending').default(false).notNull(),
     isNewRelease: boolean('is_new_release').default(false).notNull(),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const book_categories = pgTable(
     'book_categories',
     {
          book_id: uuid('book_id')
               .notNull()
               .references(() => books.id, { onDelete: 'cascade' }),
          category_id: uuid('category_id')
               .notNull()
               .references(() => categories.id, { onDelete: 'cascade' }),
     },
     (t) => [primaryKey({ columns: [t.book_id, t.category_id] })]
);
