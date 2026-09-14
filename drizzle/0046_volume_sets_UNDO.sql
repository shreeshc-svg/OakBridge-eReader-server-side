-- UNDO for 0046_volume_sets.sql
--
-- Run only if no volume rows exist yet (they would be deleted by the first
-- statement and their ISBNs would break the restored UNIQUE constraint).

DELETE FROM "books" WHERE "set_parent_id" IS NOT NULL;

DROP INDEX IF EXISTS "books_set_parent_idx";
DROP INDEX IF EXISTS "books_isbn_unique_top_level";

ALTER TABLE "books" DROP CONSTRAINT IF EXISTS "books_set_parent_id_books_id_fk";
ALTER TABLE "books" DROP COLUMN IF EXISTS "set_parent_id";
ALTER TABLE "books" DROP COLUMN IF EXISTS "volume_number";
ALTER TABLE "books" DROP COLUMN IF EXISTS "volume_label";
ALTER TABLE "books" DROP COLUMN IF EXISTS "is_set";

-- Restore the original blanket ISBN uniqueness. This fails if any duplicate
-- ISBNs remain, and if any row has file_url IS NULL the NOT NULL below fails -
-- both are the intended safety checks.
UPDATE "books" SET "file_url" = '' WHERE "file_url" IS NULL;
ALTER TABLE "books" ALTER COLUMN "file_url" SET NOT NULL;
ALTER TABLE "books" ADD CONSTRAINT "books_isbn_unique" UNIQUE("isbn");
