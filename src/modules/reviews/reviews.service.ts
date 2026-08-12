import { reviews_repository } from './reviews.repository';
import { db } from '../../db/db';
import { bookshelves, users, books } from '../../db/schemas';
import { and, eq } from 'drizzle-orm';
import { notifications_service } from '../notifications/notifications.service';
import { invalidateRevenueCache } from '../superadmin/superadmin.service';

export const reviews_service = {
     async submit_review(data: {
          userId: string;
          bookId: string;
          rating: number;
          reviewText: string;
     }) {
          const { userId, bookId, rating, reviewText } = data;

          if (rating < 1 || rating > 5) {
               throw new Error('Rating must be between 1 and 5');
          }

          if (!reviewText.trim()) {
               throw new Error('Review text cannot be empty');
          }

          // 1. Check if user has already reviewed this book
          const existingReview =
               await reviews_repository.get_user_review_for_book(
                    userId,
                    bookId
               );
          if (existingReview) {
               throw new Error(
                    'You have already submitted a review for this book'
               );
          }

          // 2. Check if user has the book in their library
          const [inLibrary] = await db
               .select()
               .from(bookshelves)
               .where(
                    and(
                         eq(bookshelves.user_id, userId),
                         eq(bookshelves.book_id, bookId)
                    )
               )
               .limit(1);

          if (!inLibrary) {
               throw new Error(
                    'You must have this book in your library to submit a review'
               );
          }

          const newReview = await reviews_repository.create_review({
               user_id: userId,
               book_id: bookId,
               rating,
               review_text: reviewText.trim(),
               status: 'pending',
          });

          // Invalidate superadmin cache
          await invalidateRevenueCache();

          // Trigger superadmin notification asynchronously
          (async () => {
               try {
                    const [user] = await db
                         .select({ username: users.username })
                         .from(users)
                         .where(eq(users.id, userId))
                         .limit(1);

                    const [book] = await db
                         .select({ title: books.title })
                         .from(books)
                         .where(eq(books.id, bookId))
                         .limit(1);

                    const reviewerName = user?.username || 'A user';
                    const bookTitle = book?.title || 'a book';

                    await notifications_service.notify_new_review(reviewerName, bookTitle);
               } catch (err) {
                    console.error('Failed to trigger review notification:', err);
               }
          })();

          return newReview;
     },

     async get_pending_reviews() {
          return await reviews_repository.get_pending_reviews();
     },

     async get_all_reviews_for_admin(status?: 'pending' | 'approved' | 'rejected', timeframe?: string) {
          return await reviews_repository.get_all_reviews_for_admin(status, timeframe);
     },

     async moderate_review(id: string, status: 'approved' | 'rejected') {
          if (status !== 'approved' && status !== 'rejected') {
               throw new Error(
                    'Invalid status. Status must be either approved or rejected.'
               );
          }

          const updated = await reviews_repository.update_review_status(
               id,
               status
          );
          if (!updated) {
               throw new Error('Review not found');
          }

          // Invalidate superadmin cache
          await invalidateRevenueCache();

          return updated;
     },

     async get_book_reviews(bookId: string) {
          const list = await reviews_repository.get_book_reviews(bookId);

          let totalRating = 0;
          list.forEach((r) => {
               totalRating += r.rating;
          });

          const averageRating =
               list.length > 0
                    ? parseFloat((totalRating / list.length).toFixed(1))
                    : 0;

          return {
               reviews: list,
               averageRating,
               totalCount: list.length,
          };
     },
};
