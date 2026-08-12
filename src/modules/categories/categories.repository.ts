import { eq, InferInsertModel, sql } from 'drizzle-orm';
import { db } from '../../db/db';
import { categories, book_categories } from '../../db/schemas';

type NewCategory = InferInsertModel<typeof categories>;

export const categories_repository = {
     async create_category(data: NewCategory) {
          const result = await db.insert(categories).values(data).returning();
          return result[0];
     },

     async get_category_by_name(category_name: string) {
          const result = await db
               .select()
               .from(categories)
               .where(eq(categories.category_name, category_name));

          return result[0];
     },

     async get_category_by_id(id: string) {
          const result = await db
               .select()
               .from(categories)
               .where(eq(categories.id, id));

          return result[0];
     },

     async get_all_categories() {
          const result = await db
               .select({
                    id: categories.id,
                    category_name: categories.category_name,
                    slug: categories.slug,
                    parent_id: categories.parent_id,
                    createdAt: categories.createdAt,
                    updatedAt: categories.updatedAt,
                    book_count: sql<number>`count(${book_categories.book_id})::int`,
               })
               .from(categories)
               .leftJoin(book_categories, eq(categories.id, book_categories.category_id))
               .groupBy(categories.id);
          return result;
     },

     async update_category(id: string, category_name: string, slug: string, parent_id: string | null) {
          const result = await db
               .update(categories)
               .set({ category_name, slug, parent_id })
               .where(eq(categories.id, id))
               .returning();

          return result[0];
     },

     async delete_category(id: string) {
          const result = await db
               .delete(categories)
               .where(eq(categories.id, id))
               .returning();

          return result[0];
     },
};
