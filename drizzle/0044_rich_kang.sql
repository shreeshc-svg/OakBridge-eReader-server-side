CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" integer NOT NULL,
	"min_order_amount" integer,
	"max_discount_amount" integer,
	"expires_at" timestamp,
	"usage_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"coupon_id" uuid NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "original_amount" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "discount_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;