CREATE TABLE "user_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"device_name" varchar(255) NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;