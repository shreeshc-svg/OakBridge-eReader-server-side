import cron from 'node-cron';
import { db } from '../db/db';
import { cart_items, books, users } from '../db/schemas';
import { eq, and, lt } from 'drizzle-orm';
import { notifications_repository } from '../modules/notifications/notifications.repository';
import { sendAbandonedCartMail } from './mail.service';
import { EMAIL_SETTING_KEYS, isEmailSettingEnabled } from './email_settings';
import crypto from 'crypto';

export const checkAndNotifyAbandonedCarts = async (bypassTimeCheck: boolean = false) => {
     console.log('[JOBS] Checking for abandoned carts...');
     try {
          const now = new Date();
          // In-app notifications are always created; the email is optional.
          const emailsEnabled = await isEmailSettingEnabled(EMAIL_SETTING_KEYS.cart_reminders);

          // Calculate time thresholds
          const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

          // We run three separate checks for each escalation tier
          const tiers = [
               {
                    name: '12h' as const,
                    threshold: twelveHoursAgo,
                    fieldColumn: cart_items.abandonedNotified12h,
                    titleText: 'Items waiting in your cart 🛒',
               },
               {
                    name: '1w' as const,
                    threshold: oneWeekAgo,
                    fieldColumn: cart_items.abandonedNotified1w,
                    titleText: 'Don’t let this one slip away ⏳',
               },
               {
                    name: '1m' as const,
                    threshold: oneMonthAgo,
                    fieldColumn: cart_items.abandonedNotified1m,
                    titleText: 'Last call for your cart ⚠️',
               }
          ];

          let totalProcessed = 0;

          for (const tier of tiers) {
               const conditions = [
                    eq(cart_items.status, 'active'),
                    eq(tier.fieldColumn, false)
               ];

               if (!bypassTimeCheck) {
                    conditions.push(lt(cart_items.createdAt, tier.threshold));
               }

               const items = await db
                    .select({
                         cartItemId: cart_items.id,
                         userId: cart_items.user_id,
                         bookTitle: books.title,
                         bookPrice: books.price,
                         userEmail: users.email,
                         username: users.username,
                         marketingEmails: users.marketing_emails,
                    })
                    .from(cart_items)
                    .innerJoin(books, eq(cart_items.book_id, books.id))
                    .innerJoin(users, eq(cart_items.user_id, users.id))
                    .where(and(...conditions));

               if (items.length === 0) {
                    console.log(`[JOBS] No new abandoned carts found for tier: ${tier.name}`);
                    continue;
               }

               // Group items by user so they get one consolidated notification per tier
               const userCartMap = new Map<string, { 
                    books: { title: string; price: number }[], 
                    itemIds: string[], 
                    email: string, 
                    username: string,
                    marketingEmails: boolean
               }>();

               for (const item of items) {
                    if (!userCartMap.has(item.userId)) {
                         userCartMap.set(item.userId, { 
                              books: [], 
                              itemIds: [], 
                              email: item.userEmail || '', 
                              username: item.username || '',
                              marketingEmails: item.marketingEmails
                         });
                    }
                    const userCart = userCartMap.get(item.userId)!;
                    userCart.books.push({ title: item.bookTitle, price: item.bookPrice });
                    userCart.itemIds.push(item.cartItemId);
               }

               console.log(`[JOBS] Found ${userCartMap.size} users for tier: ${tier.name}`);

               for (const [userId, details] of userCartMap.entries()) {
                    try {
                         const bookNames = details.books.map(b => b.title);
                         const booksListStr = bookNames.length > 2 
                              ? `"${bookNames[0]}", "${bookNames[1]}" and ${bookNames.length - 2} other book(s)`
                              : bookNames.map(b => `"${b}"`).join(', ');

                         // Create standard in-app notification
                         await notifications_repository.create_notifications([{
                              id: crypto.randomUUID(),
                              userId: userId,
                              title: tier.titleText,
                              message: `You left ${booksListStr} in your cart. Complete your purchase now so you don't miss out!`,
                         }]);

                         // Send email notification (admin switch + user's unsubscribe choice)
                         if (details.email && emailsEnabled && details.marketingEmails) {
                              await sendAbandonedCartMail(details.email, details.username, details.books, tier.name, userId);
                         }

                         // Mark these cart items as notified for this tier
                         for (const itemId of details.itemIds) {
                              const updateObj: any = { abandonedNotified: true };
                              if (tier.name === '12h') {
                                   updateObj.abandonedNotified12h = true;
                              } else if (tier.name === '1w') {
                                   updateObj.abandonedNotified1w = true;
                              } else if (tier.name === '1m') {
                                   updateObj.abandonedNotified1m = true;
                              }

                              await db
                                   .update(cart_items)
                                   .set(updateObj)
                                   .where(eq(cart_items.id, itemId));
                         }
                    } catch (userError) {
                         console.error(`[JOBS] Failed to process abandoned cart notification for user ${userId} in tier ${tier.name}:`, userError);
                    }
               }

               totalProcessed += userCartMap.size;
          }

          console.log(`[JOBS] Completed processing abandoned carts. Total users processed: ${totalProcessed}`);
          return { message: 'Abandoned carts processed', count: totalProcessed };
     } catch (jobError) {
          console.error('[JOBS] Abandoned cart reminder job encountered an error:', jobError);
          throw jobError;
     }
};

export const initCartReminderJob = () => {
     // Run daily at 10:00 AM (0 10 * * *)
     cron.schedule('0 10 * * *', async () => {
          await checkAndNotifyAbandonedCarts();
     });

     console.log('[JOBS] Abandoned cart reminder job successfully registered.');
};
