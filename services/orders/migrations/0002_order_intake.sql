-- order-intake: Order, OrderLine, StatusChange (empty) and the order number
-- sequence. Additive (three new tables, one new sequence).
-- Rollback (by hand, then delete this migration's row in drizzle.__drizzle_migrations):
--   DROP TABLE "status_changes"; DROP TABLE "order_lines"; DROP TABLE "orders";
--   DROP SEQUENCE "order_number_seq";
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	CONSTRAINT "order_lines_quantity_check" CHECK ("order_lines"."quantity" >= 1),
	CONSTRAINT "order_lines_unit_price_check" CHECK ("order_lines"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"external_reference" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"shipping_name" text NOT NULL,
	"shipping_line1" text NOT NULL,
	"shipping_line2" text,
	"shipping_city" text NOT NULL,
	"shipping_postal_code" text NOT NULL,
	"shipping_country" text NOT NULL,
	"currency" text NOT NULL,
	"shipping_cost" bigint NOT NULL,
	"total" bigint NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" in ('new', 'paid', 'shipped', 'cancelled')),
	CONSTRAINT "orders_currency_check" CHECK ("orders"."currency" in ('EUR', 'USD', 'GBP', 'JPY')),
	CONSTRAINT "orders_amounts_check" CHECK ("orders"."shipping_cost" >= 0 and "orders"."total" >= 0),
	CONSTRAINT "orders_version_check" CHECK ("orders"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"reason" text,
	"changed_by" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_changes" ADD CONSTRAINT "status_changes_changed_by_staff_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_lines_order_id_position_key" ON "order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_external_reference_key" ON "orders" USING btree ("external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_key" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "status_changes_order_id_at_idx" ON "status_changes" USING btree ("order_id","at");