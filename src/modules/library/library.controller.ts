import { Request, Response } from 'express';
import { library_service } from './library.service';
import { db } from '../../db/db';
import { payments, users, free_candidate_allowed_books } from '../../db/schemas';
import { and, eq } from 'drizzle-orm';
import { books_service } from '../books/books.service';
import { hasActiveInstitutionSubscription } from '../../utils/subscription.helper';
import { entitlement_book_id } from '../../utils/book_sets';

export const library_controller = {
     add_book: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const { book_id: requested_book_id } = req.body;

               if (!requested_book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               // A volume is never added on its own: it resolves to its parent
               // set, and the entitlement checks below run against that set -
               // otherwise a volume's price of 0 would hand over the whole set.
               const book_id = await entitlement_book_id(requested_book_id);

               // Verify authorization for paid books
               const book = await books_service.get_book_by_id(book_id);
               if (book && book.price && book.price > 0) {
                    const [user] = await db
                         .select({ is_free_candidate: users.is_free_candidate })
                         .from(users)
                         .where(eq(users.id, user_id))
                         .limit(1);

                    if (user?.is_free_candidate) {
                         const [allowed] = await db
                              .select()
                              .from(free_candidate_allowed_books)
                              .where(
                                   and(
                                        eq(free_candidate_allowed_books.user_id, user_id),
                                        eq(free_candidate_allowed_books.book_id, book_id)
                                   )
                              )
                              .limit(1);
                         if (!allowed) {
                              return res.status(403).json({
                                   message: 'Forbidden: You do not have access to this book.',
                              });
                         }
                    } else {
                         const hasSub =
                              await hasActiveInstitutionSubscription(user_id);
                         if (!hasSub) {
                              const [payment] = await db
                                   .select()
                                   .from(payments)
                                   .where(
                                        and(
                                             eq(payments.user_id, user_id),
                                             eq(payments.book_id, book_id),
                                             eq(payments.status, 'completed')
                                        )
                                   )
                                   .limit(1);

                              if (!payment) {
                                   return res.status(403).json({
                                        message: 'Forbidden: You must purchase this book before adding it to your library.',
                                   });
                              }
                         }
                    }
               }

               const result = await library_service.add_book_to_library(
                    user_id,
                    book_id
               );
               res.status(200).json({ success: true, data: result });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     get_my_library: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const hasSub = await hasActiveInstitutionSubscription(user_id);
               const books = await library_service.get_my_library(user_id);
               
               const activeBooks = books.filter((item: any) => {
                    if (!hasSub && item.access_period_days && item.access_period_days > 0) {
                         const addedAt = new Date(item.added_at);
                         const expirationDate = new Date(addedAt.getTime() + item.access_period_days * 24 * 60 * 60 * 1000);
                         if (new Date() > expirationDate) {
                              return false;
                         }
                    }
                    return true;
               });

               res.status(200).json({ success: true, data: activeBooks });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     remove_book: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const book_id = req.params.book_id as string;

               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               await library_service.remove_book_from_library(user_id, book_id);
               res.status(200).json({ success: true });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },
};
