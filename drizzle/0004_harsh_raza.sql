CREATE TABLE "reading_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"current_chapter" varchar(255),
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"time_left" varchar(255),
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"minutes_read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookshelves" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"shelf_name" varchar(100) NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookshelves" ADD CONSTRAINT "bookshelves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookshelves" ADD CONSTRAINT "bookshelves_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;