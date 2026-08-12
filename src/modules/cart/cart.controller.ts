import { Request, Response } from 'express';
import { cart_service } from './cart.service';

export const cart_controller = {
     async get_cart(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const cart = await cart_service.get_cart(userId);
               return res.status(200).json({ success: true, data: cart });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch cart',
               });
          }
     },

     async add_to_cart(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               const { book_id } = req.body;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               const item = await cart_service.add_to_cart(userId, book_id);
               return res.status(200).json({ success: true, data: item });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to add to cart',
               });
          }
     },

     async remove_from_cart(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               const book_id = req.params.book_id as string;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               await cart_service.remove_from_cart(userId, book_id);
               return res.status(200).json({ success: true });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to remove from cart',
               });
          }
     },

     async clear_cart(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               await cart_service.clear_cart(userId);
               return res.status(200).json({ success: true });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to clear cart',
               });
          }
     },

     async move_to_saved(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               const book_id = req.params.book_id as string;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               await cart_service.move_to_saved(userId, book_id);
               return res.status(200).json({ success: true });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to save item',
               });
          }
     },

     async move_to_cart(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               const book_id = req.params.book_id as string;

               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }
               if (!book_id) {
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });
               }

               await cart_service.move_to_cart(userId, book_id);
               return res.status(200).json({ success: true });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to move item to cart',
               });
          }
     },

     async get_cart_count(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({ message: 'Unauthorized' });
               }

               const count = await cart_service.get_cart_count(userId);
               return res.status(200).json({ success: true, count });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to get cart count',
               });
          }
     },
};
