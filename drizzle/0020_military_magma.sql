ALTER TABLE "books" DROP CONSTRAINT "books_author_users_id_fk";
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;