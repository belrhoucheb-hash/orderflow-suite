import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Assignments } from "@/components/planning/types";
import { toDateString } from "@/components/planning/PlanningDateNav";

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

// ── Private localStorage helpers (write-through cache for offline) ──

function getDraftKey(dateStr: string) { return `planning-draft-${dateStr}`; }
function getStartTimesKey(dateStr: string) { return `planning-draft-startTimes-${dateStr}`; }
function getDriversKey(dateStr: string) { return `planning-draft-drivers-${dateStr}`; }

function writeLocalCache(dateStr: string, assignments: Assignments, startTimes: Record<string, string>, drivers: Record<string, string>) {
  try {
    const hasOrders = Object.values(assignments).some(arr => arr.length > 0);
    if (hasOrders) {
      localStorage.setItem(getDraftKey(dateStr), JSON.stringify(assignments));
    } else {
      localStorage.removeItem(getDraftKey(dateStr));
    }
    if (Object.keys(startTimes).length > 0) {
      localStorage.setItem(getStartTimesKey(dateStr), JSON.stringify(startTimes));
    } else {
      localStorage.removeItem(getStartTimesKey(dateStr));
    }
    if (Object.keys(drivers).length > 0) {
      localStorage.setItem(getDriversKey(dateStr), JSON.stringify(drivers));
    } else {
      localStorage.removeItem(getDriversKey(dateStr));
    }
  } catch {
    // localStorage may be full or unavailable — ignore
  }
}

function readLocalCache(dateStr: string): DraftData | null {
  try {
    const saved = localStorage.getItem(getDraftKey(dateStr));
    if (!saved) return null;
    const assignments = JSON.parse(saved) as Assignments;
    const hasOrders = Object.values(assignments).some(arr => arr.length > 0);
    if (!hasOrders) return null;
    const startTimes = JSON.parse(localStorage.getItem(getStartTimesKey(dateStr)) || "{}");
    const drivers = JSON.parse(localStorage.getItem(getDriversKey(dateStr)) || "{}");
    return { assignments, startTimes, drivers };
  } catch {
    return null;
  }
}

function clearLocalCache(dateStr: string) {
  try {
    localStorage.removeItem(getDraftKey(dateStr));
    localStorage.removeItem(getStartTimesKey(dateStr));
    localStorage.removeItem(getDriversKey(dateStr));
  } catch {
    // ignore
  }
}

// ── Load planning drafts for a date ──

export function useLoadPlanningDraft(date: string, tenantId: string | undefined) {
  return useQuery<DraftData | null>({
    queryKey: ["planning-drafts", date, tenantId],
    enabled: !!tenantId && !!date,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("planning_drafts")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("planned_date", date);

        if (error) throw error;

        if (!data || data.length === 0) {
          // DB has no draft — check localStorage as fallback (e.g. saved while offline)
          return readLocalCache(date);
        }

        const rows = data as unknown as PlanningDraftRow[];

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

        const draft: DraftData = {
          assignments: assignments as unknown as Assignments,
          startTimes,
          drivers,
        };

        // Write-through: keep localStorage in sync for offline access
        writeLocalCache(date, draft.assignments, draft.startTimes, draft.drivers);

        return draft;
      } catch (err) {
        // Supabase unreachable — fall back to localStorage
        console.warn("Failed to load draft from Supabase, falling back to localStorage:", err);
        return readLocalCache(date);
      }
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
      // Write-through: always save to localStorage immediately (offline resilience)
      writeLocalCache(date, assignments, startTimes, drivers);

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
    onError: (_err, variables) => {
      // Supabase failed but localStorage was already written — data is safe offline
      console.warn("Failed to save draft to Supabase (localStorage cache still valid):", _err);
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
      // Clear localStorage cache
      clearLocalCache(date);

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
    onError: (_err, variables) => {
      // localStorage was already cleared; Supabase delete failed — log but don't block
      console.warn("Failed to delete draft from Supabase:", _err);
    },
  });
}

// ── Collect week drafts from localStorage cache (for week overview) ──

export function collectWeekDrafts(weekStart: string): Record<string, Assignments> {
  const monday = new Date(weekStart + "T00:00:00");
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);

  const result: Record<string, Assignments> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = toDateString(d);
    const draft = readLocalCache(ds);
    if (draft) result[ds] = draft.assignments;
  }
  return result;
}

// ─── Realtime ───────────────────────────────────────────────
/**
 * Subscribe to all changes on the `planning_drafts` table and
 * invalidate React Query caches so planners see each other's
 * changes in near-real-time.
 *
 * Mount once at the planning page level.
 */
export function usePlanningDraftsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("planning-drafts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "planning_drafts" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["planning-drafts"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// --- Planning Events Realtime ─────────────────────────────────
/**
 * Subscribe to planning_events to show real-time notifications
 * when the system auto-assigns or re-evaluates orders.
 */
export function usePlanningEventsRealtime(
  onPlanningEvent?: (event: {
    trigger_type: string;
    orders_assigned: number;
    orders_changed: number;
    auto_executed: boolean;
    confidence: number;
  }) => void,
) {
  const queryClient = useQueryClient();
  const callbackRef = useRef(onPlanningEvent);
  callbackRef.current = onPlanningEvent;

  useEffect(() => {
    const channel = supabase
      .channel("planning-events-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "planning_events" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["planning-drafts"] });
          queryClient.invalidateQueries({ queryKey: ["planning-events"] });

          if (callbackRef.current && payload.new) {
            const row = payload.new as Record<string, unknown>;
            callbackRef.current({
              trigger_type: (row.trigger_type as string) || "UNKNOWN",
              orders_assigned: (row.orders_assigned as number) || 0,
              orders_changed: (row.orders_changed as number) || 0,
              auto_executed: (row.auto_executed as boolean) || false,
              confidence: (row.confidence as number) || 0,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

// --- Planning Events History ──────────────────────────────────
/**
 * Fetch recent planning events for a tenant.
 */
export function usePlanningEvents(tenantId: string | undefined, limit: number = 20) {
  return useQuery({
    queryKey: ["planning-events", tenantId, limit],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_events")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
  });
}
