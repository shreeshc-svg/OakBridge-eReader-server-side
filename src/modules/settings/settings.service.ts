import { settings_repository } from './settings.repository';

export const settings_service = {
     async get_setting(key: string, defaultValue: string) {
          const setting = await settings_repository.get_setting(key);
          if (!setting) {
               return { key, value: defaultValue };
          }
          return setting;
     },

     async update_setting(key: string, value: string) {
          return await settings_repository.upsert_setting(key, value);
     },
};
