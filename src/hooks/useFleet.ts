import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vehicle {
  id: string;
  code: string;
  name: string;
  plate: string;
  type: string;
  brand: string | null;
  buildYear: number | null;
  capacityKg: number;
  capacityPallets: number;
  cargoLengthCm: number | null;
  cargoWidthCm: number | null;
  cargoHeightCm: number | null;
  features: string[];
  status: string;
  assignedDriver: string | null;
  fuelConsumption: number | null;
  isActive: boolean;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  doc_type: string;
  expiry_date: string | null;
  file_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface VehicleMaintenance {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  description: string | null;
  mileage_km: number | null;
  scheduled_date: string | null;
  completed_date: string | null;
  cost: number | null;
  created_at: string;
}

export interface VehicleAvailability {
  id: string;
  vehicle_id: string;
  date: string;
  status: string;
  reason: string | null;
}

export function useFleetVehicles() {
  return useQuery({
    queryKey: ["fleet-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("type", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((v: any) => ({
        id: v.id,
        code: v.code,
        name: v.name,
        plate: v.plate,
        type: v.type,
        brand: v.brand,
        buildYear: v.build_year,
        capacityKg: v.capacity_kg,
        capacityPallets: v.capacity_pallets,
        cargoLengthCm: v.cargo_length_cm,
        cargoWidthCm: v.cargo_width_cm,
        cargoHeightCm: v.cargo_height_cm,
        features: v.features ?? [],
        status: v.status ?? "beschikbaar",
        assignedDriver: v.assigned_driver,
        fuelConsumption: v.fuel_consumption,
        isActive: v.is_active,
      })) as Vehicle[];
    },
  });
}

export function useVehicleById(id: string | undefined) {
  return useQuery({
    queryKey: ["fleet-vehicle", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const v = data as any;
      return {
        id: v.id,
        code: v.code,
        name: v.name,
        plate: v.plate,
        type: v.type,
        brand: v.brand,
        buildYear: v.build_year,
        capacityKg: v.capacity_kg,
        capacityPallets: v.capacity_pallets,
        cargoLengthCm: v.cargo_length_cm,
        cargoWidthCm: v.cargo_width_cm,
        cargoHeightCm: v.cargo_height_cm,
        features: v.features ?? [],
        status: v.status ?? "beschikbaar",
        assignedDriver: v.assigned_driver,
        fuelConsumption: v.fuel_consumption,
        isActive: v.is_active,
      } as Vehicle;
    },
  });
}

export function useVehicleDocuments(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-documents", vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_documents")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data as VehicleDocument[];
    },
  });
}

export function useVehicleMaintenance(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-maintenance", vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_maintenance")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data as VehicleMaintenance[];
    },
  });
}

export function useVehicleAvailability(vehicleId: string | undefined, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["vehicle-availability", vehicleId, startDate, endDate],
    enabled: !!vehicleId,
    queryFn: async () => {
      let query = supabase
        .from("vehicle_availability")
        .select("*")
        .eq("vehicle_id", vehicleId!);
      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);
      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;
      return data as VehicleAvailability[];
    },
  });
}

export function useAddVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vehicle: {
      code: string; name: string; plate: string; type: string;
      brand?: string; build_year?: number;
      capacity_kg?: number; capacity_pallets?: number;
      cargo_length_cm?: number; cargo_width_cm?: number; cargo_height_cm?: number;
      features?: string[]; status?: string; assigned_driver?: string;
    }) => {
      const { error } = await supabase.from("vehicles").insert(vehicle);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fleet-vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { error } = await supabase.from("vehicles").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      qc.invalidateQueries({ queryKey: ["fleet-vehicle"] });
    },
  });
}
