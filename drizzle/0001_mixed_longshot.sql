CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"category_name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
