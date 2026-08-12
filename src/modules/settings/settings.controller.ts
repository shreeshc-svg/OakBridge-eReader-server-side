import { Request, Response } from 'express';
import { settings_service } from './settings.service';

export const settings_controller = {
     async get_setting(req: Request, res: Response) {
          try {
               const key = req.params.key;
               if (!key) {
                    return res.status(400).json({ message: 'Key is required' });
               }

               const defaultValue =
                    key === 'disable_right_click' ? 'true' : 'false';
               const setting = await settings_service.get_setting(
                    key as string,
                    defaultValue
               );
               return res.status(200).json(setting);
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to retrieve setting',
               });
          }
     },

     async update_setting(req: Request, res: Response) {
          try {
               const { key, value } = req.body;
               if (!key || value === undefined) {
                    return res
                         .status(400)
                         .json({ message: 'Key and value are required' });
               }

               const setting = await settings_service.update_setting(
                    key,
                    String(value)
               );
               return res.status(200).json({
                    message: 'Setting updated successfully',
                    setting,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to update setting',
               });
          }
     },
};
