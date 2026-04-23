import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";

export type EmploymentType = "vast" | "flex" | "ingehuurd" | "zzp" | "uitzendkracht";
export type LegitimationType = "rijbewijs" | "paspoort" | "id-kaart";
export type EmergencyRelation = "partner" | "ouder" | "kind" | "broer-zus" | "overig";

export interface Driver {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  legitimation_type: LegitimationType | null;
  legitimation_expiry_date: string | null;
  code95_expiry_date: string | null;
  certifications: string[];
  work_types: string[];
  status: string;
  current_vehicle_id: string | null;
  is_active: boolean;
  contract_hours_per_week: number | null;
  employment_type: EmploymentType;
  birth_date: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;

  street: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  zipcode: string | null;
  city: string | null;
  country: string | null;

  bsn: string | null;
  iban: string | null;
  personnel_number: string | null;

  hire_date: string | null;
  termination_date: string | null;

  created_at: string;
  updated_at: string;
}

export interface DriverCertificationExpiry {
  id: string;
  tenant_id: string;
  driver_id: string;
  certification_code: string;
  issued_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useDrivers() {
  const queryClient = useQueryClient();
  const driversInsert = useTenantInsert("drivers");

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
      const { data, error } = await driversInsert
        .insert({ ...newDriver })
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

export function useDriverCertificationExpiry(driverId: string | null) {
  const queryClient = useQueryClient();
  const expiryInsert = useTenantInsert("driver_certification_expiry");

  const query = useQuery({
    queryKey: ["driver_cert_expiry", driverId],
    enabled: !!driverId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_certification_expiry" as any)
        .select("*")
        .eq("driver_id", driverId!)
        .order("certification_code");
      if (error) throw error;
      return data as any as DriverCertificationExpiry[];
    },
  });

  const upsertExpiry = useMutation({
    mutationFn: async (input: {
      driver_id: string;
      certification_code: string;
      issued_date?: string | null;
      expiry_date?: string | null;
    }) => {
      const { data: existing } = await supabase
        .from("driver_certification_expiry" as any)
        .select("id")
        .eq("driver_id", input.driver_id)
        .eq("certification_code", input.certification_code)
        .maybeSingle();

      if (existing) {
        const { data, error } = await supabase
          .from("driver_certification_expiry" as any)
          .update({
            issued_date: input.issued_date ?? null,
            expiry_date: input.expiry_date ?? null,
          })
          .eq("id", (existing as any).id)
          .select()
          .single();
        if (error) throw error;
        return data as any as DriverCertificationExpiry;
      }

      const { data, error } = await expiryInsert
        .insert({
          driver_id: input.driver_id,
          certification_code: input.certification_code,
          issued_date: input.issued_date ?? null,
          expiry_date: input.expiry_date ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as any as DriverCertificationExpiry;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["driver_cert_expiry", row.driver_id] });
    },
  });

  const deleteExpiry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_certification_expiry" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver_cert_expiry", driverId] });
    },
  });

  return { ...query, upsertExpiry, deleteExpiry };
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
