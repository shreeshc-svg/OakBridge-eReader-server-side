CREATE TABLE "book_categories" (
	"book_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "book_categories_book_id_category_id_pk" PRIMARY KEY("book_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"description" varchar NOT NULL,
	"author" uuid NOT NULL,
	"publisher" varchar NOT NULL,
	"language" varchar(20) NOT NULL,
	"isbn" varchar NOT NULL,
	"cover_image_url" varchar NOT NULL,
	"total_pages" integer NOT NULL,
	"total_chapters" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_categories" ADD CONSTRAINT "book_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_users_id_fk" FOREIGN KEY ("author") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;