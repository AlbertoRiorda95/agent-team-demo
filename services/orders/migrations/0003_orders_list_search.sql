-- orders-list: the search of GET /orders (case-insensitive contains on number,
-- customer name and email) uses pg_trgm GIN indexes. Additive (one extension,
-- three new indexes; no column or table changes). pg_trgm is a contrib
-- extension bundled with the postgres image and trusted since Postgres 13, so
-- the database owner can create it without superuser.
-- Plain CREATE INDEX (the migrator runs in a transaction, CONCURRENTLY cannot):
-- it blocks writes to orders while it builds, seconds at 10,000 orders.
-- Rollback (by hand, then delete this migration's row in drizzle.__drizzle_migrations):
--   DROP INDEX "orders_customer_email_trgm_idx"; DROP INDEX "orders_customer_name_trgm_idx";
--   DROP INDEX "orders_number_trgm_idx";
--   DROP EXTENSION IF EXISTS pg_trgm;  -- only if nothing else uses it
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "orders_number_trgm_idx" ON "orders" USING gin ("number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_customer_name_trgm_idx" ON "orders" USING gin (lower("customer_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "orders_customer_email_trgm_idx" ON "orders" USING gin (lower("customer_email") gin_trgm_ops);
