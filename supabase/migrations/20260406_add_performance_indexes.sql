-- Performance indexes for frequently queried columns
-- Identified in performance review 2026-04-06

-- P9: orders.client_name is used in ilike filters across useClients, useOrders, useClientOrders
-- Requires pg_trgm extension for trigram index (supports ILIKE pattern matching)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_client_name_trgm
  ON orders USING gin (client_name gin_trgm_ops);

-- P13: trips.dispatch_status is filtered in useVehicleUtilization and useDriverTrips
-- Partial index excludes completed/aborted trips (most common states, least queried)
-- Note: schema uses 'AFGEBROKEN' (not 'GEANNULEERD') per CHECK constraint
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_dispatch_status_active
  ON trips (dispatch_status)
  WHERE dispatch_status NOT IN ('VOLTOOID', 'AFGEBROKEN');

-- Additional performance indexes identified during review:

-- notifications.user_id + is_read: used in useNotifications for unread count
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read)
  WHERE is_read = false;

-- orders.status: frequently filtered in useOrders, Dashboard, Planning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status
  ON orders (status)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED');

-- NOTE: idx_orders_tenant_created already exists (20260327152900_multi_tenant_foundation.sql)
-- NOTE: idx_invoices_tenant_status already exists (20260329210000_invoices_and_status_constraint.sql)
