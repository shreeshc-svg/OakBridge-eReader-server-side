CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"subject" varchar(255),
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
