import { Request, Response } from 'express';
import { banners_service } from './banners.service';

export const getBanners = async (req: Request, res: Response) => {
     try {
          const banners = await banners_service.get_active_banners();
          res.status(200).json({ banners });
     } catch (error) {
          console.error('[BANNERS] Error fetching banners:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const getAllBanners = async (req: Request, res: Response) => {
     try {
          const banners = await banners_service.get_all_banners();
          res.status(200).json({ banners });
     } catch (error) {
          console.error('[BANNERS] Error fetching all banners:', error);
          res.status(500).json({ message: 'Internal server error' });
     }
};

export const createBanner = async (req: Request, res: Response) => {
     try {
          const banner = await banners_service.create_banner(
               req.body,
               req.file
          );
          res.status(201).json({
               message: 'Banner created successfully',
               banner,
          });
     } catch (error: any) {
          console.error('[BANNERS] Error creating banner:', error);
          res.status(400).json({
               message: error.message || 'Error creating banner',
          });
     }
};

export const updateBanner = async (req: Request, res: Response) => {
     try {
          const id = req.params.id as string;
          const banner = await banners_service.update_banner(
               id,
               req.body,
               req.file
          );
          res.status(200).json({
               message: 'Banner updated successfully',
               banner,
          });
     } catch (error: any) {
          console.error('[BANNERS] Error updating banner:', error);
          res.status(400).json({
               message: error.message || 'Error updating banner',
          });
     }
};

export const deleteBanner = async (req: Request, res: Response) => {
     try {
          const id = req.params.id as string;
          await banners_service.delete_banner(id);
          res.status(200).json({ message: 'Banner deleted successfully' });
     } catch (error: any) {
          console.error('[BANNERS] Error deleting banner:', error);
          res.status(400).json({
               message: error.message || 'Error deleting banner',
          });
     }
};

export const reorderBanners = async (req: Request, res: Response) => {
     try {
          const { ids } = req.body;
          if (!Array.isArray(ids)) {
               return res.status(400).json({ message: 'IDs array is required' });
          }
          await banners_service.reorder_banners(ids);
          res.status(200).json({ message: 'Banners reordered successfully' });
     } catch (error: any) {
          console.error('[BANNERS] Error reordering banners:', error);
          res.status(500).json({
               message: error.message || 'Error reordering banners',
          });
     }
};
