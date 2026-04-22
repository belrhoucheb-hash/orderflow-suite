import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface ExtractedCertificate {
  certification_code: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  confidence: number;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Roept de extract-certificate edge function aan met de PDF of afbeelding
 * die de gebruiker heeft gekozen. Retourneert een voorstel voor
 * certification_code, issued_date en expiry_date plus confidence.
 *
 * De caller is verantwoordelijk voor het pas tonen van het voorstel
 * (bv. met een "AI-voorstel"-label) en het laten overschrijven door de
 * gebruiker voor opslaan.
 */
export function useExtractCertificate() {
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractedCertificate> => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");
      const file_base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-certificate", {
        body: {
          file_base64,
          mime_type: file.type || "application/pdf",
          tenant_id: tenant.id,
        },
      });
      if (error) throw error;
      return data as ExtractedCertificate;
    },
  });
}
