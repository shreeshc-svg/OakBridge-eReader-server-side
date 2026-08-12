CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" varchar(1000) NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;