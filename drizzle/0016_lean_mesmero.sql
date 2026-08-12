ALTER TABLE "payments" ALTER COLUMN "book_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tier" varchar;