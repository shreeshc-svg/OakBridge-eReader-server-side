import { db } from '../../db/db';
import { eq, and } from 'drizzle-orm';
import {
     highlights,
     reading_progress,
     reading_sessions,
     bookshelves,
     bookmarks,
} from '../../db/schemas';

import crypto from 'crypto';

export const reader_service = {
     async get_progress(user_id: string, book_id: string) {
          const progress = await db
               .select()
               .from(reading_progress)
               .where(
                    and(
                         eq(reading_progress.user_id, user_id),
                         eq(reading_progress.book_id, book_id)
                    )
               )
               .limit(1);
          return progress[0] || null;
     },

     async upsert_progress(
          user_id: string,
          book_id: string,
          progress_percentage: number,
          current_cfi?: string,
          current_chapter?: string
     ) {
          const existing = await this.get_progress(user_id, book_id);
          let result;

          if (existing) {
               const updated = await db
                    .update(reading_progress)
                    .set({
                         progress_percentage,
                         current_cfi: current_cfi || existing.current_cfi,
                         current_chapter:
                              current_chapter || existing.current_chapter,
                         last_read_at: new Date(),
                         updatedAt: new Date(),
                    })
                    .where(eq(reading_progress.id, existing.id))
                    .returning();
               result = updated[0];
          } else {
               const newProgress = await db
                    .insert(reading_progress)
                    .values({
                         id: crypto.randomUUID(),
                         user_id,
                         book_id,
                         progress_percentage,
                         current_cfi,
                         current_chapter,
                         last_read_at: new Date(),
                    })
                    .returning();
               result = newProgress[0];
          }

          // 1. Log/update reading session (for heatmap & minutes stats)
          try {
               const today_str = new Date().toISOString().split('T')[0];
               const existingSession = await db
                    .select()
                    .from(reading_sessions)
                    .where(
                         and(
                              eq(reading_sessions.user_id, user_id),
                              eq(reading_sessions.date, today_str)
                         )
                    )
                    .limit(1);

               let minutesToAdd = 1; // default fallback
               if (existing && existing.last_read_at) {
                    const diffMs =
                         new Date().getTime() -
                         new Date(existing.last_read_at).getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    if (diffMins >= 1 && diffMins <= 10) {
                         minutesToAdd = diffMins;
                    } else if (diffMins > 10) {
                         minutesToAdd = 1;
                    } else {
                         minutesToAdd = 0; // page clicked too fast
                    }
               }

               if (existingSession.length > 0) {
                    if (minutesToAdd > 0) {
                         await db
                              .update(reading_sessions)
                              .set({
                                   minutes_read:
                                        existingSession[0].minutes_read +
                                        minutesToAdd,
                                   updatedAt: new Date(),
                              })
                              .where(
                                   eq(
                                        reading_sessions.id,
                                        existingSession[0].id
                                   )
                              );
                    }
               } else {
                    await db.insert(reading_sessions).values({
                         id: crypto.randomUUID(),
                         user_id,
                         date: today_str,
                         minutes_read: 1,
                         createdAt: new Date(),
                         updatedAt: new Date(),
                    });
               }
          } catch (e) {
               console.error('Failed to log reading session:', e);
          }

          // 2. If progress is 100%, update/insert bookshelf to 'Finished'
          if (progress_percentage === 100) {
               try {
                    const existingShelf = await db
                         .select()
                         .from(bookshelves)
                         .where(
                              and(
                                   eq(bookshelves.user_id, user_id),
                                   eq(bookshelves.book_id, book_id)
                              )
                         )
                         .limit(1);

                    if (existingShelf.length > 0) {
                         await db
                              .update(bookshelves)
                              .set({
                                   shelf_name: 'Finished',
                                   updatedAt: new Date(),
                              })
                              .where(eq(bookshelves.id, existingShelf[0].id));
                    } else {
                         await db.insert(bookshelves).values({
                              id: crypto.randomUUID(),
                              user_id,
                              book_id,
                              shelf_name: 'Finished',
                              createdAt: new Date(),
                              updatedAt: new Date(),
                         });
                    }
               } catch (e) {
                    console.error('Failed to update bookshelf to Finished:', e);
               }
          }

          return result;
     },
     async get_highlights(user_id: string, book_id: string) {
          const user_highlights = await db
               .select()
               .from(highlights)
               .where(
                    and(
                         eq(highlights.user_id, user_id),
                         eq(highlights.book_id, book_id)
                    )
               );
          return user_highlights;
     },

     async add_highlight(
          user_id: string,
          book_id: string,
          cfi_range: string,
          text: string,
          color: string,
          note?: string
     ) {
          const newHighlight = await db
               .insert(highlights)
               .values({
                    id: crypto.randomUUID(),
                    user_id,
                    book_id,
                    cfi_range,
                    text,
                    color,
                    note,
               })
               .returning();
          return newHighlight[0];
     },

     async remove_highlight(user_id: string, highlight_id: string) {
          const deleted = await db
               .delete(highlights)
               .where(
                    and(
                         eq(highlights.id, highlight_id),
                         eq(highlights.user_id, user_id)
                    )
               )
               .returning();
          return deleted;
     },

     async get_bookmarks(user_id: string, book_id: string) {
          const result = await db
               .select()
               .from(bookmarks)
               .where(
                    and(
                         eq(bookmarks.user_id, user_id),
                         eq(bookmarks.book_id, book_id)
                    )
               );
          return result;
     },

     async add_bookmark(
          user_id: string,
          book_id: string,
          cfi: string,
          label?: string
     ) {
          const newBookmark = await db
               .insert(bookmarks)
               .values({
                    id: crypto.randomUUID(),
                    user_id,
                    book_id,
                    cfi,
                    label,
               })
               .returning();
          return newBookmark[0];
     },

     async remove_bookmark(user_id: string, bookmark_id: string) {
          const deleted = await db
               .delete(bookmarks)
               .where(
                    and(
                         eq(bookmarks.id, bookmark_id),
                         eq(bookmarks.user_id, user_id)
                    )
               )
               .returning();
          return deleted;
     },
};
