CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_user_id_book_id_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "payment_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"price" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_items" ADD CONSTRAINT "payment_items_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;