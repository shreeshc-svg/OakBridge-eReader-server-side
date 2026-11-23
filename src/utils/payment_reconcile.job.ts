import crypto from 'crypto';
import { and, gt, lt, ne } from 'drizzle-orm';
import cron from 'node-cron';
import Razorpay from 'razorpay';
import { db } from '../db/db';
import { payments } from '../db/schemas';
import { payments_service } from '../modules/payments/payments.service';

/**
 * Safety net for payments Razorpay captured but we never recorded.
 *
 * The browser's verify call and the webhook both fulfil a payment, but a
 * closed tab plus a missed webhook would still lose an order. Every 15
 * minutes this asks Razorpay about each order we have sitting unfinished and
 * fulfils the ones that were actually paid.
 */

const STUCK_AFTER_MINUTES = 10;
const MAX_AGE_DAYS = 7;

// Built on demand, never at import time: the SDK throws when the keys are
// absent, and that would stop the whole server from booting.
let razorpayClient: Razorpay | null = null;

const getRazorpay = (): Razorpay | null => {
     if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
          return null;
     }
     if (!razorpayClient) {
          razorpayClient = new Razorpay({
               key_id: process.env.RAZORPAY_KEY_ID,
               key_secret: process.env.RAZORPAY_KEY_SECRET,
          });
     }
     return razorpayClient;
};

/** Verify a Razorpay webhook body against the configured webhook secret. */
export const verifyWebhookSignature = (
     rawBody: Buffer | string,
     signature: string
): boolean => {
     const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
     if (!secret || !signature) return false;

     const expected = crypto
          .createHmac('sha256', secret)
          .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
          .digest('hex');

     const a = Buffer.from(expected);
     const b = Buffer.from(signature);
     return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const reconcilePendingPayments = async (): Promise<{
     checked: number;
     repaired: number;
}> => {
     const razorpay = getRazorpay();
     if (!razorpay) {
          console.warn('[RECONCILE] Razorpay keys missing - skipping run.');
          return { checked: 0, repaired: 0 };
     }

     const stuckBefore = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);
     const oldestToCheck = new Date(
          Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000
     );

     const pending = await db
          .select({
               id: payments.id,
               razorpay_order_id: payments.razorpay_order_id,
          })
          .from(payments)
          .where(
               and(
                    ne(payments.status, 'completed'),
                    lt(payments.createdAt, stuckBefore),
                    gt(payments.createdAt, oldestToCheck)
               )
          );

     const candidates = pending.filter((p) => !!p.razorpay_order_id);
     let repaired = 0;

     for (const row of candidates) {
          try {
               const rzpPayments: any = await razorpay.orders.fetchPayments(
                    row.razorpay_order_id
               );
               const captured = (rzpPayments?.items || []).find(
                    (item: any) => item.status === 'captured'
               );

               if (!captured) continue;

               console.warn(
                    `[RECONCILE] Payment captured at Razorpay but not fulfilled here: ` +
                         `payment ${row.id}, order ${row.razorpay_order_id}. Fulfilling now.`
               );

               await payments_service.fulfil_payment(row.id, {
                    razorpay_payment_id: captured.id,
                    source: 'reconcile',
               });
               repaired += 1;
          } catch (err) {
               console.error(
                    `[RECONCILE] Could not check order ${row.razorpay_order_id}:`,
                    err
               );
          }
     }

     if (repaired > 0) {
          console.warn(
               `[RECONCILE] Repaired ${repaired} unfulfilled payment(s) out of ${candidates.length} checked.`
          );
     }

     return { checked: candidates.length, repaired };
};

export const initPaymentReconcileJob = (): void => {
     // Every 15 minutes. Older rows than MAX_AGE_DAYS are left alone.
     cron.schedule('*/15 * * * *', async () => {
          try {
               await reconcilePendingPayments();
          } catch (err) {
               console.error('[RECONCILE] Job run failed:', err);
          }
     });

     console.log('[JOBS] Payment reconciliation job successfully registered.');
};
