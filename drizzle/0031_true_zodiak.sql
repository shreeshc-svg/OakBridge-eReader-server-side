CREATE TABLE "institution_allowed_books" (
	"institution_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	CONSTRAINT "institution_allowed_books_institution_id_book_id_pk" PRIMARY KEY("institution_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "institution_allowed_categories" ADD COLUMN "allow_all_books" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "institution_allowed_books" ADD CONSTRAINT "institution_allowed_books_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_allowed_books" ADD CONSTRAINT "institution_allowed_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;