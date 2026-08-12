CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"subtitle" text,
	"image_url" text NOT NULL,
	"link_url" text,
	"button_text" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
