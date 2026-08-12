CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"review_text" text NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;