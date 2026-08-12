ALTER TABLE "users" ADD COLUMN "billing_address_line1" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_address_line2" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_city" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_state" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_postal_code" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "billing_country" varchar(100) DEFAULT 'India';