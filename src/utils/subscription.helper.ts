import { db } from '../db/db';
import { users, institutions } from '../db/schemas';
import { eq } from 'drizzle-orm';

/**
 * Checks if a user belongs to an institution with an active subscription (GOLD/PLATINUM).
 */
export async function hasActiveInstitutionSubscription(
     userId: string
): Promise<boolean> {
     const [user] = await db
          .select({
               role: users.role,
               institution_id: users.institution_id,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

     if (!user || !user.institution_id) return false;

     if (
          user.role !== 'INSTITUTION_ADMIN' &&
          user.role !== 'INSTITUTION_MEMBER'
     ) {
          return false;
     }

     const [institution] = await db
          .select({
               tier: institutions.tier,
               subscription_expires_at: institutions.subscription_expires_at,
          })
          .from(institutions)
          .where(eq(institutions.id, user.institution_id))
          .limit(1);

     if (!institution) return false;

     const isTierValid =
          institution.tier === 'GOLD' || institution.tier === 'PLATINUM';
     const isNotExpired =
          !institution.subscription_expires_at ||
          new Date(institution.subscription_expires_at) > new Date();

     return isTierValid && isNotExpired;
}
