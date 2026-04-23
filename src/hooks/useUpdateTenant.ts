import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const LOGO_BUCKET = "tenant-logos";

async function uploadLogo(file: File, tenantId: string): Promise<string> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `${tenantId}/logo.${ext}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path);
  // Cache-buster zodat de browser de nieuwe upload direct oppikt na overschrijven.
  return `${data.publicUrl}?v=${Date.now()}`;
}

interface UpdateBrandingInput {
  name?: string;
  primary_color?: string;
  logo_file?: File | null;
  clear_logo?: boolean;
}

export function useUpdateTenantBranding() {
  const { tenant, refresh } = useTenant();

  return useMutation({
    mutationFn: async (input: UpdateBrandingInput) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");

      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.primary_color !== undefined) patch.primary_color = input.primary_color;

      if (input.logo_file) {
        const url = await uploadLogo(input.logo_file, tenant.id);
        patch.logo_url = url;
      } else if (input.clear_logo) {
        patch.logo_url = null;
      }

      if (Object.keys(patch).length === 0) return;

      const { error } = await (supabase as any)
        .from("tenants")
        .update(patch)
        .eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Branding opgeslagen", { description: "Wijzigingen zijn direct actief." });
    },
    onError: (err: Error) => {
      toast.error("Opslaan mislukt", { description: err.message ?? "Probeer het opnieuw." });
    },
  });
}
