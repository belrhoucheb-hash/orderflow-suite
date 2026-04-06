/**
 * Supabase Realtime Configuration
 *
 * The following tables need Realtime enabled in Supabase for live updates
 * to work across the OrderFlow Suite dashboards and chauffeur app.
 *
 * To enable Realtime for these tables, run the following SQL in your
 * Supabase SQL editor or include it in a migration:
 *
 * ```sql
 * ALTER PUBLICATION supabase_realtime ADD TABLE orders;
 * ALTER PUBLICATION supabase_realtime ADD TABLE trips;
 * ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
 * ALTER PUBLICATION supabase_realtime ADD TABLE anomalies;
 * ALTER PUBLICATION supabase_realtime ADD TABLE ai_decisions;
 * ALTER PUBLICATION supabase_realtime ADD TABLE vehicle_positions;
 * ```
 */

/**
 * List of tables that require Supabase Realtime to be enabled.
 */
export const REALTIME_TABLES = [
  "orders",
  "trips",
  "notifications",
  "anomalies",
  "ai_decisions",
  "vehicle_positions",
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

/**
 * Generate the SQL statements needed to enable Realtime for all required tables.
 * Useful for generating migration scripts or running in the Supabase SQL editor.
 */
export function generateRealtimeSQL(): string {
  return REALTIME_TABLES.map(
    (table) => `ALTER PUBLICATION supabase_realtime ADD TABLE ${table};`,
  ).join("\n");
}

/**
 * SQL to enable Realtime for all required tables.
 * Can be executed as a migration or via the Supabase SQL editor.
 */
export const REALTIME_ENABLE_SQL = generateRealtimeSQL();
