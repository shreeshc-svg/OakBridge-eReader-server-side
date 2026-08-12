CREATE TABLE "user_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_name" varchar(255),
	"action" varchar(255) NOT NULL,
	"details" text,
	"ip_address" varchar(45),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "shipping_address" varchar(500);--> statement-breakpoint
ALTER TABLE "user_logs" ADD CONSTRAINT "user_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;