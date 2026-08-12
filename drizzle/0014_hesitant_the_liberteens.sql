CREATE TYPE "public"."subscription_tier" AS ENUM('GOLD', 'PLATINUM', 'NONE');--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'INSTITUTION_ADMIN';--> statement-breakpoint
ALTER TYPE "public"."role" ADD VALUE 'INSTITUTION_MEMBER';--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"location" varchar(255) NOT NULL,
	"admin_id" uuid NOT NULL,
	"tier" "subscription_tier" DEFAULT 'NONE' NOT NULL,
	"subscription_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "institution_id" uuid;--> statement-breakpoint
ALTER TABLE "institutions" ADD CONSTRAINT "institutions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE set null ON UPDATE no action;