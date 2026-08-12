import { eq, and, desc, InferInsertModel, gte } from 'drizzle-orm';
import { db } from '../../db/db';
import { reviews, payments, users, books, bookshelves } from '../../db/schemas';

type NewReview = InferInsertModel<typeof reviews>;

export const reviews_repository = {
     async create_review(
          data: Omit<NewReview, 'id' | 'createdAt' | 'updatedAt'>
     ) {
          const result = await db
               .insert(reviews)
               .values({
                    ...data,
               })
               .returning();
          return result[0];
     },

     async get_user_review_for_book(userId: string, bookId: string) {
          const result = await db
               .select()
               .from(reviews)
               .where(
                    and(
                         eq(reviews.user_id, userId),
                         eq(reviews.book_id, bookId)
                    )
               );
          return result[0];
     },

     async get_pending_reviews() {
          const result = await db
               .select({
                    id: reviews.id,
                    rating: reviews.rating,
                    review_text: reviews.review_text,
                    status: reviews.status,
                    createdAt: reviews.createdAt,
                    userEmail: users.email,
                    bookTitle: books.title,
               })
               .from(reviews)
               .innerJoin(users, eq(reviews.user_id, users.id))
               .innerJoin(books, eq(reviews.book_id, books.id))
               .where(eq(reviews.status, 'pending'))
               .orderBy(desc(reviews.createdAt));
          return result;
     },

     async get_all_reviews_for_admin(status?: 'pending' | 'approved' | 'rejected', timeframe?: string) {
          const conditions = [];
          if (status) {
               conditions.push(eq(reviews.status, status));
          }
          if (timeframe && timeframe !== 'all') {
               const now = new Date();
               let cutOffDate: Date | null = null;
               if (timeframe === 'day') {
                    cutOffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
               } else if (timeframe === 'week') {
                    cutOffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
               } else if (timeframe === 'month') {
                    cutOffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
               }
               if (cutOffDate) {
                    conditions.push(gte(reviews.createdAt, cutOffDate));
               }
          }

          const baseQuery = db
               .select({
                    id: reviews.id,
                    rating: reviews.rating,
                    review_text: reviews.review_text,
                    status: reviews.status,
                    createdAt: reviews.createdAt,
                    userEmail: users.email,
                    bookTitle: books.title,
               })
               .from(reviews)
               .innerJoin(users, eq(reviews.user_id, users.id))
               .innerJoin(books, eq(reviews.book_id, books.id));

          const result = await (conditions.length > 0
               ? baseQuery.where(and(...conditions))
               : baseQuery
          ).orderBy(desc(reviews.createdAt));

          return result;
     },

     async get_book_reviews(bookId: string) {
          const result = await db
               .select({
                    id: reviews.id,
                    rating: reviews.rating,
                    review_text: reviews.review_text,
                    createdAt: reviews.createdAt,
                    username: users.username,
               })
               .from(reviews)
               .innerJoin(users, eq(reviews.user_id, users.id))
               .where(
                    and(
                         eq(reviews.book_id, bookId),
                         eq(reviews.status, 'approved')
                    )
               )
               .orderBy(desc(reviews.createdAt));
          return result;
     },

     async update_review_status(id: string, status: 'approved' | 'rejected') {
          const result = await db
               .update(reviews)
               .set({ status, updatedAt: new Date() })
               .where(eq(reviews.id, id))
               .returning();
          return result[0];
     },

     async check_user_purchase(userId: string, bookId: string) {
          const [book] = await db
               .select({ price: books.price })
               .from(books)
               .where(eq(books.id, bookId));
          if (!book) return false;

          if (book.price === 0) {
               const inLibrary = await db
                    .select()
                    .from(bookshelves)
                    .where(
                         and(
                              eq(bookshelves.user_id, userId),
                              eq(bookshelves.book_id, bookId)
                         )
                    );
               return inLibrary.length > 0;
          }

          const result = await db
               .select()
               .from(payments)
               .where(
                    and(
                         eq(payments.user_id, userId),
                         eq(payments.book_id, bookId),
                         eq(payments.status, 'completed')
                    )
               );
          return result.length > 0;
     },
};
