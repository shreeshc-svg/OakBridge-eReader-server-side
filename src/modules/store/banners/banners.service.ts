import { eq, asc } from 'drizzle-orm';
import { db } from '../../../db/db';
import { banners } from '../../../db/schemas';
import {
     upload_to_s3,
     get_presigned_url,
     delete_from_s3,
} from '../../../utils/s3';

export const banners_service = {
     async get_all_banners() {
          const all_banners = await db
               .select()
               .from(banners)
               .orderBy(asc(banners.order));

          // Map with presigned urls
          const mapped_banners = await Promise.all(
               all_banners.map(async (banner) => {
                    let image_presigned = banner.image_url;
                    try {
                         image_presigned = await get_presigned_url(
                              banner.image_url
                         );
                    } catch (err) {
                         console.error(
                              `Failed to generate presigned URL for banner ${banner.id}:`,
                              err
                         );
                    }
                    return { ...banner, image_url: image_presigned };
               })
          );

          return mapped_banners;
     },

     async get_active_banners() {
          const active_banners = await db
               .select()
               .from(banners)
               .where(eq(banners.is_active, true))
               .orderBy(asc(banners.order));

          const mapped_banners = await Promise.all(
               active_banners.map(async (banner) => {
                    let image_presigned = banner.image_url;
                    try {
                         image_presigned = await get_presigned_url(
                              banner.image_url
                         );
                    } catch (err) {
                         console.error(
                              `Failed to generate presigned URL for banner ${banner.id}:`,
                              err
                         );
                    }
                    return { ...banner, image_url: image_presigned };
               })
          );

          return mapped_banners;
     },

     async create_banner(data: any, file?: Express.Multer.File) {
          if (!file) {
               throw new Error('Banner image is required');
          }

          const image_url = (await upload_to_s3(file, 'banners')).url;

          const payload = {
               title: data.title,
               subtitle: data.subtitle || null,
               image_url: image_url,
               image_alt: data.image_alt || '',
               link_url: data.link_url || null,
               button_text: data.button_text || null,
               is_active: data.is_active === 'true' || data.is_active === true,
               order: parseInt(data.order) || 0,
          };

          const result = await db.insert(banners).values(payload).returning();
          return result[0];
     },

     async update_banner(id: string, data: any, file?: Express.Multer.File) {
          const existing = await db
               .select()
               .from(banners)
               .where(eq(banners.id, id))
               .limit(1);
          if (!existing.length) {
               throw new Error('Banner not found');
          }
          const banner = existing[0];

          let image_url = banner.image_url;
          if (file) {
               if (image_url) {
                    await delete_from_s3(image_url);
               }
               image_url = (await upload_to_s3(file, 'banners')).url;
          }

          const payload: any = {
               title: data.title !== undefined ? data.title : banner.title,
               subtitle:
                    data.subtitle !== undefined
                         ? data.subtitle
                         : banner.subtitle,
               link_url:
                    data.link_url !== undefined
                         ? data.link_url
                         : banner.link_url,
               button_text:
                    data.button_text !== undefined
                         ? data.button_text
                         : banner.button_text,
               is_active:
                    data.is_active !== undefined
                         ? data.is_active === 'true' || data.is_active === true
                         : banner.is_active,
               order:
                    data.order !== undefined
                         ? parseInt(data.order)
                         : banner.order,
               image_url,
               image_alt: data.image_alt !== undefined ? data.image_alt : banner.image_alt,
               updatedAt: new Date(),
          };

          const result = await db
               .update(banners)
               .set(payload)
               .where(eq(banners.id, id))
               .returning();
          return result[0];
     },

     async delete_banner(id: string) {
          const existing = await db
               .select()
               .from(banners)
               .where(eq(banners.id, id))
               .limit(1);
          if (!existing.length) {
               throw new Error('Banner not found');
          }
          const banner = existing[0];

          if (banner.image_url) {
               await delete_from_s3(banner.image_url);
          }

          const result = await db
               .delete(banners)
               .where(eq(banners.id, id))
               .returning();
          return result[0];
     },

     async reorder_banners(ids: string[]) {
          await db.transaction(async (tx) => {
               for (let i = 0; i < ids.length; i++) {
                    await tx
                         .update(banners)
                         .set({ order: i })
                         .where(eq(banners.id, ids[i]));
               }
          });
     },
};
