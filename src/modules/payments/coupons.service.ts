import { db } from '../../db/db';
import { coupons, user_coupons } from '../../db/schemas';
import { eq, and } from 'drizzle-orm';

export interface CouponValidationResult {
     couponId: string;
     code: string;
     discountAmount: number;
     finalAmount: number;
}

export const coupons_service = {
     /**
      * Validates a coupon code against a specific user and order amount.
      * @param code The coupon code string
      * @param userId The ID of the user trying to apply it
      * @param originalAmount The total amount in paise before discount
      */
     async validate_coupon(code: string, userId: string, originalAmount: number): Promise<CouponValidationResult> {
          if (!code || !userId) {
               throw new Error('Code and User ID are required');
          }

          const uppercaseCode = code.trim().toUpperCase();
          const rows = await db
               .select()
               .from(coupons)
               .where(eq(coupons.code, uppercaseCode))
               .limit(1);
          const coupon = rows[0];

          if (!coupon) {
               throw new Error('Invalid coupon code');
          }

          if (!coupon.is_active) {
               throw new Error('Coupon code is currently inactive');
          }

          if (coupon.expires_at && new Date() > coupon.expires_at) {
               throw new Error('Coupon code has expired');
          }

          if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
               throw new Error('Coupon usage limit has been reached');
          }

          if (coupon.min_order_amount && originalAmount < coupon.min_order_amount) {
               throw new Error(`Minimum order of ₹${(coupon.min_order_amount / 100).toFixed(2)} is required to use this coupon`);
          }

          // Check if this specific user has already redeemed the coupon
          const usedRows = await db
               .select()
               .from(user_coupons)
               .where(
                    and(
                         eq(user_coupons.user_id, userId),
                         eq(user_coupons.coupon_id, coupon.id)
                    )
               )
               .limit(1);

          if (usedRows.length > 0) {
               throw new Error('You have already used this coupon code');
          }

          // Calculate discount savings
          let discount = 0;
          if (coupon.discount_type === 'percentage') {
               discount = Math.round(originalAmount * (coupon.discount_value / 100));
               if (coupon.max_discount_amount && discount > coupon.max_discount_amount) {
                    discount = coupon.max_discount_amount;
               }
          } else if (coupon.discount_type === 'flat') {
               discount = coupon.discount_value;
          }

          // Ensure discount does not exceed the total price
          discount = Math.min(discount, originalAmount);

          return {
               couponId: coupon.id,
               code: coupon.code,
               discountAmount: discount,
               finalAmount: originalAmount - discount,
          };
     }
};
