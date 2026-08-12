CREATE TYPE "public"."payment_status" AS ENUM('created', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"razorpay_order_id" varchar NOT NULL,
	"razorpay_payment_id" varchar,
	"razorpay_signature" varchar,
	"amount" integer NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;