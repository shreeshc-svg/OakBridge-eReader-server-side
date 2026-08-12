CREATE TABLE "institution_allowed_categories" (
	"institution_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "institution_allowed_categories_institution_id_category_id_pk" PRIMARY KEY("institution_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "institution_allowed_categories" ADD CONSTRAINT "institution_allowed_categories_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_allowed_categories" ADD CONSTRAINT "institution_allowed_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;