import { db } from '../../db/db';
import { cart_items, books } from '../../db/schemas';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { get_presigned_url } from '../../utils/s3';

export const cart_service = {
     async get_cart(userId: string) {
          const items = await db
               .select({
                    id: cart_items.id,
                    book_id: cart_items.book_id,
                    status: cart_items.status,
                    createdAt: cart_items.createdAt,
                    book_title: books.title,
                    book_author: books.author,
                    book_cover: books.cover_image_url,
                    book_price: books.price,
                    book_slug: books.slug,
               })
               .from(cart_items)
               .innerJoin(books, eq(cart_items.book_id, books.id))
               .where(eq(cart_items.user_id, userId))
               .orderBy(cart_items.createdAt);

          const processedItems = await Promise.all(
               items.map(async (item) => {
                    let book_cover = item.book_cover;
                    if (book_cover) {
                         try {
                              book_cover = await get_presigned_url(book_cover);
                         } catch (e) {
                              console.error(`Failed to generate presigned URL for cart item cover (${item.id}):`, e);
                         }
                    }
                    return {
                         ...item,
                         book_cover,
                    };
               })
          );

          const active = processedItems.filter((i) => i.status === 'active');
          const saved = processedItems.filter((i) => i.status === 'saved_for_later');

          return { active, saved };
     },

     async add_to_cart(userId: string, bookId: string) {
          // A volume of a multi-volume set is never sold on its own - only the
          // set itself can be bought.
          const [book] = await db
               .select({ set_parent_id: books.set_parent_id })
               .from(books)
               .where(eq(books.id, bookId))
               .limit(1);

          if (!book) {
               throw new Error('Book not found');
          }
          if (book.set_parent_id) {
               throw new Error(
                    'This volume is part of a set and can only be bought as the complete set'
               );
          }

          // Check if item already exists in cart
          const existing = await db
               .select()
               .from(cart_items)
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.book_id, bookId)
                    )
               )
               .limit(1);

          if (existing.length > 0) {
               // If it was saved_for_later, move it back to active
               if (existing[0].status === 'saved_for_later') {
                    await db
                         .update(cart_items)
                         .set({ status: 'active', updatedAt: new Date() })
                         .where(eq(cart_items.id, existing[0].id));
               }
               return existing[0];
          }

          const id = crypto.randomUUID();
          const [added] = await db
               .insert(cart_items)
               .values({
                    id,
                    user_id: userId,
                    book_id: bookId,
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
               })
               .returning();

          return added;
     },

     async remove_from_cart(userId: string, bookId: string) {
          await db
               .delete(cart_items)
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.book_id, bookId)
                    )
               );
          return { success: true };
     },

     async clear_cart(userId: string) {
          await db
               .delete(cart_items)
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.status, 'active')
                    )
               );
          return { success: true };
     },

     async move_to_saved(userId: string, bookId: string) {
          const existing = await db
               .select()
               .from(cart_items)
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.book_id, bookId)
                    )
               )
               .limit(1);

          if (existing.length > 0) {
               await db
                    .update(cart_items)
                    .set({ status: 'saved_for_later', updatedAt: new Date() })
                    .where(eq(cart_items.id, existing[0].id));
          } else {
               const id = crypto.randomUUID();
               await db
                    .insert(cart_items)
                    .values({
                         id,
                         user_id: userId,
                         book_id: bookId,
                         status: 'saved_for_later',
                         createdAt: new Date(),
                         updatedAt: new Date(),
                    });
          }
          return { success: true };
     },

     async move_to_cart(userId: string, bookId: string) {
          await db
               .update(cart_items)
               .set({ status: 'active', updatedAt: new Date() })
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.book_id, bookId)
                    )
               );
          return { success: true };
     },

     async get_cart_count(userId: string) {
          const items = await db
               .select()
               .from(cart_items)
               .where(
                    and(
                         eq(cart_items.user_id, userId),
                         eq(cart_items.status, 'active')
                    )
               );
          return items.length;
     },
};
