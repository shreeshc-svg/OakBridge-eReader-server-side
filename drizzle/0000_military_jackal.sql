CREATE TYPE "public"."role" AS ENUM('AUTHOR', 'USER');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(50) NOT NULL,
	"password" varchar NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
