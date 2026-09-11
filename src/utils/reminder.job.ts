import cron from 'node-cron';
import { db } from '../db/db';
import { bookshelves, reading_progress, users, books } from '../db/schemas';
import { eq, and, or, lt, isNull } from 'drizzle-orm';
import { sendInactivityReminderMail } from './mail.service';
import { EMAIL_SETTING_KEYS, isEmailSettingEnabled } from './email_settings';

export const initReminderJob = () => {
     // Run daily at 9:00 AM (0 9 * * *)
     cron.schedule('0 9 * * *', async () => {
          console.log(
               '[JOBS] Running daily virtual bookshelf inactivity reminder job...'
          );
          try {
               if (!(await isEmailSettingEnabled(EMAIL_SETTING_KEYS.inactivity_reminders))) {
                    console.log('[JOBS] Inactivity reminder emails are switched off by admin. Skipping.');
                    return;
               }

               const sixMonthsAgo = new Date();
               sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

               const idleEntries = await db
                    .select({
                         userId: users.id,
                         userEmail: users.email,
                         username: users.username,
                         bookTitle: books.title,
                         lastReadAt: reading_progress.last_read_at,
                         addedAt: bookshelves.added_at,
                    })
                    .from(bookshelves)
                    .innerJoin(users, eq(bookshelves.user_id, users.id))
                    .innerJoin(books, eq(bookshelves.book_id, books.id))
                    .leftJoin(
                         reading_progress,
                         and(
                              eq(reading_progress.user_id, bookshelves.user_id),
                              eq(reading_progress.book_id, bookshelves.book_id)
                         )
                    )
                    .where(
                         and(
                         // Skip users who unsubscribed from marketing emails
                         eq(users.marketing_emails, true),
                         or(
                              // Case 1: user started reading, but stopped for 6+ months
                              lt(reading_progress.last_read_at, sixMonthsAgo),
                              // Case 2: user never started reading, and book was added 6+ months ago
                              and(
                                   isNull(reading_progress.id),
                                   lt(bookshelves.added_at, sixMonthsAgo)
                              )
                         )
                         )
                    );

               console.log(
                    `[JOBS] Found ${idleEntries.length} inactive bookshelf items.`
               );

               for (const entry of idleEntries) {
                    try {
                         await sendInactivityReminderMail(
                              entry.userEmail,
                              entry.username,
                              entry.bookTitle,
                              entry.userId
                         );
                         console.log(
                              `[JOBS] Sent inactivity reminder to ${entry.userEmail} for "${entry.bookTitle}"`
                         );
                    } catch (mailError) {
                         console.error(
                              `[JOBS] Failed to send reminder email to ${entry.userEmail}:`,
                              mailError
                         );
                    }
               }
          } catch (jobError) {
               console.error(
                    '[JOBS] Inactivity reminder job encountered an error:',
                    jobError
               );
          }
     });

     console.log(
          '[JOBS] Bookshelf inactivity reminder job successfully registered.'
     );
};
