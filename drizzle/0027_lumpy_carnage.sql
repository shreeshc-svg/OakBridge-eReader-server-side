CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tier" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"price" integer NOT NULL,
	"member_limit" integer NOT NULL,
	"features" jsonb NOT NULL,
	"is_best_value" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
ALTER TABLE "institutions" ALTER COLUMN "tier" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "institutions" ALTER COLUMN "tier" SET DEFAULT 'NONE';