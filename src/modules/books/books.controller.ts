import { Request, Response } from 'express';
import { Readable } from 'stream';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../../config/app.config';
import { books_service } from './books.service';
import { notifications_service } from '../notifications/notifications.service';
import { db } from '../../db/db';
import { bookshelves, free_candidate_allowed_books } from '../../db/schemas';
import { and, eq, inArray } from 'drizzle-orm';
import { hasActiveInstitutionSubscription } from '../../utils/subscription.helper';
import { deriveBookDrmKey } from '../../utils/drm';
import { get_preview_key_from_url, get_presigned_url } from '../../utils/s3';
import { book_categories, institution_allowed_categories, institution_allowed_books, users } from '../../db/schemas';
import { entitlement_book_id } from '../../utils/book_sets';

export async function checkBookAllowedBatch(
     userId: string | undefined,
     bookIds: string[]
): Promise<Map<string, boolean>> {
     const resultMap = new Map<string, boolean>();
     if (bookIds.length === 0) return resultMap;

     if (!userId) {
          bookIds.forEach((id) => resultMap.set(id, true));
          return resultMap;
     }

     const [user] = await db
          .select({
               institution_id: users.institution_id,
               role: users.role,
               is_free_candidate: users.is_free_candidate,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

     if (!user || ['SUPERADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
          bookIds.forEach((id) => resultMap.set(id, true));
          return resultMap;
     }

     if (user.is_free_candidate) {
          const allowedRows = await db
               .select({ bookId: free_candidate_allowed_books.book_id })
               .from(free_candidate_allowed_books)
               .where(
                    and(
                         eq(free_candidate_allowed_books.user_id, userId),
                         inArray(free_candidate_allowed_books.book_id, bookIds)
                    )
               );
          const allowedSet = new Set(allowedRows.map((r) => r.bookId));
          bookIds.forEach((id) => resultMap.set(id, allowedSet.has(id)));
          return resultMap;
     }

     if (!user.institution_id) {
          bookIds.forEach((id) => resultMap.set(id, true));
          return resultMap;
     }

     const restrictions = await db
          .select({
               categoryId: institution_allowed_categories.category_id,
          })
          .from(institution_allowed_categories)
          .where(eq(institution_allowed_categories.institution_id, user.institution_id));

     if (restrictions.length === 0) {
          bookIds.forEach((id) => resultMap.set(id, true));
          return resultMap;
     }

     const allowedCategoryIds = new Set(restrictions.map((r) => r.categoryId));

     const bookCategoriesRows = await db
          .select({
               bookId: book_categories.book_id,
               categoryId: book_categories.category_id,
          })
          .from(book_categories)
          .where(inArray(book_categories.book_id, bookIds));

     const bookCategoriesMap = new Map<string, Set<string>>();
     for (const row of bookCategoriesRows) {
          if (!bookCategoriesMap.has(row.bookId)) {
               bookCategoriesMap.set(row.bookId, new Set());
          }
          bookCategoriesMap.get(row.bookId)!.add(row.categoryId);
     }

     for (const id of bookIds) {
          const cats = bookCategoriesMap.get(id);
          if (!cats || cats.size === 0) {
               resultMap.set(id, false);
          } else {
               let allowed = false;
               for (const catId of cats) {
                    if (allowedCategoryIds.has(catId)) {
                         allowed = true;
                         break;
                    }
               }
               resultMap.set(id, allowed);
          }
     }

     return resultMap;
}

export async function isBookAllowedForUser(userId: string | undefined, rawBookId: string): Promise<boolean> {
     if (!userId) return true;

     // Category rules and free-candidate grants are held against the set, so a
     // volume is judged by its parent.
     const bookId = await entitlement_book_id(rawBookId);

     const [user] = await db
          .select({ institution_id: users.institution_id, role: users.role, is_free_candidate: users.is_free_candidate })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

     if (!user || ['SUPERADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
          return true;
     }

     if (user.is_free_candidate) {
          const [allowed] = await db
               .select()
               .from(free_candidate_allowed_books)
               .where(
                    and(
                         eq(free_candidate_allowed_books.user_id, userId),
                         eq(free_candidate_allowed_books.book_id, bookId)
                    )
               )
               .limit(1);
          return !!allowed;
     }

     if (!user.institution_id) {
          return true;
     }

     const restrictions = await db
          .select({
               categoryId: institution_allowed_categories.category_id,
               allowAllBooks: institution_allowed_categories.allow_all_books,
          })
          .from(institution_allowed_categories)
          .where(eq(institution_allowed_categories.institution_id, user.institution_id));

     if (restrictions.length === 0) {
          return true;
     }

     const bookCats = await db
          .select({ categoryId: book_categories.category_id })
          .from(book_categories)
          .where(eq(book_categories.book_id, bookId));

     const matchingRestrictions = restrictions.filter((r) =>
          bookCats.some((bc) => bc.categoryId === r.categoryId)
     );

     if (matchingRestrictions.length === 0) {
          return false;
     }

     // If any allowed category for this book permits all books, access is granted
     const hasAllowAll = matchingRestrictions.some((r) => r.allowAllBooks);
     if (hasAllowAll) {
          return true;
     }

     // Otherwise, check if the specific book is whitelisted
     const [bookAllowed] = await db
          .select()
          .from(institution_allowed_books)
          .where(
               and(
                    eq(institution_allowed_books.institution_id, user.institution_id),
                    eq(institution_allowed_books.book_id, bookId)
               )
          )
          .limit(1);

     return !!bookAllowed;
}

export const books_controller = {
     async create_book(req: Request, res: Response): Promise<any> {
          try {
               const files = req.files as {
                    [fieldname: string]: Express.Multer.File[];
               };
               const cover_image = files?.cover_image?.[0];
               const book_file = files?.book_file?.[0];
               const preview_pages = files?.preview_pages || [];

               // A multi-volume set carries no file of its own - its volumes are
               // uploaded one at a time afterwards.
               const is_set =
                    req.body.is_set === 'true' || req.body.is_set === true;

               if (!cover_image) {
                    return res
                         .status(400)
                         .json({ message: 'Cover image file is required' });
               }
               if (!book_file && !is_set) {
                    return res
                         .status(400)
                         .json({ message: 'Book ebook file is required' });
               }
               if (
                    book_file &&
                    book_file.mimetype !== 'application/pdf' &&
                    !book_file.originalname.toLowerCase().endsWith('.pdf')
               ) {
                    return res
                         .status(400)
                         .json({ message: 'Only PDF files are allowed' });
               }

               const {
                    title,
                    description,
                    author,
                    publisher,
                    language,
                    isbn,
                    total_pages,
                    total_chapters,
                    price,
                    category_ids,
                    category_names,
                    access_period_days,
                    isTrending,
                    isNewRelease,
               } = req.body;

               const finalAuthor = author || publisher;

               // Validate required text fields
               if (
                    !title ||
                    !description ||
                    !finalAuthor ||
                    !language ||
                    !isbn
               ) {
                    return res.status(400).json({
                         message: 'Missing required book details (title, description, author, language, isbn)',
                    });
               }

               const parsed_category_ids = category_ids
                    ? typeof category_ids === 'string'
                         ? JSON.parse(category_ids)
                         : category_ids
                    : [];

               const parsed_category_names = category_names
                    ? typeof category_names === 'string'
                         ? JSON.parse(category_names)
                         : category_names
                    : [];

               const parsed_access_period_days = access_period_days === '' || access_period_days === 'null' || access_period_days === null || access_period_days === undefined
                    ? null
                    : Number(access_period_days);

               const parsed_is_trending = isTrending === 'true' || isTrending === true;
               const parsed_is_new_release = isNewRelease === 'true' || isNewRelease === true;

               // Author is populated by auth middleware on req.user
               const authorId = req.user?.id;
               if (!authorId) {
                    return res
                         .status(401)
                         .json({ message: 'Unauthorized: User ID not found' });
               }

               const created_book = await books_service.create_book(
                    {
                         title,
                         description,
                         author: finalAuthor,
                         language,
                         isbn,
                         total_pages: Number(total_pages || 0),
                         total_chapters: Number(total_chapters || 0),
                         price: Number(price || 0),
                         access_period_days: parsed_access_period_days,
                         uploader_id: authorId,
                         category_ids: parsed_category_ids,
                         category_names: parsed_category_names,
                         isTrending: parsed_is_trending,
                         isNewRelease: parsed_is_new_release,
                         is_set,
                    },
                    { cover_image, book_file, preview_pages }
               );

               // Fire-and-forget notification creation for standard readers
               notifications_service
                    .notify_new_book(title)
                    .catch((err) =>
                         console.error(
                              'Failed to trigger new book notifications:',
                              err
                         )
                    );

               return res.status(201).json({
                    message: 'Book created successfully',
                    book: created_book,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to create book',
               });
          }
     },

     async get_all_books(req: Request, res: Response): Promise<any> {
          try {
               const authorId = ['SUPERADMIN', 'ADMIN'].includes(req.user?.role)
                    ? req.user?.id
                    : undefined;

               const search = req.query.search as string | undefined;
               const category = req.query.category as string | undefined;
               const authorName = req.query.author as string | undefined;

               // Get category restrictions for the user's institution
               let allowedCategoryRestrictions: { categoryId: string; allowAllBooks: boolean }[] | undefined;
               let allowedBookIds: string[] | undefined;
               let userId = req.user?.id;

               if (!userId) {
                    const authHeader = req.headers.authorization;
                    if (authHeader && authHeader.startsWith('Bearer ')) {
                         const token = authHeader.split(' ')[1];
                         try {
                              if (securityConfig.jwtSecret) {
                                   const decoded = jwt.verify(token, securityConfig.jwtSecret) as any;
                                   if (decoded && decoded.id) {
                                        userId = decoded.id;
                                   }
                              }
                         } catch (err) {
                              // Ignore token verification errors since this endpoint is optionally authenticated
                         }
                    }
               }

               if (userId) {
                    const [user] = await db
                         .select({ institution_id: users.institution_id, is_free_candidate: users.is_free_candidate })
                         .from(users)
                         .where(eq(users.id, userId))
                         .limit(1);

                    if (user?.is_free_candidate) {
                         const booksRes = await db
                              .select({ bookId: free_candidate_allowed_books.book_id })
                              .from(free_candidate_allowed_books)
                              .where(eq(free_candidate_allowed_books.user_id, userId));

                         allowedBookIds = booksRes.map((b) => b.bookId);
                    } else if (user?.institution_id) {
                         const restrictions = await db
                              .select({
                                   categoryId: institution_allowed_categories.category_id,
                                   allowAllBooks: institution_allowed_categories.allow_all_books,
                              })
                              .from(institution_allowed_categories)
                              .where(eq(institution_allowed_categories.institution_id, user.institution_id));

                         if (restrictions.length > 0) {
                              allowedCategoryRestrictions = restrictions;

                              const needsBookWhitelist = restrictions.some((r) => !r.allowAllBooks);
                              if (needsBookWhitelist) {
                                   const booksRes = await db
                                        .select({ bookId: institution_allowed_books.book_id })
                                        .from(institution_allowed_books)
                                        .where(eq(institution_allowed_books.institution_id, user.institution_id));

                                   allowedBookIds = booksRes.map((b) => b.bookId);
                              }
                         }
                    }
               }

               if (allowedCategoryRestrictions !== undefined && allowedCategoryRestrictions.length === 0) {
                    return res.status(200).json({
                         message: 'Books fetched successfully',
                         books: [],
                    });
               }

               const filters = {
                    authorId,
                    search,
                    category,
                    authorName,
                    allowedCategoryRestrictions,
                    allowedBookIds,
               };

               const books = await books_service.get_all_books(filters);
               return res.status(200).json({
                    message: 'Books fetched successfully',
                    books,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch books',
               });
          }
     },

     async get_book_by_id(req: Request, res: Response): Promise<any> {
          try {
               const id = req.query.id as string;
               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const allowed = await isBookAllowedForUser(req.user?.id, id);
               if (!allowed) {
                    return res.status(403).json({ message: 'Access denied: You do not have permission to view books in this category.' });
               }

               const book = await books_service.get_book_by_id(id);
               return res.status(200).json({
                    message: 'Book details fetched successfully',
                    book,
               });
          } catch (error: any) {
               return res.status(404).json({
                    message: error.message || 'Book not found',
               });
          }
     },

     async update_book(req: Request, res: Response): Promise<any> {
          try {
               const id = req.query.id as string;
               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const files = req.files as {
                    [fieldname: string]: Express.Multer.File[];
               };
               const cover_image = files?.cover_image?.[0];
               const book_file = files?.book_file?.[0];
               const preview_pages = files?.preview_pages || [];

               if (
                    book_file &&
                    book_file.mimetype !== 'application/pdf' &&
                    !book_file.originalname.toLowerCase().endsWith('.pdf')
               ) {
                    return res
                         .status(400)
                         .json({ message: 'Only PDF files are allowed' });
               }

               const {
                    title,
                    description,
                    author,
                    publisher,
                    language,
                    isbn,
                    total_pages,
                    total_chapters,
                    price,
                    category_ids,
                    access_period_days,
                    isTrending,
                    isNewRelease,
               } = req.body;

               const parsed_category_ids = category_ids
                    ? typeof category_ids === 'string'
                         ? JSON.parse(category_ids)
                         : category_ids
                    : undefined;

               const updateData: any = {};
               if (title !== undefined) updateData.title = title;
               if (description !== undefined)
                    updateData.description = description;

               const finalAuthor = author !== undefined ? author : publisher;
               if (finalAuthor !== undefined) {
                    updateData.author = finalAuthor;
                    updateData.publisher = finalAuthor; // duplicate for backward compatibility
               }
               if (language !== undefined) updateData.language = language;
               if (isbn !== undefined) updateData.isbn = isbn;
               if (total_pages !== undefined)
                    updateData.total_pages = Number(total_pages);
               if (total_chapters !== undefined)
                    updateData.total_chapters = Number(total_chapters);
               if (price !== undefined) updateData.price = Number(price);
               if (parsed_category_ids !== undefined)
                    updateData.category_ids = parsed_category_ids;
               if (access_period_days !== undefined) {
                    updateData.access_period_days = access_period_days === '' || access_period_days === 'null' || access_period_days === null
                         ? null
                         : Number(access_period_days);
               }
               if (isTrending !== undefined) {
                    updateData.isTrending = isTrending === 'true' || isTrending === true;
               }
               if (isNewRelease !== undefined) {
                    updateData.isNewRelease = isNewRelease === 'true' || isNewRelease === true;
               }
               // Turning an existing title into a multi-volume set (its volumes
               // are then uploaded one at a time)
               if (req.body.is_set !== undefined) {
                    updateData.is_set =
                         req.body.is_set === 'true' || req.body.is_set === true;
               }

               const updated_book = await books_service.update_book(
                    id,
                    updateData,
                    { cover_image, book_file, preview_pages }
               );

               return res.status(200).json({
                    message: 'Book updated successfully',
                    book: updated_book,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to update book',
               });
          }
     },

     async delete_book(req: Request, res: Response): Promise<any> {
          try {
               const id = req.query.id as string;
               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const deleted_book = await books_service.delete_book(id);
               return res.status(200).json({
                    message: 'Book deleted successfully',
                    book: deleted_book,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to delete book',
               });
          }
     },

     async download_book(req: Request, res: Response): Promise<any> {
          try {
               const id = req.query.id as string;
               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const allowed = await isBookAllowedForUser(req.user?.id, id);
               if (!allowed) {
                    return res.status(403).json({ message: 'Access denied: You do not have permission to download books in this category.' });
               }

               const book = await books_service.get_book_by_id(id);
               if (!book || !book.file_url) {
                    return res.status(404).json({
                         message: book?.is_set
                              ? 'This is a multi-volume set. Open one of its volumes instead.'
                              : 'Book or file not found',
                    });
               }

               // Security check: Verify library access / subscription for reading
               const userId = req.user?.id;
               const userRole = req.user?.role;
               if (!userId) {
                    return res
                         .status(401)
                         .json({ message: 'Unauthorized' });
               }

               // A volume is read through the entitlement of the set it belongs
               // to: the purchase, shelf row and access period all sit there.
               const entitlementId = await entitlement_book_id(id);
               const entitlementBook =
                    entitlementId === id
                         ? book
                         : await books_service.get_book_by_id(entitlementId);

               // Bypass library check if the user is a SUPERADMIN
               if (userRole !== 'SUPERADMIN') {
                    // Check if they are a free candidate for this book
                    const [freeAccessRecord] = await db
                         .select()
                         .from(free_candidate_allowed_books)
                         .where(
                              and(
                                   eq(free_candidate_allowed_books.user_id, userId),
                                   eq(free_candidate_allowed_books.book_id, entitlementId)
                              )
                         )
                         .limit(1);

                    if (!freeAccessRecord) {
                         // Institutional subscription check
                         const hasSub =
                              await hasActiveInstitutionSubscription(userId);
                         if (!hasSub) {
                              const existingShelf = await db
                                   .select()
                                   .from(bookshelves)
                                   .where(
                                        and(
                                             eq(bookshelves.user_id, userId),
                                             eq(bookshelves.book_id, entitlementId)
                                        )
                                   )
                                   .limit(1);

                              if (existingShelf.length === 0) {
                                   return res.status(403).json({
                                        message: 'Forbidden: You must add this book to your library to read it.',
                                   });
                              }

                              // Check access expiration
                              if (entitlementBook?.access_period_days && entitlementBook.access_period_days > 0) {
                                   const addedAt = new Date(existingShelf[0].added_at);
                                   const expirationDate = new Date(addedAt.getTime() + entitlementBook.access_period_days * 24 * 60 * 60 * 1000);
                                   if (new Date() > expirationDate) {
                                        return res.status(403).json({
                                             message: 'Forbidden: Your access to this book has expired.',
                                        });
                                   }
                              }
                         }
                    }
               }
               const response = await fetch(book.file_url);
               if (!response.ok || !response.body) {
                    return res.status(500).json({
                         message: 'Failed to fetch book from storage',
                    });
               }

               res.setHeader(
                    'Content-Type',
                    response.headers.get('content-type') ||
                    'application/epub+zip'
               );

               // Use standard web streams pumping for compatibility across node fetch implementations
               const reader = response.body.getReader();
               while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
               }
               res.end();
          } catch (error: any) {
               if (!res.headersSent) {
                    return res.status(500).json({
                         message: error.message || 'Failed to download book',
                    });
               } else {
                    res.end();
               }
          }
     },

     async get_recommendations(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const recommendations =
                    await books_service.get_recommendations(userId);

               const recIds = recommendations.map((b) => b.id);
               const allowedMap = await checkBookAllowedBatch(userId, recIds);
               const allowedRecommendations = recommendations.filter((b) => allowedMap.get(b.id));

               return res.status(200).json({
                    message: 'Recommendations fetched successfully',
                    books: allowedRecommendations,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch recommendations',
               });
          }
     },

     async get_drm_key(req: Request, res: Response): Promise<any> {
          try {
               const id = req.query.id as string;
               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const allowed = await isBookAllowedForUser(req.user?.id, id);
               if (!allowed) {
                    return res.status(403).json({ message: 'Access denied: You do not have permission to read books in this category.' });
               }

               const book = await books_service.get_book_by_id(id);
               if (!book) {
                    return res
                         .status(404)
                         .json({ message: 'Book not found' });
               }

               // Security check: Verify library access / subscription for reading
               const userId = req.user?.id;
               const userRole = req.user?.role;
               if (!userId) {
                    return res
                         .status(401)
                         .json({ message: 'Unauthorized' });
               }

               // A volume is read through the entitlement of its parent set.
               const entitlementId = await entitlement_book_id(id);
               const entitlementBook =
                    entitlementId === id
                         ? book
                         : await books_service.get_book_by_id(entitlementId);

               if (userRole !== 'SUPERADMIN') {
                    // Check if they are a free candidate for this book
                    const [freeAccessRecord] = await db
                         .select()
                         .from(free_candidate_allowed_books)
                         .where(
                              and(
                                   eq(free_candidate_allowed_books.user_id, userId),
                                   eq(free_candidate_allowed_books.book_id, entitlementId)
                              )
                         )
                         .limit(1);

                    if (!freeAccessRecord) {
                         // Institutional subscription check
                         const hasSub =
                              await hasActiveInstitutionSubscription(userId);
                         if (!hasSub) {
                              const existingShelf = await db
                                   .select()
                                   .from(bookshelves)
                                   .where(
                                        and(
                                             eq(bookshelves.user_id, userId),
                                             eq(bookshelves.book_id, entitlementId)
                                        )
                                   )
                                   .limit(1);

                              if (existingShelf.length === 0) {
                                   return res.status(403).json({
                                        message: 'Forbidden: You must add this book to your library to read it.',
                                   });
                              }

                              // Check access expiration
                              if (entitlementBook?.access_period_days && entitlementBook.access_period_days > 0) {
                                   const addedAt = new Date(existingShelf[0].added_at);
                                   const expirationDate = new Date(addedAt.getTime() + entitlementBook.access_period_days * 24 * 60 * 60 * 1000);
                                   if (new Date() > expirationDate) {
                                        return res.status(403).json({
                                             message: 'Forbidden: Your access to this book has expired.',
                                        });
                                   }
                              }
                         }
                    }
               }

               // Derive the DRM key and IV deterministically
               const { key, iv } = deriveBookDrmKey(id);

               return res.status(200).json({
                    key: key.toString('hex'),
                    iv: iv.toString('hex'),
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch DRM key',
               });
          }
     },

     async preview_proxy(req: Request, res: Response): Promise<any> {
          try {
               const url = req.query.url as string;
               if (!url) {
                    return res
                         .status(400)
                         .json({ message: 'URL query parameter is required' });
               }

               // Only book preview files in our own S3 bucket. We never fetch the
               // URL we were given: we take the file key from it and create our own
               // signed S3 link, so this can't be used to reach other addresses.
               const key = get_preview_key_from_url(url);
               if (!key) {
                    return res.status(403).json({
                         message: 'Forbidden: Invalid URL for preview proxying',
                    });
               }

               const signedUrl = await get_presigned_url(key);
               const response = await fetch(signedUrl, { redirect: 'error' });
               if (!response.ok || !response.body) {
                    return res.status(404).json({
                         message: 'Preview file not found',
                    });
               }

               res.setHeader('Content-Type', 'application/pdf');
               res.setHeader('Cache-Control', 'private, max-age=300');

               const reader = response.body.getReader();
               while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
               }
               res.end();
          } catch (error: any) {
               console.error('[PREVIEW] Failed to proxy preview file:', error);
               if (!res.headersSent) {
                    return res.status(500).json({ message: 'Failed to load preview file' });
               }
               res.end();
          }
     },

     // ── Multi-volume sets ────────────────────────────────────────────────

     /** Add one volume to a set (uploaded one at a time from the admin form). */
     async add_volume(req: Request, res: Response): Promise<any> {
          try {
               const set_id = req.params.id;
               const files = req.files as {
                    [fieldname: string]: Express.Multer.File[];
               };
               const book_file = files?.book_file?.[0];
               const cover_image = files?.cover_image?.[0];

               if (!book_file) {
                    return res
                         .status(400)
                         .json({ message: 'Volume PDF is required' });
               }
               if (
                    book_file.mimetype !== 'application/pdf' &&
                    !book_file.originalname.toLowerCase().endsWith('.pdf')
               ) {
                    return res
                         .status(400)
                         .json({ message: 'Only PDF files are allowed' });
               }

               const volume = await books_service.add_volume(
                    set_id,
                    {
                         volume_number: req.body.volume_number
                              ? Number(req.body.volume_number)
                              : undefined,
                         volume_label: req.body.volume_label,
                         total_pages: Number(req.body.total_pages || 0),
                         total_chapters: Number(req.body.total_chapters || 0),
                    },
                    { book_file, cover_image }
               );

               return res.status(201).json({
                    message: 'Volume added successfully',
                    data: volume,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to add volume',
               });
          }
     },

     async update_volume(req: Request, res: Response): Promise<any> {
          try {
               const files = req.files as {
                    [fieldname: string]: Express.Multer.File[];
               };
               const book_file = files?.book_file?.[0];

               const volume = await books_service.update_volume(
                    req.params.id,
                    {
                         volume_number: req.body.volume_number
                              ? Number(req.body.volume_number)
                              : undefined,
                         volume_label: req.body.volume_label,
                         total_pages:
                              req.body.total_pages !== undefined
                                   ? Number(req.body.total_pages)
                                   : undefined,
                         total_chapters:
                              req.body.total_chapters !== undefined
                                   ? Number(req.body.total_chapters)
                                   : undefined,
                    },
                    { book_file }
               );

               return res.status(200).json({
                    message: 'Volume updated successfully',
                    data: volume,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to update volume',
               });
          }
     },

     async delete_volume(req: Request, res: Response): Promise<any> {
          try {
               await books_service.delete_volume(req.params.id);
               return res
                    .status(200)
                    .json({ message: 'Volume deleted successfully' });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to delete volume',
               });
          }
     },

     async reorder_volumes(req: Request, res: Response): Promise<any> {
          try {
               const volume_ids = Array.isArray(req.body.volume_ids)
                    ? req.body.volume_ids
                    : [];
               if (volume_ids.length === 0) {
                    return res
                         .status(400)
                         .json({ message: 'volume_ids is required' });
               }

               const volumes = await books_service.reorder_volumes(
                    req.params.id,
                    volume_ids
               );
               return res.status(200).json({
                    message: 'Volumes reordered successfully',
                    data: volumes,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to reorder volumes',
               });
          }
     },
};
