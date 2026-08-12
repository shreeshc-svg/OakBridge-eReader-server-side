CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"cfi" varchar NOT NULL,
	"label" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;