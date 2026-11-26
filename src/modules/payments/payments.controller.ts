import { Request, Response } from 'express';
import { payments_service } from './payments.service';
import { verifyWebhookSignature } from '../../utils/payment_reconcile.job';
import { coupons_service } from './coupons.service';

export const payments_controller = {
     async create_order(req: Request, res: Response): Promise<any> {
          try {
               const { book_id, shippingAddress, billingAddress, couponCode } = req.body;
               const userId = req.user?.id;

               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const { order } = await payments_service.create_order(
                    userId,
                    book_id,
                    shippingAddress,
                    billingAddress,
                    couponCode
               );

               return res.status(200).json({
                    message: 'Order created successfully',
                    order,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to create order',
               });
          }
     },

     async create_cart_order(req: Request, res: Response): Promise<any> {
          try {
               const { book_ids, shippingAddress, billingAddress, couponCode } = req.body;
               const userId = req.user?.id;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!book_ids || !Array.isArray(book_ids) || book_ids.length === 0) {
                    return res
                         .status(400)
                         .json({ message: 'book_ids array is required' });
               }

               const { order } = await payments_service.create_cart_order(
                    userId,
                    book_ids,
                    shippingAddress,
                    billingAddress,
                    couponCode
               );

               return res.status(200).json({
                    message: 'Cart order created successfully',
                    order,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to create cart order',
               });
          }
     },

     async verify_payment(req: Request, res: Response): Promise<any> {
          try {
               const {
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature,
               } = req.body;

               if (
                    !razorpay_order_id ||
                    !razorpay_payment_id ||
                    !razorpay_signature
               ) {
                    return res
                         .status(400)
                         .json({ message: 'Missing payment details' });
               }

               await payments_service.verify_payment(
                    razorpay_order_id,
                    razorpay_payment_id,
                    razorpay_signature
               );

               return res.status(200).json({
                    message: 'Payment verified successfully',
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Payment verification failed',
               });
          }
     },

     async create_subscription_order(
          req: Request,
          res: Response
     ): Promise<any> {
          try {
               const { tier, shippingAddress, billingAddress } = req.body;
               const userId = req.user?.id;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               if (req.user?.role !== 'INSTITUTION_ADMIN') {
                    return res.status(403).json({
                         message: 'Access denied. Account is not an institution.',
                    });
               }

               if (!tier || typeof tier !== 'string') {
                    return res.status(400).json({
                         message: 'Valid tier string is required',
                    });
               }

               const { order } =
                    await payments_service.create_subscription_order(
                         userId,
                         tier,
                         shippingAddress,
                         billingAddress
                    );

               return res.status(200).json({
                    message: 'Subscription order created successfully',
                    order,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message:
                         error.message || 'Failed to create subscription order',
               });
          }
     },

     async get_payment_history(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const history = await payments_service.get_user_payment_history(userId);
               return res.status(200).json({
                    message: 'Payment history retrieved successfully',
                    history
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to retrieve payment history',
               });
          }
     },

     /**
      * Razorpay webhook. Fulfilment must not depend on the buyer's browser
      * reaching /verify, so this is the authoritative path: Razorpay calls it
      * server-to-server on payment.captured.
      *
      * Mounted with a raw body parser so the HMAC is computed over the exact
      * bytes Razorpay signed. Always answers 200 once the signature checks
      * out - Razorpay retries anything else, and fulfilment is idempotent.
      */
     async razorpay_webhook(req: Request, res: Response): Promise<any> {
          const signature = String(req.headers['x-razorpay-signature'] || '');
          const rawBody: Buffer | string = (req as any).body;

          if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
               console.error('[WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not set - rejecting.');
               return res.status(503).json({ message: 'Webhook not configured' });
          }

          if (!verifyWebhookSignature(rawBody, signature)) {
               console.warn('[WEBHOOK] Rejected a delivery with a bad signature.');
               return res.status(400).json({ message: 'Invalid signature' });
          }

          let event: any;
          try {
               event = JSON.parse(
                    typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
               );
          } catch {
               return res.status(400).json({ message: 'Malformed payload' });
          }

          // Acknowledge first; a slow fulfilment must not trigger retries.
          res.status(200).json({ received: true });

          try {
               if (event?.event !== 'payment.captured') return;

               const entity = event?.payload?.payment?.entity;
               const orderId = entity?.order_id;
               if (!orderId) return;

               await payments_service.fulfil_payment_by_order(orderId, {
                    razorpay_payment_id: entity?.id,
                    source: 'webhook',
               });
          } catch (err) {
               console.error('[WEBHOOK] Failed to fulfil a captured payment:', err);
          }
     },

     async download_invoice(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               const { paymentId } = req.params;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!paymentId || typeof paymentId !== 'string') {
                    return res.status(400).json({ message: 'paymentId is required' });
               }

               const signedUrl = await payments_service.get_invoice_download_url(paymentId, userId);
               return res.status(200).json({
                    url: signedUrl
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to retrieve invoice download link',
               });
          }
     },

     async validate_coupon(req: Request, res: Response): Promise<any> {
          try {
               const { code, amount } = req.query;
               const userId = req.user?.id;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!code || typeof code !== 'string') {
                    return res.status(400).json({ message: 'Coupon code is required' });
               }
               if (!amount || isNaN(Number(amount))) {
                    return res.status(400).json({ message: 'Valid amount is required' });
               }

               const result = await coupons_service.validate_coupon(
                    code,
                    userId,
                    Math.round(Number(amount))
               );

               return res.status(200).json({
                    message: 'Coupon is valid',
                    result,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to validate coupon',
               });
          }
     },
};
