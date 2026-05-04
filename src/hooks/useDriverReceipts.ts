import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";
import { useTenantOptional } from "@/contexts/TenantContext";

/**
 * Bonnetjes voor /chauffeur > Bonnetjes & tank.
 *
 * Flow: chauffeur kiest een bestand, we uploaden naar bucket `receipts`
 * onder {tenant_id}/{driver_id}/{timestamp}.{ext} en inserten een rij in
 * driver_receipts met status `pending_ocr`. OCR-extractie volgt later.
 */

export type ReceiptType = "diesel" | "parking" | "tol" | "overig";

export interface DriverReceipt {
  id: string;
  tenant_id: string;
  driver_id: string;
  scanned_at: string;
  file_path: string;
  file_name: string | null;
  total_amount: number | null;
  currency: string;
  type: ReceiptType;
  location: string | null;
  trip_id: string | null;
  status: "pending_ocr" | "ocr_done" | "approved" | "rejected";
  notes: string | null;
  created_at: string;
}

const BUCKET = "receipts";
const TABLE = "driver_receipts";

const listKey = (driverId: string | null | undefined) =>
  ["driver_receipts", driverId ?? "none"] as const;

export function useDriverReceipts(driverId: string | null | undefined) {
  return useQuery<DriverReceipt[]>({
    queryKey: listKey(driverId),
    enabled: !!driverId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select(
          "id, tenant_id, driver_id, scanned_at, file_path, file_name, total_amount, currency, type, location, trip_id, status, notes, created_at",
        )
        .eq("driver_id", driverId!)
        .order("scanned_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as DriverReceipt[];
    },
  });
}

export interface CreateReceiptInput {
  driver_id: string;
  file: File;
  type?: ReceiptType;
  total_amount?: number | null;
  location?: string | null;
  trip_id?: string | null;
  notes?: string | null;
}

export function useCreateDriverReceipt() {
  const qc = useQueryClient();
  const { tenant } = useTenantOptional();
  const insert = useTenantInsert(TABLE);

  return useMutation({
    mutationFn: async (input: CreateReceiptInput) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");
      const ext =
        input.file.name.includes(".") && input.file.name.split(".").pop()
          ? input.file.name.split(".").pop()!
          : "jpg";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = `${tenant.id}/${input.driver_id}/${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, input.file, {
          contentType: input.file.type || undefined,
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const payload = {
        driver_id: input.driver_id,
        scanned_at: new Date().toISOString(),
        file_path: path,
        file_name: input.file.name,
        type: input.type ?? "overig",
        total_amount: input.total_amount ?? null,
        location: input.location ?? null,
        trip_id: input.trip_id ?? null,
        notes: input.notes ?? null,
        status: "pending_ocr" as const,
      };

      const { data, error } = await insert.insert(payload).select().single();
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw error;
      }
      return data as unknown as DriverReceipt;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: listKey(row.driver_id) });
    },
  });
}

export async function getReceiptDownloadUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
