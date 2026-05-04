import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";

/**
 * Chauffeur-eigen beschikbaarheid in /chauffeur. Gebruikt dezelfde tabel
 * `driver_availability` als de planner, maar met de driver-eigen statusset
 * (beschikbaar / niet_beschikbaar / liever_niet) die door migratie
 * 20260504210000 is toegestaan.
 *
 * Wat de planner zelf had ingevoerd (werkt/verlof/ziek/rust/afwezig) blijft
 * staan; deze hook leest gewoon de status terug en mapt onbekende waarden
 * naar 'beschikbaar' (default voor de UI).
 */

export type DriverSelfStatus = "beschikbaar" | "niet_beschikbaar" | "liever_niet";

const DRIVER_SELF_STATUSES: DriverSelfStatus[] = [
  "beschikbaar",
  "niet_beschikbaar",
  "liever_niet",
];

export interface DriverAvailabilityRow {
  id: string;
  tenant_id: string;
  driver_id: string;
  date: string;
  status: string;
  reason: string | null;
}

function isDriverSelfStatus(value: string | null | undefined): value is DriverSelfStatus {
  return !!value && (DRIVER_SELF_STATUSES as string[]).includes(value);
}

/**
 * Map planner-statussen naar de chauffeur-statusset zodat de driver-UI
 * altijd één van drie waardes laat zien.
 */
export function plannerToSelf(status: string | null | undefined): DriverSelfStatus {
  if (isDriverSelfStatus(status)) return status;
  switch (status) {
    case "werkt":
      return "beschikbaar";
    case "verlof":
    case "ziek":
    case "afwezig":
      return "niet_beschikbaar";
    case "rust":
      return "liever_niet";
    default:
      return "beschikbaar";
  }
}

const rangeKey = (driverId: string | null | undefined, from: string | null, to: string | null) =>
  ["driver_self_availability", driverId ?? "none", from ?? "", to ?? ""] as const;

export function useDriverSelfAvailabilityRange(
  driverId: string | null | undefined,
  fromDate: string | null,
  toDate: string | null,
) {
  return useQuery<DriverAvailabilityRow[]>({
    queryKey: rangeKey(driverId, fromDate, toDate),
    enabled: !!driverId && !!fromDate && !!toDate,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_availability" as any)
        .select("id, tenant_id, driver_id, date, status, reason")
        .eq("driver_id", driverId!)
        .gte("date", fromDate!)
        .lte("date", toDate!)
        .order("date");
      if (error) throw error;
      return (data ?? []) as unknown as DriverAvailabilityRow[];
    },
  });
}

export function useSaveDriverSelfAvailability(driverId: string | null | undefined) {
  const qc = useQueryClient();
  const insert = useTenantInsert("driver_availability");
  return useMutation({
    mutationFn: async (input: { date: string; status: DriverSelfStatus; reason?: string | null }) => {
      if (!driverId) throw new Error("Geen actieve chauffeur");
      const payload = {
        driver_id: driverId,
        date: input.date,
        status: input.status,
        reason: input.reason ?? null,
      };
      const { data, error } = await insert
        .upsert(payload, { onConflict: "tenant_id,driver_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as DriverAvailabilityRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["driver_self_availability", driverId] });
      qc.invalidateQueries({ queryKey: ["driver_availability"] });
      qc.invalidateQueries({ queryKey: ["driver_availability_range"] });
    },
  });
}
