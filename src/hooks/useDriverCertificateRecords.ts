import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantInsert } from "@/hooks/useTenantInsert";

/**
 * Richt zich op de bestaande tabel public.driver_certification_expiry,
 * uitgebreid in migratie 20260422120000 met document_name en notes.
 *
 * Er is bewust geen aparte "records"-tabel gemaakt; document-upload is
 * een extra dimensie op de bestaande expiry-rij (UNIQUE driver_id +
 * certification_code), zodat er één bron van waarheid blijft voor
 * verloopmeldingen, UI en documentbeheer.
 */
export interface DriverCertificateRecord {
  id: string;
  tenant_id: string;
  driver_id: string;
  certification_code: string;
  issued_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  document_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverCertificateRecordInput {
  driver_id: string;
  certification_code: string;
  issued_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  file?: File | null;
}

const BUCKET = "driver-certificates";
const TABLE = "driver_certification_expiry";

function recordsKey(driverId: string | null | undefined) {
  return ["driver-certificate-records", driverId ?? "none"] as const;
}

export function useDriverCertificateRecords(driverId: string | null | undefined) {
  return useQuery<DriverCertificateRecord[]>({
    queryKey: recordsKey(driverId),
    enabled: !!driverId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select("*")
        .eq("driver_id", driverId!)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as DriverCertificateRecord[];
    },
  });
}

async function uploadFile(
  file: File,
  tenantId: string,
  driverId: string,
): Promise<{ path: string; name: string }> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const uuid = crypto.randomUUID();
  const path = `${tenantId}/${driverId}/${uuid}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { path, name: file.name };
}

async function removeFile(path: string | null) {
  if (!path) return;
  // Legacy document_url kan een externe URL zijn ipv een bucket-path.
  // Alleen wissen als het lijkt op het {uuid}-formaat dat wij gebruiken.
  if (/^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function useCreateDriverCertificateRecord() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const insert = useTenantInsert(TABLE);

  return useMutation({
    mutationFn: async (input: DriverCertificateRecordInput) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");

      // Voorkom duplicaten: de tabel heeft UNIQUE (driver_id,
      // certification_code). Check expliciet zodat we een nette
      // foutmelding geven en niet op een DB-constraint hoeven te varen.
      const { data: existing } = await supabase
        .from(TABLE as any)
        .select("id")
        .eq("driver_id", input.driver_id)
        .eq("certification_code", input.certification_code)
        .maybeSingle();
      if (existing) {
        throw new Error(
          "Er bestaat al een record voor dit certificaat-type. Bewerk het bestaande record in plaats van een nieuwe aan te maken.",
        );
      }

      let filePath: string | null = null;
      let fileName: string | null = null;
      if (input.file) {
        const uploaded = await uploadFile(input.file, tenant.id, input.driver_id);
        filePath = uploaded.path;
        fileName = uploaded.name;
      }

      const payload = {
        driver_id: input.driver_id,
        certification_code: input.certification_code,
        issued_date: input.issued_date || null,
        expiry_date: input.expiry_date || null,
        notes: input.notes?.trim() || null,
        document_url: filePath,
        document_name: fileName,
      };

      const { data, error } = await insert.insert(payload).select().single();
      if (error) {
        if (filePath) await removeFile(filePath).catch(() => undefined);
        throw error;
      }
      return data as unknown as DriverCertificateRecord;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: recordsKey(row.driver_id) });
      qc.invalidateQueries({ queryKey: ["driver_cert_expiry", row.driver_id] });
    },
  });
}

export function useUpdateDriverCertificateRecord() {
  const qc = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (
      input: Partial<Omit<DriverCertificateRecordInput, "driver_id" | "certification_code">> & {
        id: string;
        driver_id: string;
        previous_document_url?: string | null;
      },
    ) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");
      const patch: Record<string, unknown> = {};
      if (input.issued_date !== undefined) patch.issued_date = input.issued_date || null;
      if (input.expiry_date !== undefined) patch.expiry_date = input.expiry_date || null;
      if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

      if (input.file) {
        const uploaded = await uploadFile(input.file, tenant.id, input.driver_id);
        patch.document_url = uploaded.path;
        patch.document_name = uploaded.name;
      }

      const { data, error } = await supabase
        .from(TABLE as any)
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;

      if (input.file && input.previous_document_url) {
        await removeFile(input.previous_document_url).catch(() => undefined);
      }

      return data as unknown as DriverCertificateRecord;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: recordsKey(row.driver_id) });
      qc.invalidateQueries({ queryKey: ["driver_cert_expiry", row.driver_id] });
    },
  });
}

export function useDeleteDriverCertificateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      driver_id: string;
      document_url: string | null;
    }) => {
      const { error } = await supabase
        .from(TABLE as any)
        .delete()
        .eq("id", input.id);
      if (error) throw error;
      await removeFile(input.document_url).catch(() => undefined);
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({ queryKey: recordsKey(input.driver_id) });
      qc.invalidateQueries({ queryKey: ["driver_cert_expiry", input.driver_id] });
    },
  });
}

/**
 * Genereer een signed URL (60 minuten geldig) voor het downloaden van
 * een certificaat-bestand. Signed omdat de bucket privé is en we niet
 * willen dat links persistent bruikbaar zijn als ze uitlekken.
 */
export async function getCertificateDownloadUrl(filePath: string): Promise<string> {
  // Legacy rows kunnen een externe URL bevatten in plaats van een bucket-path.
  if (/^https?:\/\//i.test(filePath)) return filePath;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
