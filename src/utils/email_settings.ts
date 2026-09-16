import { eq } from 'drizzle-orm';
import { db } from '../db/db';
import { users } from '../db/schemas';
import { settings_service } from '../modules/settings/settings.service';

/** Settings keys for the automatic emails an admin can switch on/off. */
export const EMAIL_SETTING_KEYS = {
     inactivity_reminders: 'email_inactivity_reminders_enabled',
     cart_reminders: 'email_cart_reminders_enabled',
     // "New book added" alerts fired by a book upload - covers both the in-app
     // notification and any new-book email.
     new_book_notifications: 'new_book_notifications_enabled',
} as const;

export type EmailSettingKey =
     (typeof EMAIL_SETTING_KEYS)[keyof typeof EMAIL_SETTING_KEYS];

/** Automatic emails stay ON unless an admin has switched them off. */
export const isEmailSettingEnabled = async (key: EmailSettingKey): Promise<boolean> => {
     const setting = await settings_service.get_setting(key, 'true');
     return setting.value === 'true';
};

/**
 * Whether a "new book added" alert may go to this user — the superadmin's
 * global switch AND the reader's own profile setting must both allow it.
 * Every new-book alert (in-app or email) has to pass through here.
 */
export const canSendNewBookAlert = async (user_id: string): Promise<boolean> => {
     const enabled = await isEmailSettingEnabled(
          EMAIL_SETTING_KEYS.new_book_notifications
     );
     if (!enabled) return false;

     const [user] = await db
          .select({ book_notifications: users.book_notifications })
          .from(users)
          .where(eq(users.id, user_id))
          .limit(1);

     return !!user?.book_notifications;
};
