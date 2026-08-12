ALTER TABLE "books" ADD COLUMN "is_trending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "is_new_release" boolean DEFAULT false NOT NULL;