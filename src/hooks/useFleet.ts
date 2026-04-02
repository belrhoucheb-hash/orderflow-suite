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
    staleTime: 60_000,
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
    staleTime: 60_000,
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
    staleTime: 60_000,
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
    staleTime: 60_000,
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
    staleTime: 60_000,
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

/**
 * Fetches real utilization data per vehicle based on active trips.
 * Calculates: total weight of orders on active trips / vehicle max_weight * 100
 */
export function useVehicleUtilization() {
  return useQuery({
    queryKey: ["vehicle-utilization"],
    queryFn: async () => {
      // Get all active trips (ACTIEF or VERZONDEN) with their stops and linked orders
      const { data: trips, error: tripsError } = await supabase
        .from("trips")
        .select("vehicle_id, trip_stops(order_id)")
        .in("dispatch_status", ["ACTIEF", "VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"]);

      if (tripsError) throw tripsError;
      if (!trips || trips.length === 0) return {} as Record<string, number>;

      // Collect all order_ids grouped by vehicle_id
      const vehicleOrderIds: Record<string, Set<string>> = {};
      for (const trip of trips) {
        const vid = trip.vehicle_id;
        if (!vid) continue;
        if (!vehicleOrderIds[vid]) vehicleOrderIds[vid] = new Set();
        const stops = (trip as any).trip_stops || [];
        for (const stop of stops) {
          if (stop.order_id) vehicleOrderIds[vid].add(stop.order_id);
        }
      }

      // Get all unique order IDs
      const allOrderIds = [...new Set(Object.values(vehicleOrderIds).flatMap(s => [...s]))];
      if (allOrderIds.length === 0) return {} as Record<string, number>;

      // Fetch weight for those orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select("id, weight_kg")
        .in("id", allOrderIds);

      if (ordersError) throw ordersError;

      const orderWeights: Record<string, number> = {};
      for (const o of orders || []) {
        orderWeights[o.id] = o.weight_kg || 0;
      }

      // Fetch vehicle capacities
      const vehicleIds = Object.keys(vehicleOrderIds);
      const { data: vehicles, error: vError } = await supabase
        .from("vehicles")
        .select("id, capacity_kg")
        .in("id", vehicleIds);

      if (vError) throw vError;

      const capacities: Record<string, number> = {};
      for (const v of vehicles || []) {
        capacities[v.id] = v.capacity_kg || 0;
      }

      // Calculate utilization per vehicle
      const utilization: Record<string, number> = {};
      for (const [vid, orderIds] of Object.entries(vehicleOrderIds)) {
        const totalWeight = [...orderIds].reduce((sum, oid) => sum + (orderWeights[oid] || 0), 0);
        const capacity = capacities[vid] || 0;
        utilization[vid] = capacity > 0 ? Math.min(100, Math.round((totalWeight / capacity) * 100)) : 0;
      }

      return utilization;
    },
    refetchInterval: 30_000, // refresh every 30s
  });
}
