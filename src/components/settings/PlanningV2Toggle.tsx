import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { useTenantOptional } from "@/contexts/TenantContext";
import { usePlanningClusterGranularity } from "@/hooks/useIsPlanningV2Enabled";

export function PlanningV2Toggle() {
  const { tenant } = useTenantOptional();
  const qc = useQueryClient();
  const { data: granularity = "PC2" } = usePlanningClusterGranularity();

  const updateSettings = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const client = supabase as any;
      const { data: current, error: readErr } = await client
        .from("tenant_settings")
        .select("settings")
        .eq("tenant_id", tenant.id)
        .eq("category", "planning")
        .maybeSingle();
      if (readErr) throw readErr;

      const next = { ...(current?.settings ?? {}), ...patch };

      const { error } = await client.from("tenant_settings").upsert(
        {
          tenant_id: tenant.id,
          category: "planning",
          settings: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,category" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning_cluster_granularity"] });
    },
    onError: (err: Error) => toast.error("Instelling niet opgeslagen", { description: err.message }),
  });

  async function handleGranularity(v: string) {
    await updateSettings.mutateAsync({ cluster_granularity: v });
    toast.success("Clustergrootte bijgewerkt");
  }

  return (
    <div className="card--luxe p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-[hsl(var(--gold-soft)/0.6)] border border-[hsl(var(--gold)/0.3)] shrink-0">
          <LayoutGrid className="h-5 w-5 text-[hsl(var(--gold-deep))]" />
        </div>
        <div className="space-y-1 min-w-0">
          <h3 className="section-title !m-0">Planbord-instellingen</h3>
          <p className="text-sm text-muted-foreground">
            Kies hoe fijn auto-plan clusters vormt op basis van postcode.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5 min-w-0">
          <Label className="text-base font-medium">Clustergrootte voor auto-plan</Label>
          <p className="text-sm text-muted-foreground">
            PC2 groepeert per regio, bijvoorbeeld heel Rotterdam in één cluster.
            PC3 maakt fijnere clusters binnen een stad.
          </p>
        </div>
        <Select value={granularity} onValueChange={handleGranularity} disabled={updateSettings.isPending}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PC2">PC2 (breed)</SelectItem>
            <SelectItem value="PC3">PC3 (fijn)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
