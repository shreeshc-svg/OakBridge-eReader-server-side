import { Request, Response } from 'express';
import { payments_service } from './payments.service';
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
