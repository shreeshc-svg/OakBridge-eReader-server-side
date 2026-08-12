import Razorpay from 'razorpay';
import { db } from '../../db/db';
import { payments, bookshelves, books, institutions, payment_items, cart_items, subscription_plans, users, coupons, user_coupons } from '../../db/schemas';
import crypto from 'crypto';
import { eq, inArray, and, sql } from 'drizzle-orm';
import { coupons_service } from './coupons.service';
import { invalidateRevenueCache } from '../superadmin/superadmin.service';
import { logActivity } from '../../utils/audit_logger';
import { sendPurchaseInvoiceMail } from '../../utils/mail.service';
import { generateInvoicePDF } from '../../utils/pdf.service';
import { upload_buffer_to_s3 } from '../../utils/s3';

const razorpay = new Razorpay({
     key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key',
     key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

export const payments_service = {
     async create_order(userId: string, bookId: string, shippingAddress?: string, billingAddress?: string, couponCode?: string) {
          // Fetch book price
          const bookRows = await db
               .select()
               .from(books)
               .where(eq(books.id, bookId))
               .limit(1);
          const book = bookRows[0];

          if (!book) {
               throw new Error('Book not found');
          }

          if (!book.price || book.price <= 0) {
               throw new Error('Book is free, no payment required');
          }

          let discountAmount = 0;
          let finalAmount = book.price;
          let couponId: string | null = null;

          if (couponCode) {
               const couponResult = await coupons_service.validate_coupon(couponCode, userId, book.price);
               discountAmount = couponResult.discountAmount;
               finalAmount = couponResult.finalAmount;
               couponId = couponResult.couponId;
          }

          const options = {
               amount: finalAmount, // Amount in paise
               currency: 'INR',
               receipt: `receipt_order_${Date.now()}`,
          };

          const order = await razorpay.orders.create(options);

          // Save order in database
          const paymentId = crypto.randomUUID();
          const createdPayment = await db
               .insert(payments)
               .values({
                    id: paymentId,
                    user_id: userId,
                    book_id: bookId,
                    razorpay_order_id: order.id,
                    original_amount: book.price,
                    discount_amount: discountAmount,
                    coupon_id: couponId,
                    amount: finalAmount,
                    shippingAddress: shippingAddress || null,
                    billingAddress: billingAddress || null,
                    status: 'created',
                    createdAt: new Date(),
                    updatedAt: new Date(),
               })
               .returning();

          return { order, payment: createdPayment[0] };
     },

     async create_cart_order(
          userId: string,
          bookIds: string[],
          shippingAddress?: string,
          billingAddress?: string,
          couponCode?: string
     ) {
          if (!bookIds || bookIds.length === 0) {
               throw new Error('No books provided for cart order');
          }

          // Fetch all books and their prices
          const bookRows = await db
               .select()
               .from(books)
               .where(inArray(books.id, bookIds));

          if (bookRows.length === 0) {
               throw new Error('No valid books found');
          }

          if (bookRows.length !== bookIds.length) {
               throw new Error('Some books were not found');
          }

          // Calculate total amount
          const totalAmount = bookRows.reduce((sum, book) => {
               if (!book.price || book.price <= 0) {
                    throw new Error(`Book "${book.title}" is free and cannot be added to a paid cart order`);
               }
               return sum + book.price;
          }, 0);

          let discountAmount = 0;
          let finalAmount = totalAmount;
          let couponId: string | null = null;

          if (couponCode) {
               const couponResult = await coupons_service.validate_coupon(couponCode, userId, totalAmount);
               discountAmount = couponResult.discountAmount;
               finalAmount = couponResult.finalAmount;
               couponId = couponResult.couponId;
          }

          const options = {
               amount: finalAmount, // Amount in paise
               currency: 'INR',
               receipt: `receipt_cart_${Date.now()}`,
          };

          const order = await razorpay.orders.create(options);

          // Save order in database (book_id is null for cart orders)
          const paymentId = crypto.randomUUID();
          const createdPayment = await db
               .insert(payments)
               .values({
                    id: paymentId,
                    user_id: userId,
                    book_id: null,
                    razorpay_order_id: order.id,
                    original_amount: totalAmount,
                    discount_amount: discountAmount,
                    coupon_id: couponId,
                    amount: finalAmount,
                    shippingAddress: shippingAddress || null,
                    billingAddress: billingAddress || null,
                    status: 'created',
                    createdAt: new Date(),
                    updatedAt: new Date(),
               })
               .returning();

          // Insert payment_items for each book
          const paymentItemsData = bookRows.map((book) => ({
               id: crypto.randomUUID(),
               payment_id: paymentId,
               book_id: book.id,
               price: book.price,
          }));

          await db.insert(payment_items).values(paymentItemsData);

          return { order, payment: createdPayment[0] };
     },

     async create_subscription_order(
          userId: string,
          tier: string,
          shippingAddress?: string,
          billingAddress?: string
     ) {
          const plans = await db
               .select()
               .from(subscription_plans)
               .where(eq(subscription_plans.tier, tier.toUpperCase()))
               .limit(1);

          if (plans.length === 0) {
               throw new Error(`Subscription plan not found for tier: ${tier}`);
          }
          const amount = plans[0].price;

          const options = {
               amount, // Amount in paise
               currency: 'INR',
               receipt: `receipt_sub_${Date.now()}`,
          };

          const order = await razorpay.orders.create(options);

          // Save order in database
          const paymentId = crypto.randomUUID();
          const createdPayment = await db
               .insert(payments)
               .values({
                    id: paymentId,
                    user_id: userId,
                    tier,
                    razorpay_order_id: order.id,
                    amount,
                    shippingAddress: shippingAddress || null,
                    billingAddress: billingAddress || null,
                    status: 'created',
                    createdAt: new Date(),
                    updatedAt: new Date(),
               })
               .returning();

          return { order, payment: createdPayment[0] };
     },

     async verify_payment(
          razorpay_order_id: string,
          razorpay_payment_id: string,
          razorpay_signature: string
     ) {
          const body = razorpay_order_id + '|' + razorpay_payment_id;

          const expectedSignature = crypto
               .createHmac(
                    'sha256',
                    process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
               )
               .update(body.toString())
               .digest('hex');

          if (expectedSignature !== razorpay_signature) {
               throw new Error('Invalid signature');
          }

          // Signature is valid, update payment status
          const paymentRows = await db
               .select()
               .from(payments)
               .where(eq(payments.razorpay_order_id, razorpay_order_id))
               .limit(1);
          const payment = paymentRows[0];

          if (!payment) {
               throw new Error('Payment record not found');
          }

          await db
               .update(payments)
               .set({
                    razorpay_payment_id,
                    razorpay_signature,
                    status: 'completed',
                    updatedAt: new Date(),
               })
               .where(eq(payments.id, payment.id));

          // Record coupon usage if a coupon was used
          if (payment.coupon_id) {
               try {
                    // 1. Increment coupon used count
                    await db.execute(sql`
                         UPDATE coupons 
                         SET used_count = used_count + 1 
                         WHERE id = ${payment.coupon_id}
                    `);
                    
                    // 2. Add to user_coupons to prevent reuse
                    await db.insert(user_coupons).values({
                         id: crypto.randomUUID(),
                         user_id: payment.user_id,
                         coupon_id: payment.coupon_id,
                         used_at: new Date()
                    });
               } catch (couponUseError) {
                    console.error('Failed to record coupon usage:', couponUseError);
               }
          }

          // Generate & upload invoice PDF to S3
          try {
               const userRows = await db
                    .select()
                    .from(users)
                    .where(eq(users.id, payment.user_id))
                    .limit(1);
               const user = userRows[0];

               if (user && user.email) {
                    let invoiceItems: { title: string; author?: string; isbn?: string; price: number }[] = [];

                    if (payment.book_id) {
                         const bookRows = await db
                              .select()
                              .from(books)
                              .where(eq(books.id, payment.book_id))
                              .limit(1);
                         if (bookRows[0]) {
                              invoiceItems.push({
                                   title: bookRows[0].title,
                                   author: bookRows[0].author,
                                   isbn: bookRows[0].isbn,
                                   price: payment.amount || 0,
                              });
                         }
                    } else if (!payment.tier) {
                         const items = await db
                              .select({
                                   title: books.title,
                                   author: books.author,
                                   isbn: books.isbn,
                                   price: payment_items.price,
                              })
                              .from(payment_items)
                              .innerJoin(books, eq(payment_items.book_id, books.id))
                              .where(eq(payment_items.payment_id, payment.id));
                         
                         invoiceItems = items.map((item) => ({
                              title: item.title,
                              author: item.author,
                              isbn: item.isbn,
                              price: item.price || 0,
                         }));
                    }

                    const formattedDate = new Date().toLocaleDateString('en-GB', {
                         day: '2-digit',
                         month: 'short',
                         year: 'numeric',
                    });

                    // Generate the PDF invoice in memory
                    const pdfBuffer = await generateInvoicePDF({
                         invoiceNo: `OAK-2026-27-${payment.id.substring(0, 4).toUpperCase()}`,
                         date: formattedDate,
                         orderNo: razorpay_order_id,
                         paymentRef: payment.id,
                         buyerName: user.username || 'Reader',
                         shippingAddress: payment.shippingAddress || undefined,
                         billingAddress: payment.billingAddress || undefined,
                         items: invoiceItems,
                         totalAmount: payment.amount || 0,
                         tier: payment.tier || undefined
                    });

                    const invoiceKey = `invoices/INV-${payment.id}.pdf`;
                    await upload_buffer_to_s3(pdfBuffer, invoiceKey);

                    await db
                         .update(payments)
                         .set({
                              invoice_key: invoiceKey,
                              updatedAt: new Date()
                         })
                         .where(eq(payments.id, payment.id));
               }
          } catch (invoiceError) {
               console.error('Failed to generate and upload invoice to S3:', invoiceError);
          }

          // Invalidate Redis Analytics cache
          await invalidateRevenueCache();

          // Log transaction activity
          await logActivity(
               payment.user_id,
               null,
               'PURCHASE',
               {
                    paymentId: payment.id,
                    bookId: payment.book_id || null,
                    tier: payment.tier || null,
                    amount: payment.amount,
               }
          );

          if (payment.tier) {
               // Subscription purchase
               await this.subscribe_institution(
                    payment.user_id,
                    payment.tier as 'GOLD' | 'PLATINUM'
               );
          } else if (payment.book_id) {
               // Single book purchase - add to library
                const existing = await db
                     .select()
                     .from(bookshelves)
                     .where(
                          and(
                               eq(bookshelves.user_id, payment.user_id),
                               eq(bookshelves.book_id, payment.book_id)
                          )
                     )
                     .limit(1);

                if (existing.length === 0) {
                     await db.insert(bookshelves).values({
                          id: crypto.randomUUID(),
                          user_id: payment.user_id,
                          book_id: payment.book_id,
                          shelf_name: 'Purchased',
                          added_at: new Date(),
                          createdAt: new Date(),
                          updatedAt: new Date(),
                     });
                } else {
                     // Check if expired, if so reset added_at
                     const [book] = await db
                          .select({ access_period_days: books.access_period_days })
                          .from(books)
                          .where(eq(books.id, payment.book_id))
                          .limit(1);
                     if (book && book.access_period_days && book.access_period_days > 0) {
                          const addedAt = new Date(existing[0].added_at);
                          const expirationDate = new Date(addedAt.getTime() + book.access_period_days * 24 * 60 * 60 * 1000);
                          if (new Date() > expirationDate) {
                               await db
                                    .update(bookshelves)
                                    .set({ added_at: new Date(), updatedAt: new Date() })
                                    .where(eq(bookshelves.id, existing[0].id));
                          }
                     }
                }
          } else {
               // Cart purchase - add all books from payment_items to library
               const items = await db
                    .select()
                    .from(payment_items)
                    .where(eq(payment_items.payment_id, payment.id));

               for (const item of items) {
                    // Check if book is already in library to avoid duplicates
                    const existing = await db
                         .select()
                         .from(bookshelves)
                         .where(
                              and(
                                   eq(bookshelves.user_id, payment.user_id),
                                   eq(bookshelves.book_id, item.book_id)
                              )
                         )
                         .limit(1);

                    if (existing.length === 0) {
                         await db.insert(bookshelves).values({
                              id: crypto.randomUUID(),
                              user_id: payment.user_id,
                              book_id: item.book_id,
                              shelf_name: 'Purchased',
                              added_at: new Date(),
                              createdAt: new Date(),
                              updatedAt: new Date(),
                         });
                    } else {
                         // Check if expired, if so reset added_at
                         const [book] = await db
                              .select({ access_period_days: books.access_period_days })
                              .from(books)
                              .where(eq(books.id, item.book_id))
                              .limit(1);
                         if (book && book.access_period_days && book.access_period_days > 0) {
                              const addedAt = new Date(existing[0].added_at);
                              const expirationDate = new Date(addedAt.getTime() + book.access_period_days * 24 * 60 * 60 * 1000);
                              if (new Date() > expirationDate) {
                                   await db
                                        .update(bookshelves)
                                        .set({ added_at: new Date(), updatedAt: new Date() })
                                        .where(eq(bookshelves.id, existing[0].id));
                              }
                         }
                    }
               }

               // Clear user's active cart after successful purchase
               await db
                    .delete(cart_items)
                    .where(
                         and(
                              eq(cart_items.user_id, payment.user_id),
                              eq(cart_items.status, 'active')
                         )
                    );
          }

          // Trigger email confirmation asynchronously so it doesn't block the API response
          try {
               const userRows = await db
                    .select()
                    .from(users)
                    .where(eq(users.id, payment.user_id))
                    .limit(1);
               const user = userRows[0];

               if (user && user.email) {
                    let emailItems: { title: string; author?: string; isbn?: string; price: number }[] = [];

                    if (payment.book_id) {
                         const bookRows = await db
                              .select()
                              .from(books)
                              .where(eq(books.id, payment.book_id))
                              .limit(1);
                         if (bookRows[0]) {
                              emailItems.push({
                                   title: bookRows[0].title,
                                   author: bookRows[0].author,
                                   isbn: bookRows[0].isbn,
                                   price: payment.amount || 0,
                              });
                         }
                    } else if (!payment.tier) {
                         const items = await db
                              .select({
                                   title: books.title,
                                   author: books.author,
                                   isbn: books.isbn,
                                   price: payment_items.price,
                              })
                              .from(payment_items)
                              .innerJoin(books, eq(payment_items.book_id, books.id))
                              .where(eq(payment_items.payment_id, payment.id));
                         
                         emailItems = items.map((item) => ({
                              title: item.title,
                              author: item.author,
                              isbn: item.isbn,
                              price: item.price || 0,
                         }));
                    }

                    sendPurchaseInvoiceMail(
                         user.email,
                         user.username || 'Reader',
                         payment.razorpay_order_id || 'N/A',
                         payment.razorpay_payment_id || 'N/A',
                         new Date().toISOString(),
                         payment.amount || 0,
                         emailItems,
                         payment.tier || undefined,
                         payment.shippingAddress || undefined,
                         payment.billingAddress || undefined
                    ).catch((mailErr) => {
                         console.error('SMTP: Failed to send purchase confirmation email:', mailErr);
                    });
               }
          } catch (emailTriggerError) {
               console.error('Failed to trigger purchase confirmation email:', emailTriggerError);
          }

          return payment;
     },

     async subscribe_institution(userId: string, tier: string) {
          const instRows = await db
               .select()
               .from(institutions)
               .where(eq(institutions.admin_id, userId))
               .limit(1);

          const inst = instRows[0];
          if (!inst) {
               throw new Error(
                    'No institution found associated with this account'
               );
          }

          // Fetch the plan duration in months
          const planRows = await db
               .select({ durationMonths: subscription_plans.durationMonths })
               .from(subscription_plans)
               .where(eq(subscription_plans.tier, tier))
               .limit(1);

          const durationMonths = planRows[0]?.durationMonths ?? 12;
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

          const updated = await db
               .update(institutions)
               .set({
                    tier,
                    subscription_expires_at: expiryDate,
                    updatedAt: new Date(),
               })
               .where(eq(institutions.id, inst.id))
               .returning();

          return updated[0];
     },

     async get_user_payment_history(userId: string) {
          const rows = await db
               .select({
                    id: payments.id,
                    amount: payments.amount,
                    status: payments.status,
                    tier: payments.tier,
                    book_id: payments.book_id,
                    createdAt: payments.createdAt,
                    invoice_key: payments.invoice_key,
                    razorpay_order_id: payments.razorpay_order_id,
                    razorpay_payment_id: payments.razorpay_payment_id
               })
               .from(payments)
               .where(and(eq(payments.user_id, userId), eq(payments.status, 'completed')));

          const results = [];
          for (const payment of rows) {
               let items: { title: string; author?: string }[] = [];
               if (payment.book_id) {
                    const bookRows = await db
                         .select({ title: books.title, author: books.author })
                         .from(books)
                         .where(eq(books.id, payment.book_id))
                         .limit(1);
                    if (bookRows[0]) {
                         items.push(bookRows[0]);
                    }
               } else if (!payment.tier) {
                    const dbItems = await db
                         .select({
                              title: books.title,
                              author: books.author,
                         })
                         .from(payment_items)
                         .innerJoin(books, eq(payment_items.book_id, books.id))
                         .where(eq(payment_items.payment_id, payment.id));
                    items = dbItems;
               } else {
                    items = [{ title: `${payment.tier} Subscription Plan` }];
               }

               results.push({
                    ...payment,
                    items
               });
          }

          return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
     },

     async get_invoice_download_url(paymentId: string, userId: string) {
          const paymentRows = await db
               .select()
               .from(payments)
               .where(eq(payments.id, paymentId))
               .limit(1);
          const payment = paymentRows[0];

          if (!payment) {
               throw new Error('Payment record not found');
          }

          if (payment.user_id !== userId) {
               throw new Error('Unauthorized');
          }

          if (!payment.invoice_key) {
               throw new Error('Invoice PDF not available for this transaction');
          }

          const { get_presigned_url } = await import('../../utils/s3');
          const signedUrl = await get_presigned_url(payment.invoice_key);
          return signedUrl;
     },
};
