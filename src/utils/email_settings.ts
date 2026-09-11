import { settings_service } from '../modules/settings/settings.service';

/** Settings keys for the automatic emails an admin can switch on/off. */
export const EMAIL_SETTING_KEYS = {
     inactivity_reminders: 'email_inactivity_reminders_enabled',
     cart_reminders: 'email_cart_reminders_enabled',
} as const;

export type EmailSettingKey =
     (typeof EMAIL_SETTING_KEYS)[keyof typeof EMAIL_SETTING_KEYS];

/** Automatic emails stay ON unless an admin has switched them off. */
export const isEmailSettingEnabled = async (key: EmailSettingKey): Promise<boolean> => {
     const setting = await settings_service.get_setting(key, 'true');
     return setting.value === 'true';
};
