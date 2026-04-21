import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EmploymentType = "vast" | "flex" | "ingehuurd";

export interface Driver {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  certifications: string[];
  status: string;
  current_vehicle_id: string | null;
  is_active: boolean;
  contract_hours_per_week: number | null;
  employment_type: EmploymentType;
  created_at: string;
  updated_at: string;
}

export function useDrivers() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["drivers"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers" as any)
        .select("*")
        .order("name");

      if (error) throw error;
      return data as any as Driver[];
    },
  });

  const createDriver = useMutation({
    mutationFn: async (newDriver: Partial<Driver>) => {
      const { data, error } = await supabase
        .from("drivers" as any)
        .insert([newDriver])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });

  const updateDriver = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Driver> & { id: string }) => {
      const { data, error } = await supabase
        .from("drivers" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
  });

  return {
    ...query,
    createDriver,
    updateDriver,
    deleteDriver,
  };
}

export function useAvailableDrivers(requiredCertifications: string[] = []) {
  return useQuery({
    queryKey: ["drivers", "available", requiredCertifications],
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("drivers" as any)
        .select("*")
        .eq("status", "beschikbaar")
        .eq("is_active", true);

      if (requiredCertifications.length > 0) {
        query = query.contains("certifications", requiredCertifications);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;
      return data as any as Driver[];
    },
  });
}
