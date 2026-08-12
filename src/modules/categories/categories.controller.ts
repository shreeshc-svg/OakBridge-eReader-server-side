import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../db/db';
import { users, institution_allowed_categories } from '../../db/schemas';
import { securityConfig } from '../../config/app.config';
import { categories_service } from './categories.service';

export const categories_controller = {
     async create_category(req: Request, res: Response) {
          try {
               const { category_name, parent_id } = req.body;

               //  validate input
               if (!category_name) {
                    return res.status(400).json({
                         message: 'Category name is required',
                    });
               }

               const created_category =
                    await categories_service.create_category({
                         category_name,
                         parent_id,
                    });

               return res.status(201).json({
                    message: 'Category created successfully',
                    category: created_category,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to create category',
               });
          }
     },

     async get_all_categories(req: Request, res: Response) {
          try {
               let all_categories =
                    await categories_service.get_all_categories();

               // Parse token optionally if available to check institution category restrictions
               let institutionId: string | undefined;
               const authHeader = req.headers.authorization;
               if (authHeader && authHeader.startsWith('Bearer ')) {
                    const token = authHeader.split(' ')[1];
                    try {
                         if (securityConfig.jwtSecret) {
                              const decoded = jwt.verify(token, securityConfig.jwtSecret) as any;
                              if (decoded && decoded.id) {
                                   const [user] = await db
                                        .select({ institution_id: users.institution_id })
                                        .from(users)
                                        .where(eq(users.id, decoded.id))
                                        .limit(1);
                                   if (user?.institution_id) {
                                        institutionId = user.institution_id;
                                   }
                              }
                         }
                    } catch (err) {
                         // Ignore token verification errors since this endpoint is optionally authenticated
                    }
               }

               if (institutionId) {
                    const restrictions = await db
                         .select({ categoryId: institution_allowed_categories.category_id })
                         .from(institution_allowed_categories)
                         .where(eq(institution_allowed_categories.institution_id, institutionId));

                    if (restrictions.length > 0) {
                         const allowedCatIds = restrictions.map(r => r.categoryId);
                         all_categories = all_categories.filter(cat => allowedCatIds.includes(cat.id));
                    }
               }

               return res.status(200).json({
                    message: 'Categories Fetched Successfully',
                    categories: all_categories,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message:
                         error.message || 'Failed to fetch all the categories',
               });
          }
     },

     async update_category(req: Request, res: Response) {
          try {
               const id = req.query.id as string;
               const { category_name, parent_id } = req.body;

               if (!id) {
                    return res.status(400).json({
                         message: 'Category ID is required',
                    });
               }

               // validate input
               if (!category_name) {
                    return res.status(400).json({
                         message: 'Category name is required',
                    });
               }

               const updated_category =
                    await categories_service.update_category(id, {
                         category_name,
                         parent_id,
                    });

               return res.status(200).json({
                    message: 'Category updated successfully',
                    category: updated_category,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to update category ',
               });
          }
     },

     async delete_category(req: Request, res: Response) {
          try {
               const id = req.query.id as string;

               if (!id) {
                    return res.status(400).json({
                         message: 'Category ID is required',
                    });
               }

               const deleted_category =
                    await categories_service.delete_category(id);

               return res.status(200).json({
                    message: 'Category deleted successfully',
                    category: deleted_category,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to delete category',
               });
          }
     },
};
