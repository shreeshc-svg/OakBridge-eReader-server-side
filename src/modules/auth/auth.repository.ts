import { eq, InferInsertModel } from 'drizzle-orm';
import { db } from '../../db/db';
import { users } from '../../db/schemas';

type NewUser = InferInsertModel<typeof users>;

export const auth_repository = {
     async create_user(data: NewUser) {
          const results = await db.insert(users).values(data).returning();
          return results[0];
     },

     async find_user_by_email(email: string) {
          const result = await db
               .select()
               .from(users)
               .where(eq(users.email, email))
               .limit(1);

          return result[0] || null;
     },

     async find_user_by_id(userId: string) {
          const result = await db
               .select()
               .from(users)
               .where(eq(users.id, userId))
               .limit(1);

          return result[0] || null;
     },

     async update_user(userId: string, data: Partial<NewUser>) {
          const results = await db
               .update(users)
               .set({ ...data, updatedAt: new Date() })
               .where(eq(users.id, userId))
               .returning();
          return results[0];
     },
};
