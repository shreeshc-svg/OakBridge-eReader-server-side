import { db } from '../db/db';
import { userLogs } from '../db/schemas';

export async function logActivity(
     userId: string | null | undefined,
     userName: string | null | undefined,
     action: string,
     details?: any,
     ipAddress?: string
): Promise<void> {
     try {
          const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null;
          await db.insert(userLogs).values({
               userId: userId || null,
               userName: userName || null,
               action,
               details: detailsStr,
               ipAddress: ipAddress || null,
          });
     } catch (error) {
          console.error('Failed to write audit log:', error);
     }
}
