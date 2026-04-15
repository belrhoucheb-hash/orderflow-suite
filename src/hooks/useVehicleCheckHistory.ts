import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VehicleCheckHistoryRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "PENDING" | "OK" | "DAMAGE_FOUND" | "RELEASED";
  driver_id: string | null;
  driver_name: string | null;
  vehicle_id: string;
  vehicle_code: string | null;
  vehicle_name: string | null;
  is_baseline_seed: boolean;
  notes: string | null;
  released_at: string | null;
  released_by: string | null;
  release_reason: string | null;
  photos: {
    id: string;
    side: string;
    storage_path: string;
    severity: "none" | "minor" | "blocking";
    ai_description: string | null;
    ai_diff: string | null;
  }[];
  damage_events: {
    id: string;
    side: string;
    severity: "minor" | "blocking";
    description: string | null;
    status: string;
    attributed_to_driver_id: string | null;
  }[];
}

export interface HistoryFilters {
  status?: string;
  vehicleId?: string;
  driverId?: string;
  from?: string;
  to?: string;
  onlyOpenDamage?: boolean;
  releasedOnly?: boolean;
}

export function useVehicleCheckHistory(filters: HistoryFilters = {}) {
  return useQuery({
    queryKey: ["vehicle-check-history", filters],
    staleTime: 15_000,
    queryFn: async (): Promise<VehicleCheckHistoryRow[]> => {
      let q = (supabase as any)
        .from("vehicle_checks")
        .select(`
          id, started_at, completed_at, status, driver_id, vehicle_id,
          is_baseline_seed, notes, released_at, released_by, release_reason,
          drivers ( name ),
          vehicles ( code, name ),
          vehicle_check_photos ( id, side, storage_path, severity, ai_description, ai_diff ),
          vehicle_damage_events!vehicle_damage_events_discovered_in_check_id_fkey (
            id, side, severity, description, status, attributed_to_driver_id
          )
        `)
        .order("started_at", { ascending: false })
        .limit(200);

      if (filters.status) q = q.eq("status", filters.status);
      if (filters.vehicleId) q = q.eq("vehicle_id", filters.vehicleId);
      if (filters.driverId) q = q.eq("driver_id", filters.driverId);
      if (filters.from) q = q.gte("started_at", filters.from);
      if (filters.to) q = q.lte("started_at", filters.to);
      if (filters.releasedOnly) q = q.not("released_at", "is", null);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data ?? []).map((r: any) => ({
        id: r.id,
        started_at: r.started_at,
        completed_at: r.completed_at,
        status: r.status,
        driver_id: r.driver_id,
        driver_name: r.drivers?.name ?? null,
        vehicle_id: r.vehicle_id,
        vehicle_code: r.vehicles?.code ?? null,
        vehicle_name: r.vehicles?.name ?? null,
        is_baseline_seed: r.is_baseline_seed,
        notes: r.notes,
        released_at: r.released_at ?? null,
        released_by: r.released_by ?? null,
        release_reason: r.release_reason ?? null,
        photos: r.vehicle_check_photos ?? [],
        damage_events: r.vehicle_damage_events ?? [],
      })) as VehicleCheckHistoryRow[];

      if (filters.onlyOpenDamage) {
        rows = rows.filter((r) => r.damage_events.some((d) => d.status === "OPEN"));
      }

      return rows;
    },
  });
}

export function useReleaseVehicleCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { checkId: string; reason?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("vehicle_checks")
        .update({
          status: "RELEASED",
          released_at: new Date().toISOString(),
          released_by: user?.id ?? null,
          release_reason: args.reason ?? null,
        })
        .eq("id", args.checkId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle-check-history"] }),
  });
}

/**
 * Ophalen van een signed URL voor weergave (thumbnails). 5 minuten geldig.
 * Losstaand behouden voor backwards compat op andere plekken.
 */
export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("vehicle-checks")
    .createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

/**
 * Bulk signed URLs voor alle zichtbare foto's in een keer.
 * Retourneert een map van storage_path naar signedUrl.
 */
export function useBulkSignedPhotoUrls(paths: string[]) {
  const key = paths.slice().sort().join("|");
  return useQuery({
    queryKey: ["vehicle-check-signed-urls", key],
    enabled: paths.length > 0,
    staleTime: 240_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage
        .from("vehicle-checks")
        .createSignedUrls(paths, 300);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((d: any) => {
        if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      });
      return map;
    },
  });
}

export interface DamageEventRow {
  id: string;
  vehicle_id: string;
  discovered_in_check_id: string;
  side: string;
  severity: "minor" | "blocking";
  description: string | null;
  photo_path: string | null;
  status: "OPEN" | "ACKNOWLEDGED" | "DISPUTED" | "REPAIRED";
  attributed_to_driver_id: string | null;
  attributed_driver_name: string | null;
  repaired_at: string | null;
  repair_notes: string | null;
  created_at: string;
}

export function useVehicleDamageHistory(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-damage-history", vehicleId],
    enabled: !!vehicleId,
    staleTime: 15_000,
    queryFn: async (): Promise<DamageEventRow[]> => {
      const { data, error } = await (supabase as any)
        .from("vehicle_damage_events")
        .select(`
          id, vehicle_id, discovered_in_check_id, side, severity, description,
          photo_path, status, attributed_to_driver_id, repaired_at, repair_notes, created_at,
          drivers:attributed_to_driver_id ( name )
        `)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        attributed_driver_name: r.drivers?.name ?? null,
      }));
    },
  });
}

export function useMarkDamageRepaired() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { damageId: string; notes?: string }) => {
      const { error } = await (supabase as any)
        .from("vehicle_damage_events")
        .update({
          status: "REPAIRED",
          repaired_at: new Date().toISOString(),
          repair_notes: args.notes ?? null,
        })
        .eq("id", args.damageId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle-damage-history"] });
      qc.invalidateQueries({ queryKey: ["vehicle-check-history"] });
    },
  });
}

/**
 * Count van DAMAGE_FOUND-checks die nog niet vrijgegeven zijn.
 */
export function usePendingReleaseCount() {
  return useQuery({
    queryKey: ["vehicle-checks-pending-release-count"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from("vehicle_checks")
        .select("id", { count: "exact", head: true })
        .eq("status", "DAMAGE_FOUND");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
