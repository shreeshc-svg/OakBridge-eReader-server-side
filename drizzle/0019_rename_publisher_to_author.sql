-- Custom SQL migration file, put your code below! --
ALTER TABLE "books" RENAME COLUMN "author" TO "uploader_id";
ALTER TABLE "books" RENAME COLUMN "publisher" TO "author";