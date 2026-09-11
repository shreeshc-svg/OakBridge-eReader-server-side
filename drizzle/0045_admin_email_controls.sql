-- Admin email controls:
--   users.marketing_emails : false once a user unsubscribes from marketing emails
--   books.announced_at     : when the book was announced to readers by email (null = not yet)
-- Written to be safe to run more than once (e.g. once by hand in Neon, then by drizzle migrate).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$
BEGIN
     IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'books' AND column_name = 'announced_at'
     ) THEN
          ALTER TABLE "books" ADD COLUMN "announced_at" timestamp;
          -- Every book that already exists was emailed to readers when it was created.
          UPDATE "books" SET "announced_at" = "created_at";
     END IF;
END $$;
