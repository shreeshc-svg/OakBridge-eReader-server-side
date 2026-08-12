import { pgTable, uuid, primaryKey, boolean } from 'drizzle-orm/pg-core';
import { institutions } from '../auth/user.schema';
import { categories } from '../categories/categories.schema';
import { books } from '../books/books.schema';

export { institutions, subscriptionTierEnum } from '../auth/user.schema';

export const institution_allowed_categories = pgTable(
     'institution_allowed_categories',
     {
          institution_id: uuid('institution_id')
               .notNull()
               .references(() => institutions.id, { onDelete: 'cascade' }),
          category_id: uuid('category_id')
               .notNull()
               .references(() => categories.id, { onDelete: 'cascade' }),
          allow_all_books: boolean('allow_all_books').default(true).notNull(),
     },
     (t) => [primaryKey({ columns: [t.institution_id, t.category_id] })]
);

export const institution_allowed_books = pgTable(
     'institution_allowed_books',
     {
          institution_id: uuid('institution_id')
               .notNull()
               .references(() => institutions.id, { onDelete: 'cascade' }),
          book_id: uuid('book_id')
               .notNull()
               .references(() => books.id, { onDelete: 'cascade' }),
     },
     (t) => [primaryKey({ columns: [t.institution_id, t.book_id] })]
);

