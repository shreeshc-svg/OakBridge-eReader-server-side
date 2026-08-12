ALTER TABLE "cart_items" ADD COLUMN "abandoned_notified_12h" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "abandoned_notified_1w" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "abandoned_notified_1m" boolean DEFAULT false NOT NULL;