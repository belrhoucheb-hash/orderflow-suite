import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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
        .is("deleted_at", null)
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

const VEHICLE_DOCUMENTS_BUCKET = "vehicle-documents";

async function uploadVehicleDocumentFile(
  file: File,
  tenantId: string,
  vehicleId: string,
): Promise<{ path: string; name: string }> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const uuid = crypto.randomUUID();
  const path = `${tenantId}/${vehicleId}/${uuid}.${ext}`;
  const { error } = await supabase.storage.from(VEHICLE_DOCUMENTS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name };
}

async function removeVehicleDocumentFile(path: string | null) {
  if (!path) return;
  // Legacy file_url kan een externe URL zijn in plaats van een bucket-pad.
  // Alleen wissen als het het {uuid}-bucketformaat lijkt te zijn.
  if (/^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(VEHICLE_DOCUMENTS_BUCKET).remove([path]);
  if (error) throw error;
}

export function useCreateDocument() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const documentInsert = useTenantInsert("vehicle_documents");
  return useMutation({
    mutationFn: async (data: {
      vehicle_id: string;
      doc_type: string;
      issued_date?: string | null;
      expiry_date?: string | null;
      notes?: string | null;
      file: File | null;
    }) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");

      let filePath: string | null = null;
      let fileName: string | null = null;
      if (data.file) {
        const uploaded = await uploadVehicleDocumentFile(data.file, tenant.id, data.vehicle_id);
        filePath = uploaded.path;
        fileName = uploaded.name;
      }

      const payload: Record<string, unknown> = {
        vehicle_id: data.vehicle_id,
        doc_type: data.doc_type,
        issued_date: data.issued_date || null,
        expiry_date: data.expiry_date || null,
        notes: data.notes?.trim() || null,
      };
      if (filePath) payload.file_url = filePath;
      if (fileName) payload.document_name = fileName;

      const { error } = await documentInsert.insert(payload);
      if (error) {
        if (filePath) await removeVehicleDocumentFile(filePath).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-documents", vars.vehicle_id] });
    },
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      vehicle_id: string;
      previous_document_url: string | null;
      issued_date?: string | null;
      expiry_date?: string | null;
      notes?: string | null;
      file: File | null;
    }) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");
      const patch: Record<string, unknown> = {};
      if (data.issued_date !== undefined) patch.issued_date = data.issued_date || null;
      if (data.expiry_date !== undefined) patch.expiry_date = data.expiry_date || null;
      if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

      if (data.file) {
        const uploaded = await uploadVehicleDocumentFile(data.file, tenant.id, data.vehicle_id);
        patch.file_url = uploaded.path;
        patch.document_name = uploaded.name;
      }

      const { error } = await supabase
        .from("vehicle_documents")
        .update(patch)
        .eq("id", data.id);
      if (error) throw error;

      if (data.file && data.previous_document_url) {
        await removeVehicleDocumentFile(data.previous_document_url).catch(() => undefined);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-documents", vars.vehicle_id] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: string;
      vehicle_id: string;
      document_url: string | null;
    }) => {
      // Soft-delete: rij blijft bewaard voor fiscale bewaarplicht (7 jaar),
      // inclusief het bestand in Supabase Storage. Alleen onzichtbaar in de UI.
      const { error } = await supabase
        .from("vehicle_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-documents", vars.vehicle_id] });
    },
  });
}

/**
 * Genereer een signed URL (5 minuten geldig) voor het downloaden van
 * een voertuig-document. Signed omdat de bucket privé is en we niet
 * willen dat links persistent bruikbaar zijn als ze uitlekken.
 */
export async function getVehicleDocumentDownloadUrl(path: string): Promise<string> {
  // Legacy rows kunnen een externe URL bevatten in plaats van een bucket-path.
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(VEHICLE_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Kon geen download-link maken voor het document: ${error?.message ?? "onbekende fout"}`,
    );
  }
  return data.signedUrl;
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
      name: string; plate: string; type: string;
      code?: string; brand?: string; build_year?: number;
      capacity_kg?: number; capacity_pallets?: number;
      load_length_cm?: number; load_width_cm?: number; load_height_cm?: number;
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

/**
 * Soft-delete van een voertuig. Rij blijft in de DB met deleted_at gezet,
 * zodat historische trips, orders en facturen bereikbaar blijven voor de
 * fiscale bewaarplicht (7 jaar, art. 52 AWR). De UI filtert deleted_at IS NULL.
 */
export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vehicles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["fleet-vehicles"] });
      qc.invalidateQueries({ queryKey: ["fleet-vehicle", id] });
      qc.invalidateQueries({ queryKey: ["vehicle-utilization"] });
      qc.invalidateQueries({ queryKey: ["overdue-maintenance"] });
    },
  });
}

/**
 * Soft-delete van een onderhoudsregel. Blijft bewaard voor de 7-jaar
 * bewaarplicht op onderhoudsfacturen.
 */
export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; vehicleId: string }) => {
      const { error } = await supabase
        .from("vehicle_maintenance")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["vehicle-maintenance", vars.vehicleId] });
      qc.invalidateQueries({ queryKey: ["overdue-maintenance"] });
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
