import { Request, Response } from 'express';
import { reader_service } from './reader.service';

export const reader_controller = {
     get_progress: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const book_id = req.params.book_id as string;
               if (!book_id)
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });

               const progress = await reader_service.get_progress(
                    user_id,
                    book_id
               );
               res.status(200).json({ success: true, data: progress });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     update_progress: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const book_id = req.params.book_id as string;
               const { progress_percentage, current_cfi, current_chapter } =
                    req.body;

               if (!book_id || progress_percentage === undefined) {
                    return res
                         .status(400)
                         .json({ message: 'Missing required fields' });
               }

               const result = await reader_service.upsert_progress(
                    user_id,
                    book_id,
                    progress_percentage,
                    current_cfi,
                    current_chapter
               );
               res.status(200).json({ success: true, data: result });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },
     get_highlights: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const book_id = req.params.book_id as string;
               if (!book_id)
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });

               const highlights = await reader_service.get_highlights(
                    user_id,
                    book_id
               );
               res.status(200).json({ success: true, data: highlights });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     add_highlight: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const { book_id, cfi_range, text, color, note } = req.body;

               if (!book_id || !cfi_range || !text || !color) {
                    return res
                         .status(400)
                         .json({ message: 'Missing required fields' });
               }

               const result = await reader_service.add_highlight(
                    user_id,
                    book_id,
                    cfi_range,
                    text,
                    color,
                    note
               );
               res.status(200).json({ success: true, data: result });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     remove_highlight: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const highlight_id = req.params.highlight_id as string;

               if (!highlight_id)
                    return res
                         .status(400)
                         .json({ message: 'highlight_id is required' });

               await reader_service.remove_highlight(user_id, highlight_id);
               res.status(200).json({ success: true });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     get_bookmarks: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const book_id = req.params.book_id as string;
               if (!book_id)
                    return res
                         .status(400)
                         .json({ message: 'book_id is required' });

               const result = await reader_service.get_bookmarks(
                    user_id,
                    book_id
               );
               res.status(200).json({ success: true, data: result });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     add_bookmark: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const { book_id, cfi, label } = req.body;

               if (!book_id || !cfi) {
                    return res
                         .status(400)
                         .json({ message: 'Missing required fields' });
               }

               const result = await reader_service.add_bookmark(
                    user_id,
                    book_id,
                    cfi,
                    label
               );
               res.status(200).json({ success: true, data: result });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },

     remove_bookmark: async (req: Request, res: Response) => {
          try {
               const user_id = (req as any).user.id;
               const bookmark_id = req.params.bookmark_id as string;

               if (!bookmark_id)
                    return res
                         .status(400)
                         .json({ message: 'bookmark_id is required' });

               await reader_service.remove_bookmark(user_id, bookmark_id);
               res.status(200).json({ success: true });
          } catch (error: any) {
               res.status(500).json({
                    message: error.message || 'Internal Server Error',
               });
          }
     },
};
