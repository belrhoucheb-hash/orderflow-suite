import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget audit log entry.
 * Writes to the `audit_log` table without blocking the caller.
 *
 * Column mapping (from 20260330_audit_log.sql):
 *   table_name  – e.g. "invoices", "trips", "orders"
 *   record_id   – UUID of the affected row
 *   action      – "INSERT" | "UPDATE" | "DELETE"
 *   old_data    – previous state (jsonb)
 *   new_data    – new state (jsonb)
 */
export function logAudit(params: {
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  changed_fields?: string[];
}) {
  supabase
    .from("audit_log")
    .insert({
      table_name: params.table_name,
      record_id: params.record_id,
      action: params.action,
      old_data: params.old_data ?? null,
      new_data: params.new_data ?? null,
      changed_fields: params.changed_fields ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn("Audit log failed:", error.message);
    });
}
