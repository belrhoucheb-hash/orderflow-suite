import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";
import type { DriverCountryRestrictionType } from "@/lib/driverCountryRestrictions";
import { normalizeCountryCode } from "@/lib/driverCountryRestrictions";

export interface DriverCountryRestriction {
  id: string;
  tenant_id: string;
  driver_id: string;
  country_code: string;
  restriction_type: DriverCountryRestrictionType;
  reason: string | null;
  active_from: string | null;
  active_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertDriverCountryRestrictionInput {
  id?: string;
  driver_id: string;
  country_code: string;
  restriction_type: DriverCountryRestrictionType;
  reason?: string | null;
  active_from?: string | null;
  active_until?: string | null;
  is_active?: boolean;
}

export function useDriverCountryRestrictions(driverId: string | null | undefined) {
  const queryClient = useQueryClient();
  const restrictionsInsert = useTenantInsert("driver_country_restrictions");

  const query = useQuery({
    queryKey: ["driver-country-restrictions", driverId],
    enabled: !!driverId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_country_restrictions" as any)
        .select("*")
        .eq("driver_id", driverId!)
        .order("country_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DriverCountryRestriction[];
    },
  });

  const upsertRestriction = useMutation({
    mutationFn: async (input: UpsertDriverCountryRestrictionInput) => {
      const countryCode = normalizeCountryCode(input.country_code);
      if (!countryCode) throw new Error("Kies een geldig land");
      const payload = {
        driver_id: input.driver_id,
        country_code: countryCode,
        restriction_type: input.restriction_type,
        reason: input.reason?.trim() || null,
        active_from: input.active_from || null,
        active_until: input.active_until || null,
        is_active: input.is_active ?? true,
      };

      const queryBuilder = input.id
        ? supabase.from("driver_country_restrictions" as any).update(payload).eq("id", input.id)
        : restrictionsInsert.upsert(payload, { onConflict: "tenant_id,driver_id,country_code" });

      const { data, error } = await queryBuilder.select().single();
      if (error) throw error;
      return data as DriverCountryRestriction;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["driver-country-restrictions", row.driver_id] });
      queryClient.invalidateQueries({ queryKey: ["driver-country-restrictions", "all"] });
    },
  });

  const deleteRestriction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_country_restrictions" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-country-restrictions", driverId] });
      queryClient.invalidateQueries({ queryKey: ["driver-country-restrictions", "all"] });
    },
  });

  return { ...query, upsertRestriction, deleteRestriction };
}

export function useAllDriverCountryRestrictions() {
  return useQuery({
    queryKey: ["driver-country-restrictions", "all"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_country_restrictions" as any)
        .select("*")
        .eq("is_active", true)
        .order("driver_id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DriverCountryRestriction[];
    },
  });
}
