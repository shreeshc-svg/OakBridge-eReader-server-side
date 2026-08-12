import { Request, Response } from 'express';
import { institution_service } from './institution.service';

export const institution_controller = {
     async get_members(req: Request, res: Response): Promise<any> {
          try {
               const institutionId = req.user?.institution_id;

               if (!institutionId) {
                    return res.status(400).json({
                         message: 'User is not linked to any institution.',
                    });
               }

               const members =
                    await institution_service.get_members(institutionId);
               return res.status(200).json({
                    message: 'Members fetched successfully',
                    members,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to fetch members',
               });
          }
     },

     async add_member(req: Request, res: Response): Promise<any> {
          try {
               const institutionId = req.user?.institution_id;
               const { username, email, password } = req.body;

               if (!institutionId) {
                    return res.status(400).json({
                         message: 'User is not linked to any institution.',
                    });
               }

               if (!username || !email) {
                    return res
                         .status(400)
                         .json({ message: 'Username and email are required.' });
               }

               const member = await institution_service.add_member(
                    institutionId,
                    {
                         username,
                         email,
                         password,
                    }
               );

               return res.status(201).json({
                    message: 'Member added successfully',
                    member,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to add member',
               });
          }
     },

     async remove_member(req: Request, res: Response): Promise<any> {
          try {
               const institutionId = req.user?.institution_id;
               const memberId = req.params.id as string;

               if (!institutionId) {
                    return res.status(400).json({
                         message: 'User is not linked to any institution.',
                    });
               }

               if (!memberId) {
                    return res
                         .status(400)
                         .json({ message: 'Member ID is required.' });
               }

               const result = await institution_service.remove_member(
                    institutionId,
                    memberId
               );
               return res.status(200).json(result);
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to remove member',
               });
          }
     },
};
