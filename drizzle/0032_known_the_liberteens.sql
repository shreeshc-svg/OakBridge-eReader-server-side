CREATE TABLE "free_candidate_allowed_books" (
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "free_candidate_allowed_books_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "free_candidate_allowed_books" ADD CONSTRAINT "free_candidate_allowed_books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_candidate_allowed_books" ADD CONSTRAINT "free_candidate_allowed_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;