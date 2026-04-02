import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assignments } from "@/components/planning/types";

// ── Types ──

interface PlanningDraftRow {
  id: string;
  tenant_id: string;
  planned_date: string;
  vehicle_id: string;
  order_ids: string[];
  driver_id: string | null;
  start_time: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftData {
  assignments: Assignments;
  startTimes: Record<string, string>;
  drivers: Record<string, string>;
}

// ── Load planning drafts for a date ──

export function useLoadPlanningDraft(date: string, tenantId: string | undefined) {
  return useQuery<DraftData | null>({
    queryKey: ["planning-drafts", date, tenantId],
    enabled: !!tenantId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_drafts")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("planned_date", date);

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const rows = data as unknown as PlanningDraftRow[];

      // We only have order_ids (UUIDs) in the DB, not full PlanOrder objects.
      // The caller must resolve these against the orders list.
      // We return a partial Assignments with just { vehicleId: orderIdStrings[] }
      // and a special __orderIds flag so the caller knows to hydrate.
      const assignments: Record<string, string[]> = {};
      const startTimes: Record<string, string> = {};
      const drivers: Record<string, string> = {};

      for (const row of rows) {
        if (row.order_ids.length > 0) {
          assignments[row.vehicle_id] = row.order_ids;
        }
        if (row.start_time) {
          startTimes[row.vehicle_id] = row.start_time;
        }
        if (row.driver_id) {
          drivers[row.vehicle_id] = row.driver_id;
        }
      }

      // Return assignments as any — caller will hydrate order IDs into PlanOrder objects
      return {
        assignments: assignments as unknown as Assignments,
        startTimes,
        drivers,
      };
    },
    staleTime: 30_000,
  });
}

// ── Save (upsert) planning drafts ──

interface SaveDraftParams {
  tenantId: string;
  date: string;
  /** Full assignments: Record<vehicleId, PlanOrder[]> — we extract just the IDs */
  assignments: Assignments;
  startTimes: Record<string, string>;
  drivers: Record<string, string>;
}

export function useSavePlanningDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tenantId, date, assignments, startTimes, drivers }: SaveDraftParams) => {
      // Build upsert rows for every vehicle that has orders
      const rows: Array<{
        tenant_id: string;
        planned_date: string;
        vehicle_id: string;
        order_ids: string[];
        driver_id: string | null;
        start_time: string;
      }> = [];

      for (const [vehicleId, orders] of Object.entries(assignments)) {
        if (orders.length === 0) continue;
        rows.push({
          tenant_id: tenantId,
          planned_date: date,
          vehicle_id: vehicleId,
          order_ids: orders.map((o) => o.id),
          driver_id: drivers[vehicleId] || null,
          start_time: startTimes[vehicleId] || "07:00",
        });
      }

      // Delete vehicles that no longer have orders for this date
      const vehicleIdsWithOrders = rows.map((r) => r.vehicle_id);

      // First delete stale rows
      const { error: delError } = await supabase
        .from("planning_drafts")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("planned_date", date)
        .not("vehicle_id", "in", vehicleIdsWithOrders.length > 0
          ? `(${vehicleIdsWithOrders.join(",")})`
          : "(00000000-0000-0000-0000-000000000000)");

      if (delError) console.warn("Draft cleanup error:", delError);

      // Then upsert current rows
      if (rows.length > 0) {
        const { error } = await supabase
          .from("planning_drafts")
          .upsert(rows as any, {
            onConflict: "tenant_id,planned_date,vehicle_id",
          });
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["planning-drafts", variables.date, variables.tenantId],
      });
    },
  });
}

// ── Delete all drafts for a date ──

interface DeleteDraftParams {
  tenantId: string;
  date: string;
}

export function useDeletePlanningDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tenantId, date }: DeleteDraftParams) => {
      const { error } = await supabase
        .from("planning_drafts")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("planned_date", date);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["planning-drafts", variables.date, variables.tenantId],
      });
    },
  });
}
