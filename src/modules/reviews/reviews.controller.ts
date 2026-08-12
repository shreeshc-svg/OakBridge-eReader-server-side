import { Request, Response } from 'express';
import { reviews_service } from './reviews.service';

export const reviews_controller = {
     async submit_review(req: Request, res: Response): Promise<any> {
          try {
               const userId = req.user?.id;
               if (!userId) {
                    return res.status(401).json({
                         message: 'Unauthorized: User not authenticated',
                    });
               }

               const { bookId, rating, reviewText } = req.body;
               if (!bookId || rating === undefined || !reviewText) {
                    return res.status(400).json({
                         message: 'Missing required fields: bookId, rating, reviewText',
                    });
               }

               const numericRating = Number(rating);
               if (isNaN(numericRating)) {
                    return res
                         .status(400)
                         .json({ message: 'Rating must be a valid number' });
               }

               const review = await reviews_service.submit_review({
                    userId,
                    bookId,
                    rating: numericRating,
                    reviewText,
               });

               return res.status(201).json({
                    message: 'Review submitted successfully. It is pending moderation.',
                    review,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to submit review',
               });
          }
     },

     async get_pending_reviews(req: Request, res: Response): Promise<any> {
          try {
               const pending = await reviews_service.get_pending_reviews();
               return res.status(200).json({
                    message: 'Pending reviews fetched successfully',
                    reviews: pending,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch pending reviews',
               });
          }
     },

     async get_all_reviews_for_admin(req: Request, res: Response): Promise<any> {
          try {
               const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;
               const timeframe = req.query.timeframe as string | undefined;
               
               if (status && !['pending', 'approved', 'rejected'].includes(status)) {
                    return res.status(400).json({
                         message: 'Invalid status query parameter. Must be pending, approved, or rejected.',
                    });
               }

               const reviewsList = await reviews_service.get_all_reviews_for_admin(status, timeframe);
               return res.status(200).json({
                    message: 'Reviews fetched successfully',
                    reviews: reviewsList,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message: error.message || 'Failed to fetch reviews',
               });
          }
     },

     async moderate_review(req: Request, res: Response): Promise<any> {
          try {
               const id = req.params.id as string;
               const { status } = req.body; // 'approved' | 'rejected'

               if (!id) {
                    return res
                         .status(400)
                         .json({ message: 'Review ID is required' });
               }

               if (!status) {
                    return res
                         .status(400)
                         .json({ message: 'Status is required' });
               }

               const updated = await reviews_service.moderate_review(
                    id,
                    status
               );
               return res.status(200).json({
                    message: `Review ${status} successfully`,
                    review: updated,
               });
          } catch (error: any) {
               return res.status(400).json({
                    message: error.message || 'Failed to moderate review',
               });
          }
     },

     async get_book_reviews(req: Request, res: Response): Promise<any> {
          try {
               const bookId = req.params.bookId as string;
               if (!bookId) {
                    return res
                         .status(400)
                         .json({ message: 'Book ID is required' });
               }

               const data = await reviews_service.get_book_reviews(bookId);
               return res.status(200).json({
                    message: 'Book reviews fetched successfully',
                    ...data,
               });
          } catch (error: any) {
               return res.status(500).json({
                    message:
                         error.message || 'Failed to fetch reviews for book',
               });
          }
     },
};
