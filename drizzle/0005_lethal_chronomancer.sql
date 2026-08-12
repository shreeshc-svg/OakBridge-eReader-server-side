ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "users" SET "role" = 'SUPERADMIN' WHERE "role" = 'AUTHOR';--> statement-breakpoint
DROP TYPE "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('SUPERADMIN', 'USER');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";