import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isGatePassed, type VehicleCheckForGate } from "@/lib/vehicleCheckGate";

export type PhotoSide =
  | "front" | "rear" | "left" | "right"
  | "interior_front" | "interior_cargo"
  | "dashboard" | "klep" | "koelunit";

export const REQUIRED_SIDES: PhotoSide[] = [
  "front", "rear", "left", "right", "interior_front", "interior_cargo", "dashboard",
];

export const OPTIONAL_SIDES: PhotoSide[] = ["klep", "koelunit"];

export interface VehicleCheckPhoto {
  id: string;
  check_id: string;
  side: PhotoSide;
  storage_path: string;
  ai_description: string | null;
  ai_diff: string | null;
  severity: "none" | "minor" | "blocking";
  baseline_photo_id: string | null;
  confidence?: number | null;
  driver_note?: string | null;
}

export interface VehicleCheck {
  id: string;
  tenant_id: string;
  driver_id: string;
  vehicle_id: string;
  started_at: string;
  completed_at: string | null;
  checklist: Record<string, boolean>;
  notes: string | null;
  signature_url: string | null;
  ai_summary: string | null;
  status: "PENDING" | "OK" | "DAMAGE_FOUND" | "RELEASED";
}

const gateKey = (driverId: string, vehicleId: string) =>
  ["vehicle-check-gate", driverId, vehicleId] as const;

async function fetchLatestCheck(
  driverId: string,
  vehicleId: string,
): Promise<VehicleCheck | null> {
  const { data, error } = await (supabase as any)
    .from("vehicle_checks")
    .select("*")
    .eq("driver_id", driverId)
    .eq("vehicle_id", vehicleId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as VehicleCheck) ?? null;
}

export interface Baseline {
  checkId: string | null;
  photos: VehicleCheckPhoto[];
}

async function fetchBaseline(vehicleId: string): Promise<Baseline> {
  // Laatste OK/RELEASED check voor dit voertuig (ongeacht chauffeur, ook
  // baseline-seeds tellen) — dat is de baseline.
  const { data: check, error } = await (supabase as any)
    .from("vehicle_checks")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .in("status", ["OK", "RELEASED"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!check) return { checkId: null, photos: [] };
  const { data: photos, error: pErr } = await (supabase as any)
    .from("vehicle_check_photos")
    .select("*")
    .eq("check_id", check.id);
  if (pErr) throw pErr;
  return { checkId: check.id as string, photos: (photos ?? []) as VehicleCheckPhoto[] };
}

/**
 * Gate voor ChauffeurApp: mag chauffeur vandaag orders zien?
 */
export function useVehicleCheckGate(driverId: string | null, vehicleId: string | null) {
  return useQuery({
    queryKey: gateKey(driverId ?? "", vehicleId ?? ""),
    enabled: !!driverId && !!vehicleId,
    staleTime: 30_000,
    queryFn: async () => {
      const check = await fetchLatestCheck(driverId!, vehicleId!);
      const forGate: VehicleCheckForGate | null = check
        ? { status: check.status, completed_at: check.completed_at }
        : null;
      return { passed: isGatePassed(forGate), latest: check };
    },
  });
}

export interface BaselineInfo {
  checkId: string | null;
  completedAt: string | null;
  isBaselineSeed: boolean;
  vehicleTenantId: string | null;
}

/**
 * Info voor admin-UI: wanneer is de laatste baseline gezet en welke tenant
 * hoort bij het voertuig.
 */
export function useBaselineInfo(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle-baseline-info", vehicleId ?? ""],
    enabled: !!vehicleId,
    staleTime: 30_000,
    queryFn: async (): Promise<BaselineInfo> => {
      const { data: veh, error: vErr } = await (supabase as any)
        .from("vehicles")
        .select("tenant_id")
        .eq("id", vehicleId!)
        .maybeSingle();
      if (vErr) throw vErr;

      const { data: check, error } = await (supabase as any)
        .from("vehicle_checks")
        .select("id, completed_at, is_baseline_seed")
        .eq("vehicle_id", vehicleId!)
        .in("status", ["OK", "RELEASED"])
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        checkId: (check?.id as string) ?? null,
        completedAt: (check?.completed_at as string) ?? null,
        isBaselineSeed: !!check?.is_baseline_seed,
        vehicleTenantId: (veh?.tenant_id as string) ?? null,
      };
    },
  });
}

export function useBaseline(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle-check-baseline", vehicleId ?? ""],
    enabled: !!vehicleId,
    staleTime: 60_000,
    queryFn: () => fetchBaseline(vehicleId!),
  });
}

/**
 * Start een nieuwe check (status PENDING). Retourneert de check-id.
 */
export function useStartVehicleCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      tenantId: string;
      driverId: string | null;
      vehicleId: string;
      asBaselineSeed?: boolean;
    }) => {
      const { data, error } = await (supabase as any)
        .from("vehicle_checks")
        .insert({
          tenant_id: args.tenantId,
          driver_id: args.asBaselineSeed ? null : args.driverId,
          vehicle_id: args.vehicleId,
          status: "PENDING",
          checklist: {},
          is_baseline_seed: !!args.asBaselineSeed,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_id, vars) => {
      if (vars.driverId) {
        qc.invalidateQueries({ queryKey: gateKey(vars.driverId, vars.vehicleId) });
      }
      qc.invalidateQueries({ queryKey: ["vehicle-check-baseline", vars.vehicleId] });
    },
  });
}

export interface UploadPhotoArgs {
  checkId: string;
  tenantId: string;
  side: PhotoSide;
  file: Blob;
  baselinePhotoPath?: string | null;
  baselineDescription?: string | null;
}

/**
 * Upload foto naar storage, roept edge function aan voor AI-analyse,
 * slaat rij op in vehicle_check_photos.
 */
export function useUploadCheckPhoto() {
  return useMutation({
    mutationFn: async (args: UploadPhotoArgs): Promise<VehicleCheckPhoto> => {
      const path = `${args.tenantId}/${args.checkId}/${args.side}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-checks")
        .upload(path, args.file, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const { data: signed, error: urlErr } = await supabase.storage
        .from("vehicle-checks")
        .createSignedUrl(path, 300);
      if (urlErr) throw urlErr;

      let baselineUrl: string | null = null;
      if (args.baselinePhotoPath) {
        const { data: bSigned } = await supabase.storage
          .from("vehicle-checks")
          .createSignedUrl(args.baselinePhotoPath, 300);
        baselineUrl = bSigned?.signedUrl ?? null;
      }

      const { data: analysis, error: fnErr } = await supabase.functions.invoke(
        "analyze-vehicle-photo",
        {
          body: {
            photo_url: signed.signedUrl,
            side: args.side,
            baseline_photo_url: baselineUrl,
            baseline_description: args.baselineDescription ?? null,
          },
        },
      );
      if (fnErr) throw fnErr;

      const { data: row, error: rowErr } = await (supabase as any)
        .from("vehicle_check_photos")
        .insert({
          check_id: args.checkId,
          side: args.side,
          storage_path: path,
          ai_description: analysis?.description ?? null,
          ai_diff: analysis?.diff_vs_baseline ?? null,
          severity: analysis?.severity ?? "none",
          confidence: typeof analysis?.confidence === "number" ? analysis.confidence : null,
        })
        .select("*")
        .single();
      if (rowErr) throw rowErr;
      return row as VehicleCheckPhoto;
    },
  });
}

/**
 * Sluit de check af. Severity per foto bepaalt OK vs DAMAGE_FOUND.
 * Minor/blocking foto's worden automatisch damage_events — de chauffeur
 * van de baseline-check wordt aangemerkt als mogelijke veroorzaker
 * (trigger in DB verstuurt notificatie naar planner).
 */
export function useSubmitVehicleCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      tenantId: string;
      checkId: string;
      driverId: string | null;
      vehicleId: string;
      checklist: Record<string, boolean>;
      notes?: string;
      photos: VehicleCheckPhoto[];
      driverNotes?: Partial<Record<PhotoSide, string>>;
      baselineCheckId: string | null;
      asBaselineSeed?: boolean;
    }) => {
      const hasBlocking = args.photos.some((p) => p.severity === "blocking");
      // Baseline-seed legt huidige staat vast, geen nieuwe schade: altijd OK.
      const status = args.asBaselineSeed ? "OK" : hasBlocking ? "DAMAGE_FOUND" : "OK";

      const { error } = await (supabase as any)
        .from("vehicle_checks")
        .update({
          completed_at: new Date().toISOString(),
          checklist: args.checklist,
          notes: args.notes ?? null,
          status,
          baseline_check_id: args.baselineCheckId,
        })
        .eq("id", args.checkId);
      if (error) throw error;

      // Sla chauffeur-correcties op per foto (driver_note kolom).
      if (args.driverNotes) {
        const updates = args.photos
          .filter((p) => {
            const note = args.driverNotes?.[p.side];
            return note !== undefined && note !== (p.ai_description ?? "");
          })
          .map((p) =>
            (supabase as any)
              .from("vehicle_check_photos")
              .update({ driver_note: args.driverNotes![p.side] })
              .eq("id", p.id),
          );
        const results = await Promise.all(updates);
        for (const r of results) {
          if (r.error) throw r.error;
        }
      }

      // Toewijzing: welke chauffeur reed tijdens de baseline?
      let attributedDriverId: string | null = null;
      if (args.baselineCheckId) {
        const { data: baseline } = await (supabase as any)
          .from("vehicle_checks")
          .select("driver_id, is_baseline_seed")
          .eq("id", args.baselineCheckId)
          .maybeSingle();
        if (baseline && !baseline.is_baseline_seed) {
          attributedDriverId = baseline.driver_id ?? null;
        }
      }

      // Damage-events voor alle minor/blocking foto's.
      // Bij baseline-seed niet doorschrijven — we leggen de huidige staat vast,
      // niet nieuwe schade toe te wijzen aan een eerdere chauffeur.
      const damaged = args.asBaselineSeed
        ? []
        : args.photos.filter((p) => p.severity !== "none");
      if (damaged.length > 0) {
        const rows = damaged.map((p) => ({
          tenant_id: args.tenantId,
          vehicle_id: args.vehicleId,
          discovered_in_check_id: args.checkId,
          discovered_by_driver_id: args.driverId,
          attributed_to_check_id: args.baselineCheckId,
          attributed_to_driver_id: attributedDriverId,
          side: p.side,
          severity: p.severity,
          description: p.ai_diff || p.ai_description,
          photo_path: p.storage_path,
        }));
        const { error: dErr } = await (supabase as any)
          .from("vehicle_damage_events")
          .insert(rows);
        if (dErr) throw dErr;
      }

      return { status, damagedCount: damaged.length, attributedDriverId };
    },
    onSuccess: (_res, vars) => {
      if (vars.driverId) {
        qc.invalidateQueries({ queryKey: gateKey(vars.driverId, vars.vehicleId) });
      }
      qc.invalidateQueries({ queryKey: ["vehicle-check-baseline", vars.vehicleId] });
    },
  });
}
