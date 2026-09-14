import { eq, ilike, and, or, inArray, isNull, InferInsertModel } from 'drizzle-orm';
import { books, book_categories, categories, users } from '../../db/schemas';
import { db } from '../../db/db';

type NewBook = InferInsertModel<typeof books>;

export const books_repository = {
     async create_book(data: NewBook) {
          const result = await db.insert(books).values(data).returning();
          return result[0];
     },

     async find_book_by_id(id: string) {
          const result = await db
               .select()
               .from(books)
               .where(eq(books.id, id))
               .limit(1);
          return result[0] || null;
     },

     async find_book_by_isbn(isbn: string) {
          // Volumes deliberately share their set's ISBN, so they are excluded
          // from the uniqueness check (the DB index is partial in the same way).
          const result = await db
               .select()
               .from(books)
               .where(and(eq(books.isbn, isbn), isNull(books.set_parent_id)))
               .limit(1);
          return result[0] || null;
     },

     async get_all_books(filters?: {
          authorId?: string;
          search?: string;
          category?: string;
          authorName?: string;
          allowedCategoryIds?: string[];
          allowedCategoryRestrictions?: { categoryId: string; allowAllBooks: boolean }[];
          allowedBookIds?: string[];
     }) {
          // Volumes of a multi-volume set are never listed on their own: only
          // the set itself appears in the store, search and admin book lists.
          const conditions = [isNull(books.set_parent_id)];
          if (filters?.authorId)
               conditions.push(eq(books.uploader_id, filters.authorId));

          let searchCondition;
          if (filters?.search) {
               searchCondition = or(
                    ilike(books.title, `%${filters.search}%`),
                    ilike(books.author, `%${filters.search}%`),
                    ilike(users.username, `%${filters.search}%`),
                    ilike(categories.category_name, `%${filters.search}%`)
               );
          }
          if (filters?.category)
               conditions.push(
                    ilike(categories.category_name, `%${filters.category}%`)
               );
          if (filters?.authorName)
               conditions.push(ilike(books.author, `%${filters.authorName}%`));

          if (filters?.allowedCategoryIds && filters.allowedCategoryIds.length > 0) {
               conditions.push(inArray(book_categories.category_id, filters.allowedCategoryIds));
          }

          if (filters?.allowedCategoryRestrictions && filters.allowedCategoryRestrictions.length > 0) {
               const allowAllCategoryIds = filters.allowedCategoryRestrictions
                    .filter((r) => r.allowAllBooks)
                    .map((r) => r.categoryId);

               const customCategoryIds = filters.allowedCategoryRestrictions
                    .filter((r) => !r.allowAllBooks)
                    .map((r) => r.categoryId);

               const bookConditions = [];

               if (allowAllCategoryIds.length > 0) {
                    bookConditions.push(inArray(book_categories.category_id, allowAllCategoryIds));
               }

               if (customCategoryIds.length > 0) {
                    const allowedBookIds = filters.allowedBookIds || [];
                    if (allowedBookIds.length > 0) {
                         bookConditions.push(
                              and(
                                   inArray(book_categories.category_id, customCategoryIds),
                                   inArray(books.id, allowedBookIds)
                              )
                         );
                    }
               }

               if (bookConditions.length > 0) {
                    conditions.push(or(...bookConditions));
               } else {
                    conditions.push(eq(books.id, '00000000-0000-0000-0000-000000000000'));
               }
          } else if (filters?.allowedBookIds) {
               if (filters.allowedBookIds.length > 0) {
                    conditions.push(inArray(books.id, filters.allowedBookIds));
               } else {
                    conditions.push(eq(books.id, '00000000-0000-0000-0000-000000000000'));
               }
          }

          let query = db
               .select({
                    id: books.id,
                    title: books.title,
                    slug: books.slug,
                    description: books.description,
                    uploader_id: books.uploader_id,
                    author: books.author,
                    publisher: books.author,
                    language: books.language,
                    isbn: books.isbn,
                    cover_image_url: books.cover_image_url,
                    file_url: books.file_url,
                    preview_pages: books.preview_pages,
                    total_pages: books.total_pages,
                    total_chapters: books.total_chapters,
                    price: books.price,
                    access_period_days: books.access_period_days,
                    isTrending: books.isTrending,
                    isNewRelease: books.isNewRelease,
                    is_set: books.is_set,
                    createdAt: books.createdAt,
                    updatedAt: books.updatedAt,
               })
               .from(books)
               .$dynamic();

          // We need to join users and categories if searching or if explicitly requested
          const needsCategoryJoin = !!filters?.category || !!filters?.search || !!filters?.allowedCategoryIds || !!filters?.allowedCategoryRestrictions;
          const needsAuthorJoin = !!filters?.search; // only search needs uploader's username check now

          if (needsCategoryJoin) {
               query = query
                    .leftJoin(
                         book_categories,
                         eq(books.id, book_categories.book_id)
                    )
                    .leftJoin(
                         categories,
                         eq(book_categories.category_id, categories.id)
                    );
          }
          if (needsAuthorJoin) {
               query = query.leftJoin(users, eq(books.uploader_id, users.id));
          }

          if (conditions.length > 0 || searchCondition) {
               const andConditions = [];
               if (conditions.length > 0) {
                    andConditions.push(and(...conditions));
               }
               if (searchCondition) {
                    andConditions.push(searchCondition);
               }
               query = query.where(and(...andConditions));
          }

          const results = await query;

          // Deduplicate results by book ID
          const seen = new Set();
          return results.filter((book) => {
               if (seen.has(book.id)) {
                    return false;
               }
               seen.add(book.id);
               return true;
          });
     },

     async update_book(id: string, data: Partial<NewBook>) {
          const result = await db
               .update(books)
               .set(data)
               .where(eq(books.id, id))
               .returning();
          return result[0];
     },

     async delete_book(id: string) {
          const result = await db
               .delete(books)
               .where(eq(books.id, id))
               .returning();
          return result[0];
     },
};
