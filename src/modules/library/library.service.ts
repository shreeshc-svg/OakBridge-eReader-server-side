import { db } from '../../db/db';
import { bookshelves, books, free_candidate_allowed_books, reading_progress } from '../../db/schemas';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { get_volumes, type VolumeSummary } from '../../utils/book_sets';

export const library_service = {
     async add_book_to_library(user_id: string, book_id: string) {
          // Check if it already exists
          const existing = await db
               .select()
               .from(bookshelves)
               .where(
                    and(
                         eq(bookshelves.user_id, user_id),
                         eq(bookshelves.book_id, book_id)
                    )
               );

          if (existing.length > 0) {
               // If expired, reset added_at
               const [book] = await db
                    .select({ access_period_days: books.access_period_days })
                    .from(books)
                    .where(eq(books.id, book_id))
                    .limit(1);
               if (book && book.access_period_days && book.access_period_days > 0) {
                    const addedAt = new Date(existing[0].added_at);
                    const expirationDate = new Date(addedAt.getTime() + book.access_period_days * 24 * 60 * 60 * 1000);
                    if (new Date() > expirationDate) {
                         const [updated] = await db
                              .update(bookshelves)
                              .set({ added_at: new Date(), updatedAt: new Date() })
                              .where(eq(bookshelves.id, existing[0].id))
                              .returning();
                         return updated;
                    }
               }
               return existing[0];
          }

          const id = crypto.randomUUID();
          const [added] = await db
               .insert(bookshelves)
               .values({
                    id,
                    user_id,
                    book_id,
                    shelf_name: 'My Library',
                    added_at: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
               })
               .returning();

          return added;
     },

     async get_my_library(user_id: string) {
          const my_books = await db
               .select({
                    id: bookshelves.id,
                    user_id: bookshelves.user_id,
                    book_id: bookshelves.book_id,
                    shelf_name: bookshelves.shelf_name,
                    added_at: bookshelves.added_at,
                    access_period_days: books.access_period_days,
                    is_set: books.is_set,
                    set_parent_id: books.set_parent_id,
               })
               .from(bookshelves)
               .innerJoin(books, eq(bookshelves.book_id, books.id))
               .where(eq(bookshelves.user_id, user_id));

          // A multi-volume set shows up as ONE entry with its volumes inside.
          // Shelf rows that belong to a volume (created when a volume is
          // finished) are folded into their parent rather than listed twice.
          const set_ids = my_books.filter((b) => b.is_set).map((b) => b.book_id);

          const volumes_by_set: Record<string, VolumeSummary[]> = {};
          for (const set_id of set_ids) {
               volumes_by_set[set_id] = await get_volumes(set_id);
          }

          return my_books
               .filter((item) => !item.set_parent_id)
               .map((item) => ({
                    ...item,
                    volumes: volumes_by_set[item.book_id] || [],
                    volume_count: (volumes_by_set[item.book_id] || []).length,
               }));
     },

     async remove_book_from_library(user_id: string, book_id: string) {
          await db
               .delete(bookshelves)
               .where(
                    and(
                         eq(bookshelves.user_id, user_id),
                         eq(bookshelves.book_id, book_id)
                    )
               );

          // Clean up reading progress so removed books do not appear in resume reading
          await db
               .delete(reading_progress)
               .where(
                    and(
                         eq(reading_progress.user_id, user_id),
                         eq(reading_progress.book_id, book_id)
                    )
               );

          return { success: true };
     },
};
