-- Multi-volume sets
--
-- A set is an ordinary `books` row with is_set = true. Its volumes are also
-- `books` rows, each pointing back at the set through set_parent_id.
--   * only rows with set_parent_id IS NULL are listed in the store and sold
--   * a volume is read through the entitlement of its parent set
--   * volumes deliberately share the set's ISBN, so ISBN uniqueness now
--     applies only to sets and standalone books
--
-- Safe to run more than once.

ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "set_parent_id" uuid;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "volume_number" integer;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "volume_label" varchar;
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "is_set" boolean DEFAULT false NOT NULL;

DO $$
BEGIN
     IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'books_set_parent_id_books_id_fk'
     ) THEN
          ALTER TABLE "books"
               ADD CONSTRAINT "books_set_parent_id_books_id_fk"
               FOREIGN KEY ("set_parent_id") REFERENCES "books"("id") ON DELETE cascade;
     END IF;
END $$;

-- A set parent has no single file of its own; its volumes carry the PDFs.
ALTER TABLE "books" ALTER COLUMN "file_url" DROP NOT NULL;

-- Volumes share their set's ISBN, so the blanket UNIQUE(isbn) has to become a
-- partial index. Sets and standalone books stay strictly unique.
ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_isbn_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "books_isbn_unique_top_level"
     ON "books" ("isbn") WHERE "set_parent_id" IS NULL;

CREATE INDEX IF NOT EXISTS "books_set_parent_idx"
     ON "books" ("set_parent_id", "volume_number");
