import { Request, Response } from 'express';
import { db } from '../../db/db';
import { eq, desc, and, or, gte, lt, count, sql, sum } from 'drizzle-orm';
import { reading_progress } from '../../db/schemas/dashboard/reading_progress.schema';
import { reading_sessions } from '../../db/schemas/dashboard/reading_sessions.schema';
import { bookshelves } from '../../db/schemas/dashboard/bookshelves.schema';
import { books } from '../../db/schemas/books/books.schema';
import { users } from '../../db/schemas/auth/user.schema';
import { payments } from '../../db/schemas/payments/payment.schema';
import { payment_items } from '../../db/schemas/payments/payment_items.schema';
import { get_presigned_url } from '../../utils/s3';
import { checkAndNotifyAbandonedCarts } from '../../utils/cart_reminder.job';
import { hasActiveInstitutionSubscription } from '../../utils/subscription.helper';
import { checkBookAllowedBatch, isBookAllowedForUser } from '../books/books.controller';

const userOverviewCache = new Map<string, { data: any; expiresAt: number }>();

export const invalidateUserOverviewCache = (userId?: string) => {
     if (userId) {
          userOverviewCache.delete(userId);
     } else {
          userOverviewCache.clear();
     }
};

export const dashboard_controller = {
     // Get aggregated dashboard data for a user
     get_user_overview: async (req: Request, res: Response) => {
          try {
               const user_id = req.user?.id;
               if (!user_id) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const cached = userOverviewCache.get(user_id);
               const now = Date.now();
               if (cached && cached.expiresAt > now) {
                    return res.status(200).json(cached.data);
               }

               const seven_days_ago = new Date();
               seven_days_ago.setDate(seven_days_ago.getDate() - 7);
               const seven_days_ago_str = seven_days_ago
                    .toISOString()
                    .split('T')[0];

               const thirty_days_ago = new Date();
               thirty_days_ago.setDate(thirty_days_ago.getDate() - 30);
               const thirty_days_ago_str = thirty_days_ago
                    .toISOString()
                    .split('T')[0];

               // Parallel DB Execution
               const [
                    hasSub,
                    recent_progress,
                    sessions,
                    completed_shelf,
                    thirty_day_sessions,
                    all_shelved_books,
               ] = await Promise.all([
                    hasActiveInstitutionSubscription(user_id),
                    db.select({
                         book_id: reading_progress.book_id,
                         title: books.title,
                         author: books.author,
                         cover_image_url: books.cover_image_url,
                         current_chapter: reading_progress.current_chapter,
                         progress_percentage: reading_progress.progress_percentage,
                         time_left: reading_progress.time_left,
                    })
                         .from(reading_progress)
                         .innerJoin(books, eq(reading_progress.book_id, books.id))
                         .innerJoin(
                              bookshelves,
                              and(
                                   eq(bookshelves.book_id, reading_progress.book_id),
                                   eq(bookshelves.user_id, reading_progress.user_id)
                              )
                         )
                         .where(eq(reading_progress.user_id, user_id))
                         .orderBy(desc(reading_progress.last_read_at))
                         .limit(5),
                    db.select()
                         .from(reading_sessions)
                         .where(
                              and(
                                   eq(reading_sessions.user_id, user_id),
                                   gte(reading_sessions.date, seven_days_ago_str)
                              )
                         )
                         .orderBy(desc(reading_sessions.date)),
                    db.select()
                         .from(bookshelves)
                         .where(
                              and(
                                   eq(bookshelves.user_id, user_id),
                                   or(
                                        eq(bookshelves.shelf_name, 'Completed'),
                                        eq(bookshelves.shelf_name, 'Finished')
                                   )
                              )
                         ),
                    db.select({
                         date: reading_sessions.date,
                         minutes: reading_sessions.minutes_read,
                    })
                         .from(reading_sessions)
                         .where(
                              and(
                                   eq(reading_sessions.user_id, user_id),
                                   gte(reading_sessions.date, thirty_days_ago_str)
                              )
                         )
                         .orderBy(reading_sessions.date),
                    db.select({
                         shelf_name: bookshelves.shelf_name,
                         title: books.title,
                         author: books.author,
                         cover_url: books.cover_image_url,
                         id: books.id,
                         added_at: bookshelves.added_at,
                         access_period_days: books.access_period_days,
                    })
                         .from(bookshelves)
                         .innerJoin(books, eq(bookshelves.book_id, books.id))
                         .where(eq(bookshelves.user_id, user_id))
                         .orderBy(desc(bookshelves.added_at)),
               ]);

               const nowReadingBookIds = recent_progress.map((p) => p.book_id);
               const nowReadingAllowedMap = await checkBookAllowedBatch(user_id, nowReadingBookIds);

               const now_reading_raw = await Promise.all(
                    recent_progress.map(async (progress) => {
                         let cover_url = progress.cover_image_url;
                         if (cover_url) {
                              try {
                                   cover_url =
                                        await get_presigned_url(cover_url);
                              } catch (e) {
                                   console.error(
                                        'Failed to get presigned url for cover',
                                        e
                                   );
                              }
                         }
                         let isAllowed = nowReadingAllowedMap.get(progress.book_id) ?? true;
                         if (isAllowed) {
                              const [shelfRow] = await db
                                   .select({ added_at: bookshelves.added_at, access_period_days: books.access_period_days })
                                   .from(bookshelves)
                                   .innerJoin(books, eq(bookshelves.book_id, books.id))
                                   .where(
                                        and(
                                             eq(bookshelves.user_id, user_id),
                                             eq(bookshelves.book_id, progress.book_id)
                                        )
                                   )
                                   .limit(1);

                              if (shelfRow && !hasSub && shelfRow.access_period_days && shelfRow.access_period_days > 0) {
                                   const addedAt = new Date(shelfRow.added_at);
                                   const expirationDate = new Date(addedAt.getTime() + shelfRow.access_period_days * 24 * 60 * 60 * 1000);
                                   if (new Date() > expirationDate) {
                                        isAllowed = false;
                                   }
                              }
                         }

                         return {
                              id: progress.book_id,
                              title: progress.title,
                              author: progress.author || 'Unknown',
                              chapter: progress.current_chapter || 'Chapter 1',
                              progress: progress.progress_percentage || 0,
                              time_left: progress.time_left || 'Unknown',
                              cover_url: cover_url as string,
                              gradient_from: '#818cf8',
                              gradient_to: '#c084fc',
                              isAllowed,
                         };
                    })
               );

               const now_reading = now_reading_raw.filter(item => item.isAllowed && item.progress < 100);

               const minutes_this_week = sessions.reduce(
                    (acc, curr) => acc + curr.minutes_read,
                    0
               );

               const reading_stats = {
                    streak_days: sessions.length, // Simplified streak calculation
                    streak_label: 'Day streak',
                    minutes_this_week: minutes_this_week,
                    minutes_label: 'Min this week',
                    books_completed: completed_shelf.length,
                    books_label: 'Books Completed',
               };

               // 3. Streak data for heatmap (last 30 days)
               const streak_data = [];
               for (let i = 0; i < 30; i++) {
                    const d = new Date();
                    d.setDate(d.getDate() - (29 - i));
                    const d_str = d.toISOString().split('T')[0];
                    const session = thirty_day_sessions.find(
                         (s) => s.date === d_str
                    );
                    streak_data.push({
                         date: d_str,
                         minutes: session ? session.minutes : 0,
                    });
               }

               // 4. Bookshelves
               // Filter out expired books
               const shelvedBookIds = all_shelved_books.map((b) => b.id);
               const shelvedAllowedMap = await checkBookAllowedBatch(user_id, shelvedBookIds);

               const active_shelved_books = [];
               for (const row of all_shelved_books) {
                    if (!hasSub && row.access_period_days && row.access_period_days > 0) {
                         const addedAt = new Date(row.added_at);
                         const expirationDate = new Date(addedAt.getTime() + row.access_period_days * 24 * 60 * 60 * 1000);
                         if (new Date() > expirationDate) {
                              continue;
                         }
                    }
                    if (shelvedAllowedMap.get(row.id)) {
                         active_shelved_books.push(row);
                    }
               }

               // Grouping
               const shelvesMap = new Map();

               // Using pre-fetched userMap

               for (const row of active_shelved_books) {
                    const targetShelves: string[] = [];

                    if (row.shelf_name === 'My Library' || row.shelf_name === 'Purchased') {
                         targetShelves.push('My Book Shelf');
                    } else if (row.shelf_name === 'Finished' || row.shelf_name === 'Completed') {
                         targetShelves.push('Completed', 'My Book Shelf');
                    } else {
                         targetShelves.push(row.shelf_name);
                    }

                    let cover_url = row.cover_url;
                    if (cover_url) {
                         try {
                              cover_url = await get_presigned_url(cover_url);
                         } catch (e) {
                              // ignore
                         }
                    }

                    for (const targetShelfName of targetShelves) {
                         if (!shelvesMap.has(targetShelfName)) {
                              shelvesMap.set(targetShelfName, {
                                   label: targetShelfName,
                                   books: [],
                              });
                         }

                         const shelfBooks = shelvesMap.get(targetShelfName).books;
                         const alreadyExists = shelfBooks.some((b: any) => b.id === row.id);
                         if (!alreadyExists) {
                              shelfBooks.push({
                                   id: row.id,
                                   title: row.title,
                                   author: row.author || 'Unknown',
                                   cover_url: cover_url,
                                   color: '#1e293b', // Placeholder spine color
                              });
                         }
                    }
               }

               const shelvesOrder = ['My Book Shelf', 'Completed'];
               const shelves = Array.from(shelvesMap.values()).sort((a, b) => {
                    const indexA = shelvesOrder.indexOf(a.label);
                    const indexB = shelvesOrder.indexOf(b.label);
                    if (indexA !== -1 && indexB !== -1) {
                         return indexA - indexB;
                    }
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return 0;
               });

               // If no shelves exist, we can fallback to getting a random list of books as 'Recommended'
               if (shelves.length === 0) {
                    const random_books_raw = await db
                         .select()
                         .from(books)
                         .orderBy(desc(books.createdAt))
                         .limit(20);

                    const randomBookIds = random_books_raw.map((b) => b.id);
                    const randomAllowedMap = await checkBookAllowedBatch(user_id, randomBookIds);

                    const random_books_filtered = random_books_raw.filter((b) => randomAllowedMap.get(b.id));
                    const random_books = random_books_filtered.slice(0, 5);

                    if (random_books.length > 0) {
                         const mapped_random_books = await Promise.all(
                              random_books.map(async (b: any) => {
                                   let cover_url = b.cover_image_url;
                                   if (cover_url) {
                                        try {
                                             cover_url =
                                                  await get_presigned_url(
                                                       cover_url
                                                  );
                                        } catch (e) { }
                                   }
                                   return {
                                        id: b.id,
                                        title: b.title,
                                        author: b.author || 'Unknown',
                                        cover_url: cover_url,
                                        color: '#334155',
                                   };
                              })
                         );

                         shelves.push({
                              label: 'Discover',
                              books: mapped_random_books,
                         });
                    }
               }

               const responseBody = {
                    message: 'User overview fetched successfully',
                    data: {
                         now_reading,
                         reading_stats,
                         streak_data,
                         shelves,
                    },
               };

               userOverviewCache.set(user_id, {
                    data: responseBody,
                    expiresAt: Date.now() + 15000,
               });

               res.status(200).json(responseBody);
          } catch (error) {
               console.error('[Dashboard Overview Error]', error);
               res.status(500).json({ message: 'Internal server error' });
          }
     },

     // Get aggregated dashboard data for a superadmin
     get_superadmin_overview: async (req: Request, res: Response) => {
          try {
               const user_id = req.user?.id;
               if (!user_id) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               // 1. Fetch all books by this author
               const author_books = await db
                    .select()
                    .from(books)
                    .where(eq(books.uploader_id, user_id))
                    .orderBy(desc(books.createdAt));

               const total_books = author_books.length;
               const total_pages = author_books.reduce(
                    (sum, b) => sum + b.total_pages,
                    0
               );
               const total_chapters = author_books.reduce(
                    (sum, b) => sum + b.total_chapters,
                    0
               );

               const book_ids = author_books.map((b) => b.id);

               // 2. Count unique readers across all author's books
               let total_readers = 0;
               let avg_completion = 0;
               if (book_ids.length > 0) {
                    const reader_rows = await db
                         .select({
                              user_id: reading_progress.user_id,
                              progress: reading_progress.progress_percentage,
                         })
                         .from(reading_progress)
                         .where(
                              sql`${reading_progress.book_id} IN (${sql.join(
                                   book_ids.map((id) => sql`${id}`),
                                   sql`, `
                              )})`
                         );

                    // Unique readers
                    const unique_readers = new Set(
                         reader_rows.map((r) => r.user_id)
                    );
                    total_readers = unique_readers.size;

                    // Average completion rate
                    if (reader_rows.length > 0) {
                         const sum = reader_rows.reduce(
                              (acc, r) => acc + (r.progress || 0),
                              0
                         );
                         avg_completion = Math.round(sum / reader_rows.length);
                    }
               }

               // 3. Total reading minutes spent on author's books
               // reading_sessions doesn't track book_id directly, but
               // we can approximate with reading_progress last_read_at
               // For now, report total_readers * avg estimated minutes
               // (since sessions table is user-level, not book-level)

               // 4. Latest book info
               const latest_book =
                    author_books.length > 0 ? author_books[0] : null;

               let latest_book_data = null;
               if (latest_book) {
                    let cover_url = latest_book.cover_image_url;
                    if (cover_url) {
                         try {
                              cover_url = await get_presigned_url(cover_url);
                         } catch (e) {
                              // ignore
                         }
                    }
                    latest_book_data = {
                         id: latest_book.id,
                         title: latest_book.title,
                         description: latest_book.description,
                         author: latest_book.author,
                         publisher: latest_book.author,
                         language: latest_book.language,
                         isbn: latest_book.isbn,
                         total_pages: latest_book.total_pages,
                         total_chapters: latest_book.total_chapters,
                         cover_url,
                         created_at: latest_book.createdAt,
                    };
               }

               // 5. Active manuscripts — all books with details
               const manuscripts = await Promise.all(
                    author_books.map(async (book) => {
                         let cover_url = book.cover_image_url;
                         if (cover_url) {
                              try {
                                   cover_url =
                                        await get_presigned_url(cover_url);
                              } catch (e) {
                                   // ignore
                              }
                         }
                         return {
                              id: book.id,
                              title: book.title,
                              description: book.description,
                              author: book.author,
                              publisher: book.author,
                              language: book.language,
                              isbn: book.isbn,
                              total_pages: book.total_pages,
                              total_chapters: book.total_chapters,
                              cover_url,
                              created_at: book.createdAt,
                         };
                    })
               );

               // 6. Books shelved by readers (how many times books are on shelves)
               let total_shelved = 0;
               if (book_ids.length > 0) {
                    const shelved_rows = await db
                         .select({ cnt: count() })
                         .from(bookshelves)
                         .where(
                              sql`${bookshelves.book_id} IN (${sql.join(
                                   book_ids.map((id) => sql`${id}`),
                                   sql`, `
                              )})`
                         );
                    total_shelved = shelved_rows[0]?.cnt ?? 0;
               }

               // 7. Calculate total revenue from completed book purchases (direct & cart)
               let total_revenue = 0;
               let weeklyGrowthPercent = 0;
               let monthlyGrowthPercent = 0;

               if (book_ids.length > 0) {
                    const getUploaderRevenueForRange = async (startDate?: Date, endDate?: Date): Promise<number> => {
                         // Direct payments
                         const directConditions = [
                              eq(payments.status, 'completed'),
                              sql`${payments.book_id} IN (${sql.join(
                                   book_ids.map((id) => sql`${id}`),
                                   sql`, `
                              )})`
                         ];
                         if (startDate) {
                              directConditions.push(gte(payments.createdAt, startDate));
                         }
                         if (endDate) {
                              directConditions.push(lt(payments.createdAt, endDate));
                         }

                         const direct_rows = await db
                              .select({ total: sum(payments.amount) })
                              .from(payments)
                              .where(and(...directConditions));

                         const directTotal = Number(direct_rows[0]?.total || 0) / 100;

                         // Cart payments
                         const cartConditions = [
                              eq(payments.status, 'completed'),
                              eq(payment_items.payment_id, payments.id),
                              sql`${payment_items.book_id} IN (${sql.join(
                                   book_ids.map((id) => sql`${id}`),
                                   sql`, `
                              )})`
                         ];
                         if (startDate) {
                              cartConditions.push(gte(payments.createdAt, startDate));
                         }
                         if (endDate) {
                              cartConditions.push(lt(payments.createdAt, endDate));
                         }

                         const cart_rows = await db
                              .select({ total: sum(payment_items.price) })
                              .from(payments)
                              .innerJoin(payment_items, eq(payment_items.payment_id, payments.id))
                              .where(and(...cartConditions));

                         const cartTotal = Number(cart_rows[0]?.total || 0) / 100;

                         return directTotal + cartTotal;
                    };

                    total_revenue = await getUploaderRevenueForRange();

                    // Calculate growth percentages
                    const now = new Date();
                    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

                    const currentWeekRev = await getUploaderRevenueForRange(sevenDaysAgo, now);
                    const previousWeekRev = await getUploaderRevenueForRange(fourteenDaysAgo, sevenDaysAgo);
                    const currentMonthRev = await getUploaderRevenueForRange(thirtyDaysAgo, now);
                    const previousMonthRev = await getUploaderRevenueForRange(sixtyDaysAgo, thirtyDaysAgo);

                    const calcGrowth = (current: number, previous: number) => {
                         if (previous === 0) {
                              return current > 0 ? 100 : 0;
                         }
                         return parseFloat((((current - previous) / previous) * 100).toFixed(2));
                    };

                    weeklyGrowthPercent = calcGrowth(currentWeekRev, previousWeekRev);
                    monthlyGrowthPercent = calcGrowth(currentMonthRev, previousMonthRev);
               }

               res.status(200).json({
                    message: 'Author overview fetched successfully',
                    data: {
                         stats: {
                              total_books,
                              total_pages,
                              total_chapters,
                              total_readers,
                              avg_completion,
                              total_shelved,
                              total_revenue,
                              weeklyGrowthPercent,
                              monthlyGrowthPercent,
                         },
                         latest_book: latest_book_data,
                         manuscripts,
                    },
               });
          } catch (error) {
               console.error('[Author Dashboard Overview Error]', error);
               res.status(500).json({ message: 'Internal server error' });
          }
     },

     // Get list of readers who have reading progress on the superadmin's books
     get_readers_list: async (req: Request, res: Response) => {
          try {
               const user_id = req.user?.id;
               if (!user_id) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               // Get all books uploaded by this superadmin
               const author_books = await db
                    .select({ id: books.id })
                    .from(books)
                    .where(eq(books.uploader_id, user_id));

               const book_ids = author_books.map((b) => b.id);

               if (book_ids.length === 0) {
                    return res.status(200).json({
                         message: 'No readers found',
                         data: { readers: [] },
                    });
               }

               // Get unique reader user_ids from reading_progress
               const reader_rows = await db
                    .select({
                         user_id: reading_progress.user_id,
                    })
                    .from(reading_progress)
                    .where(
                         sql`${reading_progress.book_id} IN (${sql.join(
                              book_ids.map((id) => sql`${id}`),
                              sql`, `
                         )})`
                    );

               const unique_reader_ids = [
                    ...new Set(reader_rows.map((r) => r.user_id)),
               ];

               if (unique_reader_ids.length === 0) {
                    return res.status(200).json({
                         message: 'No readers found',
                         data: { readers: [] },
                    });
               }

               // Fetch user details for each reader
               const reader_users = await db
                    .select({
                         id: users.id,
                         username: users.username,
                         email: users.email,
                         joined: users.createdAt,
                         right_click_allowed: users.right_click_allowed,
                    })
                    .from(users)
                    .where(
                         sql`${users.id} IN (${sql.join(
                              unique_reader_ids.map((id) => sql`${id}`),
                              sql`, `
                         )})`
                    );

               res.status(200).json({
                    message: 'Readers list fetched successfully',
                    data: {
                         readers: reader_users.map((u) => ({
                              id: u.id,
                              username: u.username,
                              email: u.email,
                              joined: u.joined,
                              right_click_allowed: u.right_click_allowed,
                         })),
                    },
               });
          } catch (error) {
               console.error('[Readers List Error]', error);
               res.status(500).json({ message: 'Internal server error' });
          }
     },

     // Toggle right-click permission for a specific user
     toggle_right_click: async (req: Request, res: Response) => {
          try {
               const { userId, allowed } = req.body;

               if (!userId || typeof allowed !== 'boolean') {
                    return res.status(400).json({
                         message: 'userId and allowed (boolean) are required',
                    });
               }

               await db
                    .update(users)
                    .set({ right_click_allowed: allowed })
                    .where(eq(users.id, userId));

               res.status(200).json({
                    message: `Right-click ${allowed ? 'enabled' : 'disabled'} for user`,
               });
          } catch (error) {
               console.error('[Toggle Right Click Error]', error);
               res.status(500).json({ message: 'Internal server error' });
          }
     },

     trigger_cart_reminder_test: async (req: Request, res: Response) => {
          try {
               const bypassTimeCheck = req.query.bypassTimeCheck === 'true';
               const result = await checkAndNotifyAbandonedCarts(bypassTimeCheck);
               res.status(200).json({
                    message: 'Cart reminder job run triggered successfully',
                    result,
               });
          } catch (error: any) {
               console.error('[Trigger Cart Reminder Test Error]', error);
               res.status(500).json({ message: 'Internal server error', error: error.message });
          }
     },
};
