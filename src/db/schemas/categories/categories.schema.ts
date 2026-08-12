import { AnyPgColumn, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const categories = pgTable('categories', {
     id: uuid('id').primaryKey().notNull(),
     category_name: varchar('category_name').notNull(),
     slug: varchar('slug').notNull(),
     parent_id: uuid('parent_id')
          .references((): AnyPgColumn => categories.id, { onDelete: 'cascade' }),
     createdAt: timestamp('created_at').notNull().defaultNow(),
     updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
