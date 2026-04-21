import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";
import {
  vehicleRowSchema,
  vehicleDocumentRowSchema,
  vehicleMaintenanceRowSchema,
  vehicleMaintenanceWithVehicleRowSchema,
  vehicleAvailabilityRowSchema,
  parseRow,
  parseRows,
  type VehicleRow,
  type VehicleDocumentRow,
  type VehicleMaintenanceRow,
  type VehicleMaintenanceWithVehicleRow,
  type VehicleAvailabilityRow,
} from "@/lib/validation/vehicleDbSchema";

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
  features: string[];
  status: string;
  assignedDriver: string | null;
  fuelConsumption: number | null;
  isActive: boolean;
}

/**
 * De interfaces hieronder zijn afgeleid van de DB-rowschemas
 * zodat schema en type per definitie in sync blijven. De oude
 * handmatige interfaces worden zo vervangen zonder breaking change:
 * alle consumers gebruikten dezelfde snake_case velden.
 */
export type VehicleDocument = VehicleDocumentRow;
export type VehicleMaintenance = VehicleMaintenanceRow;
export type VehicleAvailability = VehicleAvailabilityRow;

function vehicleRowToVehicle(v: VehicleRow): Vehicle {
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    plate: v.plate,
    type: v.type,
    brand: v.brand ?? null,
    buildYear: v.build_year ?? null,
    capacityKg: v.capacity_kg ?? 0,
    capacityPallets: v.capacity_pallets ?? 0,
    features: v.features ?? [],
    status: v.status ?? "beschikbaar",
    assignedDriver: v.assigned_driver ?? null,
    fuelConsumption: v.fuel_consumption ?? null,
    isActive: v.is_active,
  };
}

export function useFleetVehicles() {
  return useQuery({
    queryKey: ["fleet-vehicles"],
    staleTime: 60_000,
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .order("type", { ascending: true });
      if (error) throw error;
      const rows = parseRows(vehicleRowSchema, data, "voertuigen ophalen");
      return rows.map(vehicleRowToVehicle);
    },
  });
}

export function useVehicleById(id: string | undefined) {
  return useQuery({
    queryKey: ["fleet-vehicle", id],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Vehicle> => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const row = parseRow(vehicleRowSchema, data, "voertuig ophalen");
      return vehicleRowToVehicle(row);
    },
  });
}

export function useVehicleDocuments(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-documents", vehicleId],
    enabled: !!vehicleId,
    staleTime: 60_000,
    queryFn: async (): Promise<VehicleDocument[]> => {
      const { data, error } = await supabase
        .from("vehicle_documents")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return parseRows(vehicleDocumentRowSchema, data, "documenten ophalen");
    },
  });
}

export function useVehicleMaintenance(vehicleId: string | undefined) {
  return useQuery({
    queryKey: ["vehicle-maintenance", vehicleId],
    enabled: !!vehicleId,
    staleTime: 60_000,
    queryFn: async (): Promise<VehicleMaintenance[]> => {
      const { data, error } = await supabase
        .from("vehicle_maintenance")
        .select("*")
        .eq("vehicle_id", vehicleId!)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return parseRows(vehicleMaintenanceRowSchema, data, "onderhoud ophalen");
    },
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  const maintenanceInsert = useTenantInsert("vehicle_maintenance");
  return useMutation({
    mutationFn: async (data: {
      vehicle_id: string;
      maintenance_type: string;
      scheduled_date: string;
      cost?: number;
      description?: string;
    }) => {
      const { error } = await maintenanceInsert.insert({ ...data });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-maintenance", vars.vehicle_id] });
      qc.invalidateQueries({ queryKey: ["overdue-maintenance"] });
    },
  });
}

export function useCompleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await supabase
        .from("vehicle_maintenance")
        .update({ completed_date: new Date().toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
      return vehicleId;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-maintenance", vars.vehicleId] });
      qc.invalidateQueries({ queryKey: ["overdue-maintenance"] });
    },
  });
}

export function useUpcomingMaintenance() {
  return useQuery({
    queryKey: ["overdue-maintenance"],
    staleTime: 60_000,
    queryFn: async (): Promise<VehicleMaintenanceWithVehicleRow[]> => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("vehicle_maintenance")
        .select("*, vehicles(name, plate)")
        .is("completed_date", null)
        .lte("scheduled_date", today)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return parseRows(
        vehicleMaintenanceWithVehicleRowSchema,
        data,
        "openstaand onderhoud ophalen",
      );
    },
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  const documentInsert = useTenantInsert("vehicle_documents");
  return useMutation({
    mutationFn: async (data: {
      vehicle_id: string;
      doc_type: string;
      expiry_date?: string;
      notes?: string;
    }) => {
      const { error } = await documentInsert.insert({ ...data });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-documents", vars.vehicle_id] });
    },
  });
}

export function useVehicleAvailability(vehicleId: string | undefined, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["vehicle-availability", vehicleId, startDate, endDate],
    enabled: !!vehicleId,
    staleTime: 60_000,
    queryFn: async (): Promise<VehicleAvailability[]> => {
      let query = supabase
        .from("vehicle_availability")
        .select("*")
        .eq("vehicle_id", vehicleId!);
      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);
      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;
      return parseRows(
        vehicleAvailabilityRowSchema,
        data,
        "beschikbaarheid ophalen",
      );
    },
  });
}

export function useAddVehicle() {
  const qc = useQueryClient();
  const vehiclesInsert = useTenantInsert("vehicles");
  return useMutation({
    mutationFn: async (vehicle: {
      code: string; name: string; plate: string; type: string;
      brand?: string; build_year?: number;
      capacity_kg?: number; capacity_pallets?: number;
      features?: string[]; status?: string; assigned_driver?: string;
    }) => {
      const { error } = await vehiclesInsert.insert({ ...vehicle });
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

export interface VehicleDriverWarning {
  warning?: string;
  tripDriver?: string;
}

/**
 * Signaleert per voertuig of de toegewezen chauffeur (vehicles.assigned_driver)
 * niet matcht met de chauffeur van een actieve trip, of dat dezelfde chauffeur
 * op meerdere voertuigen tegelijk staat. Leest de vehicles-lijst uit de cache
 * en doet een enkele trips-query (geen n+1).
 */
export function useVehicleDriverConsistency() {
  const { data: vehicles } = useFleetVehicles();
  return useQuery({
    queryKey: ["vehicle-driver-consistency", vehicles?.map((v) => v.id).sort().join(",")],
    enabled: !!vehicles && vehicles.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const result: Record<string, VehicleDriverWarning> = {};
      if (!vehicles || vehicles.length === 0) return result;

      const vehicleIds = vehicles.map((v) => v.id);

      const { data: trips, error: tripsError } = await supabase
        .from("trips")
        .select("vehicle_id, driver_id")
        .in("dispatch_status", ["ACTIEF", "VERZONDEN", "ONTVANGEN", "GEACCEPTEERD"])
        .in("vehicle_id", vehicleIds);
      if (tripsError) throw tripsError;

      const driverIds = new Set<string>();
      for (const t of trips ?? []) {
        if (t.driver_id) driverIds.add(t.driver_id);
      }

      const driverNames: Record<string, string> = {};
      if (driverIds.size > 0) {
        const { data: drivers, error: driversError } = await supabase
          .from("drivers" as any)
          .select("id, name")
          .in("id", [...driverIds]);
        if (driversError) throw driversError;
        for (const d of (drivers as any[]) ?? []) {
          driverNames[d.id] = d.name;
        }
      }

      // Actieve trip per voertuig (eerste match volstaat, zelden meer dan één)
      const tripDriverByVehicle: Record<string, string | null> = {};
      for (const t of trips ?? []) {
        if (!t.vehicle_id) continue;
        if (!(t.vehicle_id in tripDriverByVehicle)) {
          tripDriverByVehicle[t.vehicle_id] = t.driver_id ?? null;
        }
      }

      // Voertuigen gegroepeerd op assigned_driver om dubbele toewijzing te vinden
      const vehiclesByDriver: Record<string, string[]> = {};
      for (const v of vehicles) {
        if (!v.assignedDriver) continue;
        const key = v.assignedDriver.trim().toLowerCase();
        if (!vehiclesByDriver[key]) vehiclesByDriver[key] = [];
        vehiclesByDriver[key].push(v.name);
      }

      for (const v of vehicles) {
        const entry: VehicleDriverWarning = {};

        const tripDriverId = tripDriverByVehicle[v.id];
        if (tripDriverId) {
          const tripDriverName = driverNames[tripDriverId] || null;
          if (tripDriverName) entry.tripDriver = tripDriverName;
          if (v.assignedDriver && tripDriverName) {
            const a = v.assignedDriver.trim().toLowerCase();
            const b = tripDriverName.trim().toLowerCase();
            if (a !== b) {
              entry.warning = `Voertuig staat op chauffeur ${v.assignedDriver} maar actieve trip is toegewezen aan ${tripDriverName}`;
            }
          } else if (!v.assignedDriver && tripDriverName) {
            entry.warning = `Actieve trip is toegewezen aan ${tripDriverName} maar geen chauffeur gekoppeld aan voertuig`;
          }
        }

        if (!entry.warning && v.assignedDriver) {
          const key = v.assignedDriver.trim().toLowerCase();
          const others = (vehiclesByDriver[key] || []).filter((n) => n !== v.name);
          if (others.length > 0) {
            entry.warning = `Chauffeur ${v.assignedDriver} is ook toegewezen aan voertuig ${others.join(", ")}`;
          }
        }

        if (entry.warning || entry.tripDriver) {
          result[v.id] = entry;
        }
      }

      return result;
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
