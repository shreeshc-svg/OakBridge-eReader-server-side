ALTER TABLE "books" ADD COLUMN "cover_image_alt" varchar DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "preview_pages_alt" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "image_alt" text DEFAULT '' NOT NULL;