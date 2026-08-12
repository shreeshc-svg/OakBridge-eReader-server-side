import { eq, and, count } from 'drizzle-orm';
import { db } from '../../db/db';
import { users, institutions } from '../../db/schemas';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export const institution_service = {
     async get_members(institutionId: string) {
          const members = await db
               .select({
                    id: users.id,
                    username: users.username,
                    email: users.email,
                    role: users.role,
                    createdAt: users.createdAt,
               })
               .from(users)
               .where(
                    and(
                         eq(users.institution_id, institutionId),
                         eq(users.role, 'INSTITUTION_MEMBER')
                    )
               );
          return members;
     },

     async add_member(
          institutionId: string,
          data: { username: string; email: string; password?: string }
     ) {
          const { username, email, password } = data;

          // 1. Fetch institution details to verify tier
          const [institution] = await db
               .select()
               .from(institutions)
               .where(eq(institutions.id, institutionId))
               .limit(1);

          if (!institution) {
               throw new Error('Institution not found');
          }

          if (institution.tier === 'NONE') {
               throw new Error(
                    'An active Gold or Platinum subscription is required to add members.'
               );
          }

          // Check if subscription has expired
          if (
               institution.subscription_expires_at &&
               new Date() > new Date(institution.subscription_expires_at)
          ) {
               throw new Error(
                    'Your institutional subscription has expired. Please renew to add members.'
               );
          }

          // 2. Count current active members in the institution
          const [memberCountResult] = await db
               .select({ count: count() })
               .from(users)
               .where(
                    and(
                         eq(users.institution_id, institutionId),
                         eq(users.role, 'INSTITUTION_MEMBER')
                    )
               );

          const currentCount = memberCountResult?.count || 0;
          const limit = institution.tier === 'GOLD' ? 3 : 5;

          if (currentCount >= limit) {
               throw new Error(
                    `Limit reached. Your ${institution.tier} Tier subscription allows a maximum of ${limit} members.`
               );
          }

          // 3. Check if user already exists
          const [existingUser] = await db
               .select()
               .from(users)
               .where(eq(users.email, email))
               .limit(1);

          if (existingUser) {
               throw new Error('Email is already registered');
          }

          // 4. Hash password and insert user
          const memberPassword =
               password || crypto.randomBytes(8).toString('hex');
          const hashedPassword = await bcrypt.hash(memberPassword, 10);

          const [createdMember] = await db
               .insert(users)
               .values({
                    id: crypto.randomUUID(),
                    username,
                    email,
                    password: hashedPassword,
                    role: 'INSTITUTION_MEMBER',
                    institution_id: institutionId,
               })
               .returning();

          const { password: _, ...memberWithoutPassword } = createdMember;
          return memberWithoutPassword;
     },

     async remove_member(institutionId: string, memberId: string) {
          // Verify user belongs to the institution
          const [member] = await db
               .select()
               .from(users)
               .where(
                    and(
                         eq(users.id, memberId),
                         eq(users.institution_id, institutionId)
                    )
               )
               .limit(1);

          if (!member) {
               throw new Error('Member not found in this institution');
          }

          await db.delete(users).where(eq(users.id, memberId));

          return { message: 'Member removed successfully' };
     },
};
