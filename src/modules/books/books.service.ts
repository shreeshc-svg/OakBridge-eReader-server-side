import { books_repository } from './books.repository';
import {
     upload_to_s3,
     get_presigned_url,
     delete_from_s3,
} from '../../utils/s3';
import { deriveBookDrmKey, encryptBookBuffer } from '../../utils/drm';
import {
     book_categories,
     books,
     bookshelves,
     payments,
     users,
     categories,
} from '../../db/schemas';
import { db } from '../../db/db';
import { eq, inArray, and, notInArray, sql, desc } from 'drizzle-orm';
import { sendBookAdvertisementMail, sendFreeBookAdvertisementMail } from '../../utils/mail.service';

const slugify = (text: string): string => {
     return text
          .toString()
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric characters with hyphens
          .replace(/(^-|-$)+/g, ''); // Remove leading/trailing hyphens
};

const map_book_with_presigned_urls = async (book: any) => {
     if (!book) return null;

     let cover_image_presigned = book.cover_image_url;
     let file_presigned = book.file_url;

     if (book.cover_image_url) {
          try {
               cover_image_presigned = await get_presigned_url(
                    book.cover_image_url
               );
          } catch (err) {
               console.error(
                    `Failed to generate presigned URL for cover image of book ${book.id}:`,
                    err
               );
          }
     }

     if (book.file_url) {
          try {
               file_presigned = await get_presigned_url(book.file_url);
          } catch (err) {
               console.error(
                    `Failed to generate presigned URL for book file of book ${book.id}:`,
                    err
               );
          }
     }

     let preview_pages_presigned: string[] = [];
     if (book.preview_pages && Array.isArray(book.preview_pages)) {
          preview_pages_presigned = await Promise.all(
               book.preview_pages.map(async (pageUrl: string) => {
                    try {
                         return await get_presigned_url(pageUrl);
                    } catch (err) {
                         console.error(
                              `Failed to generate presigned URL for preview page: ${pageUrl}`,
                              err
                         );
                         return pageUrl;
                    }
               })
          );
     }

     return {
          ...book,
          cover_image_url: cover_image_presigned,
          file_url: file_presigned,
          preview_pages: preview_pages_presigned,
     };
};

export const books_service = {
     async create_book(
          data: {
               title: string;
               description: string;
               author: string;
               language: string;
               isbn: string;
               total_pages: number;
               total_chapters: number;
               uploader_id: string;
               price?: number;
               category_ids?: string[];
               category_names?: string[];
               access_period_days?: number | null;
               isTrending?: boolean;
               isNewRelease?: boolean;
               cover_image_alt?: string;
               preview_pages_alt?: string | string[];
          },
          files: {
               cover_image?: Express.Multer.File;
               book_file?: Express.Multer.File;
               preview_pages?: Express.Multer.File[];
          }
     ) {
           if (!files.cover_image) {
                throw new Error('Cover image is required');
           }
           if (!files.book_file) {
                throw new Error('Book file is required');
           }

           // Check ISBN uniqueness
           if (data.isbn) {
                const existing = await books_repository.find_book_by_isbn(data.isbn);
                if (existing) {
                     throw new Error(`A book with ISBN ${data.isbn} already exists`);
                }
           }

           const bookId = crypto.randomUUID();
          const slug = slugify(data.title);

          const resolvedCategoryIds = [...(data.category_ids || [])];

          if (data.category_names && data.category_names.length > 0) {
               for (const catName of data.category_names) {
                    if (!catName || !catName.trim()) continue;
                    const trimmedName = catName.trim();

                    // Check if category exists (case-insensitive)
                    let existing = await db
                         .select()
                         .from(categories)
                         .where(sql`LOWER(${categories.category_name}) = LOWER(${trimmedName})`)
                         .then((res) => res[0]);

                    if (!existing) {
                         // Create category
                         const catId = crypto.randomUUID();
                         const slug = trimmedName
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)+/g, '');

                         existing = await db
                              .insert(categories)
                              .values({
                                   id: catId,
                                   category_name: trimmedName,
                                   slug,
                              })
                              .returning()
                              .then((res) => res[0]);
                    }

                    if (existing && !resolvedCategoryIds.includes(existing.id)) {
                         resolvedCategoryIds.push(existing.id);
                    }
               }
          }

          let fileToUpload = files.book_file;

          // DRM Encryption: Encrypt the book file buffer using derived keys
          const { key, iv } = deriveBookDrmKey(bookId);
          const encryptedBuffer = encryptBookBuffer(fileToUpload.buffer, key, iv);
          const encryptedFileToUpload = {
               ...fileToUpload,
               buffer: encryptedBuffer,
          };

          // Upload cover image to S3
          const uploadedCover = await upload_to_s3(files.cover_image, 'covers');

          // Upload encrypted book file to S3
          const uploadedBookFile = await upload_to_s3(encryptedFileToUpload, 'books');

          // Upload preview pages to S3
          let preview_pages_urls: string[] = [];
          if (files.preview_pages && files.preview_pages.length > 0) {
               const uploadPromises = files.preview_pages.map((page) =>
                    upload_to_s3(page, 'previews')
               );
               const uploadedPages = await Promise.all(uploadPromises);
               preview_pages_urls = uploadedPages.map((up) => up.url);
          }

           let previewAlts: string[] = [];
           if (data.preview_pages_alt) {
                if (typeof data.preview_pages_alt === 'string') {
                     try {
                          previewAlts = JSON.parse(data.preview_pages_alt);
                     } catch {
                          previewAlts = [data.preview_pages_alt];
                     }
                } else if (Array.isArray(data.preview_pages_alt)) {
                     previewAlts = data.preview_pages_alt;
                }
           }

          const created_book = await books_repository.create_book({
               id: bookId,
               title: data.title,
               slug,
               description: data.description,
               uploader_id: data.uploader_id,
               author: data.author,
               language: data.language,
               isbn: data.isbn,
               cover_image_url: uploadedCover.url,
               cover_image_alt: data.cover_image_alt || '',
               file_url: uploadedBookFile.url,
               preview_pages: preview_pages_urls,
               preview_pages_alt: previewAlts,
               total_pages: data.total_pages,
               total_chapters: data.total_chapters,
               price: data.price || 0,
               access_period_days: data.access_period_days,
               isTrending: data.isTrending || false,
               isNewRelease: data.isNewRelease || false,
               createdAt: new Date(),
               updatedAt: new Date(),
          });

          // Associate categories
          if (resolvedCategoryIds.length > 0) {
               await db.insert(book_categories).values(
                    resolvedCategoryIds.map((catId) => ({
                         book_id: bookId,
                         category_id: catId,
                    }))
               );
          }

          // Broadcast new book email notification to all users asynchronously
          (async () => {
               try {
                    const active_readers = await db
                         .select({
                              email: users.email,
                              username: users.username,
                         })
                         .from(users)
                         .where(
                              inArray(users.role, [
                                   'USER',
                                   'INSTITUTION_MEMBER',
                              ])
                         );

                    const isFree = created_book.price === 0;
                    const batchSize = 25;
                    for (let i = 0; i < active_readers.length; i += batchSize) {
                         const chunk = active_readers.slice(i, i + batchSize);
                         await Promise.all(
                              chunk.map((reader) => {
                                   if (isFree) {
                                        return sendFreeBookAdvertisementMail(
                                             reader.email,
                                             reader.username || 'Reader',
                                             {
                                                  id: created_book.id,
                                                  title: created_book.title,
                                                  author: created_book.author || 'Oakbridge',
                                                  description: created_book.description || '',
                                                  cover_url: created_book.cover_image_url,
                                             }
                                        ).catch((err) =>
                                             console.error(
                                                  `[MAIL] Free book broadcast failed for user ${reader.email}:`,
                                                  err
                                             )
                                        );
                                   } else {
                                        return sendBookAdvertisementMail(
                                             reader.email,
                                             reader.username || 'Reader',
                                             {
                                                  id: created_book.id,
                                                  title: created_book.title,
                                                  author:
                                                       created_book.author ||
                                                       'Oakbridge',
                                                  description:
                                                       created_book.description ||
                                                       '',
                                                  cover_url:
                                                       created_book.cover_image_url,
                                             }
                                        ).catch((err) =>
                                             console.error(
                                                  `[MAIL] Broadcast failed for user ${reader.email}:`,
                                                  err
                                             )
                                        );
                                   }
                              })
                         );
                    }
               } catch (err) {
                    console.error(
                         '[MAIL] Failed to broadcast book release notification:',
                         err
                    );
               }
          })();

          return await map_book_with_presigned_urls(created_book);
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
          const all_books = await books_repository.get_all_books(filters);

          const bookIds = all_books.map((b) => b.id);
          const categoriesByBook: Record<string, string[]> = {};

          if (bookIds.length > 0) {
               const associations = await db
                    .select()
                    .from(book_categories)
                    .where(inArray(book_categories.book_id, bookIds));

               associations.forEach((assoc) => {
                    if (!categoriesByBook[assoc.book_id])
                         categoriesByBook[assoc.book_id] = [];
                    categoriesByBook[assoc.book_id].push(assoc.category_id);
               });
          }

          const booksWithPresignedUrls = await Promise.all(
               all_books.map(async (book) => {
                    const mapped = await map_book_with_presigned_urls(book);
                    return {
                         ...mapped,
                         category_ids: categoriesByBook[book.id] || [],
                    };
               })
          );

          return booksWithPresignedUrls;
     },

     async get_book_by_id(id: string) {
          const book = await books_repository.find_book_by_id(id);
          if (!book) {
               throw new Error('Book not found');
          }

          // Fetch associated category IDs for this book
          const associated_categories = await db
               .select()
               .from(book_categories)
               .where(eq(book_categories.book_id, id));

          const category_ids = associated_categories.map((c) => c.category_id);

          const bookWithUrls = await map_book_with_presigned_urls(book);
          return {
               ...bookWithUrls,
               category_ids,
          };
     },

     async update_book(
          id: string,
          data: Partial<{
               title: string;
               description: string;
               author: string;
               language: string;
               isbn: string;
               total_pages: number;
               total_chapters: number;
               price?: number;
               category_ids?: string[];
               access_period_days?: number | null;
               isTrending?: boolean;
               isNewRelease?: boolean;
               cover_image_alt?: string;
               preview_pages_alt?: string | string[];
          }>,
          files?: {
               cover_image?: Express.Multer.File;
               book_file?: Express.Multer.File;
               preview_pages?: Express.Multer.File[];
          }
     ) {
          const existing_book = await books_repository.find_book_by_id(id);
          if (!existing_book) {
               throw new Error('Book not found');
          }

          // Check ISBN uniqueness
          if (data.isbn) {
               const existing = await books_repository.find_book_by_isbn(data.isbn);
               if (existing && existing.id !== id) {
                    throw new Error(`A book with ISBN ${data.isbn} already exists`);
               }
          }

          const updateData: any = {
               ...data,
               updatedAt: new Date(),
          };

          if (data.preview_pages_alt) {
               if (typeof data.preview_pages_alt === 'string') {
                    try {
                         updateData.preview_pages_alt = JSON.parse(data.preview_pages_alt);
                    } catch {
                         updateData.preview_pages_alt = [data.preview_pages_alt];
                    }
               } else if (Array.isArray(data.preview_pages_alt)) {
                    updateData.preview_pages_alt = data.preview_pages_alt;
               }
          }

          if (data.title) {
               updateData.slug = slugify(data.title);
          }

          // Handle cover image replacement if provided
          if (files?.cover_image) {
               if (existing_book.cover_image_url) {
                    await delete_from_s3(existing_book.cover_image_url);
               }
               const uploadedCover = await upload_to_s3(
                    files.cover_image,
                    'covers'
               );
               updateData.cover_image_url = uploadedCover.url;
          }

          // Handle book file replacement if provided
          if (files?.book_file) {
               if (existing_book.file_url) {
                    await delete_from_s3(existing_book.file_url);
               }
               const fileToUpload = files.book_file;

               // DRM Encryption: Encrypt the book file buffer using derived keys
               const { key, iv } = deriveBookDrmKey(id);
               const encryptedBuffer = encryptBookBuffer(fileToUpload.buffer, key, iv);
               const encryptedFileToUpload = {
                    ...fileToUpload,
                    buffer: encryptedBuffer,
               };

               const uploadedBookFile = await upload_to_s3(
                    encryptedFileToUpload,
                    'books'
               );
               updateData.file_url = uploadedBookFile.url;
          }

          // Handle preview_pages replacement if provided
          if (files?.preview_pages && files.preview_pages.length > 0) {
               // First, delete old preview pages from S3
               if (
                    existing_book.preview_pages &&
                    existing_book.preview_pages.length > 0
               ) {
                    const deletePromises = existing_book.preview_pages.map(
                         (url: string) => delete_from_s3(url)
                    );
                    await Promise.all(deletePromises);
               }
               // Upload new ones
               const uploadPromises = files.preview_pages.map((page) =>
                    upload_to_s3(page, 'previews')
               );
               const uploadedPages = await Promise.all(uploadPromises);
               updateData.preview_pages = uploadedPages.map((up) => up.url);
          }

          // Remove category_ids from main book update payload
          delete updateData.category_ids;

          // Update book metadata in database
          const updated_book = await books_repository.update_book(
               id,
               updateData
          );

          // Update category associations if category_ids provided
          if (data.category_ids) {
               // First delete existing associations
               await db
                    .delete(book_categories)
                    .where(eq(book_categories.book_id, id));
               // Then insert new ones
               if (data.category_ids.length > 0) {
                    await db.insert(book_categories).values(
                         data.category_ids.map((catId) => ({
                              book_id: id,
                              category_id: catId,
                         }))
                    );
               }
          }

          return await map_book_with_presigned_urls(updated_book);
     },

     async delete_book(id: string) {
          const existing_book = await books_repository.find_book_by_id(id);
          if (!existing_book) {
               throw new Error('Book not found');
          }

          // Delete from book categories (handled automatically if cascade on delete exists, but safe to delete explicitly)
          await db
               .delete(book_categories)
               .where(eq(book_categories.book_id, id));

          if (existing_book.cover_image_url) {
               await delete_from_s3(existing_book.cover_image_url);
          }
          if (existing_book.file_url) {
               await delete_from_s3(existing_book.file_url);
          }
          const deleted_book = await books_repository.delete_book(id);
          return deleted_book;
     },

     async get_recommendations(userId: string) {
          // Enable pg_trgm extension dynamically
          try {
               await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
          } catch (err) {
               console.error('[DB] Failed to enable pg_trgm extension:', err);
          }

          // 1. Get completed payments
          const completedPayments = await db
               .select({ bookId: payments.book_id })
               .from(payments)
               .where(
                    and(
                         eq(payments.user_id, userId),
                         eq(payments.status, 'completed')
                    )
               );

          // 2. Get shelved books
          const shelvedBooks = await db
               .select({ bookId: bookshelves.book_id })
               .from(bookshelves)
               .where(eq(bookshelves.user_id, userId));

          const interactedBookIds = Array.from(
               new Set([
                    ...completedPayments.map((p) => p.bookId),
                    ...shelvedBooks.map((s) => s.bookId),
               ])
          ).filter((id): id is string => id !== null && id !== undefined);

          let recommendedList: any[] = [];

          if (interactedBookIds.length > 0) {
               // Fetch details (titles) of the books user has interacted with
               const userBooks = await db
                    .select({ title: books.title })
                    .from(books)
                    .where(inArray(books.id, interactedBookIds));

               const userBookTitles = userBooks
                    .map((b) => b.title)
                    .filter(Boolean);

               // Fetch categories of user interacted books
               const userBookCategories = await db
                    .select({ categoryId: book_categories.category_id })
                    .from(book_categories)
                    .where(inArray(book_categories.book_id, interactedBookIds));

               const categoryIds = Array.from(
                    new Set(
                         userBookCategories
                              .map((c) => c.categoryId)
                              .filter(Boolean)
                    )
               );

               // Build SQL expressions for similarity
               // 1. Category match count
               const categoryMatchExpr =
                    categoryIds.length > 0
                         ? sql<number>`count(case when ${book_categories.category_id} in (${sql.join(
                              categoryIds.map((id) => sql`${id}`),
                              sql`, `
                         )}) then 1 end)`
                         : sql<number>`0`;

               // 2. Title similarity score (using max/greatest to comply with standard SQL GROUP BY)
               const titleSimilarityExpr =
                    userBookTitles.length > 0
                         ? sql<number>`max(greatest(${sql.join(
                              userBookTitles.map(
                                   (title) =>
                                        sql`similarity(${books.title}, ${title})`
                              ),
                              sql`, `
                         )}))`
                         : sql<number>`0`;

               // Hybrid Score: Weight category match higher (e.g. 2.0 per match) and title similarity (e.g. 5.0 * similarity score)
               const scoreExpr = sql<number>`(2.0 * ${categoryMatchExpr}) + (5.0 * ${titleSimilarityExpr})`;

               // Query candidates: join books with their categories and compute composite score
               const candidates = await db
                    .select({
                         book: books,
                         score: scoreExpr,
                    })
                    .from(books)
                    .leftJoin(
                         book_categories,
                         eq(books.id, book_categories.book_id)
                    )
                    .where(notInArray(books.id, interactedBookIds))
                    .groupBy(books.id)
                    .orderBy(
                         desc(titleSimilarityExpr),
                         desc(categoryMatchExpr)
                    )
                    .limit(6);

               recommendedList = candidates.map((c) => c.book);
          }

          // If recommendations are fewer than 6, fetch fallback books (random/newest)
          if (recommendedList.length < 6) {
               const excludedIds = [
                    ...interactedBookIds,
                    ...recommendedList.map((b) => b.id),
               ];
               const fillCount = 6 - recommendedList.length;

               let query = db.select().from(books);
               if (excludedIds.length > 0) {
                    query = query.where(
                         notInArray(books.id, excludedIds)
                    ) as typeof query;
               }
               const fillers = await query.limit(fillCount);
               recommendedList.push(...fillers);
          }

          // Fetch associated category IDs for each recommended book
          const recommendedIds = recommendedList.map((b) => b.id);
          const categoriesByBook: Record<string, string[]> = {};
          if (recommendedIds.length > 0) {
               const associations = await db
                    .select()
                    .from(book_categories)
                    .where(inArray(book_categories.book_id, recommendedIds));

               associations.forEach((assoc) => {
                    if (!categoriesByBook[assoc.book_id])
                         categoriesByBook[assoc.book_id] = [];
                    categoriesByBook[assoc.book_id].push(assoc.category_id);
               });
          }

          // Map presigned URLs for each book
          const mappedBooks = await Promise.all(
               recommendedList.map(async (book) => {
                    const mapped = await map_book_with_presigned_urls(book);
                    return {
                         ...mapped,
                         category_ids: categoriesByBook[book.id] || [],
                    };
               })
          );

          return mappedBooks;
     },
};
