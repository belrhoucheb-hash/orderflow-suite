import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";

interface AutoPlanInput {
  date: string;
  dry_run?: boolean;
}

interface AutoPlanResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  proposals_created?: number;
  unplaced?: Array<{ order_id: string; reason: string; detail?: string }>;
  error?: string;
  proposals_preview?: unknown[];
  dry_run?: boolean;
}

export function useAutoPlan() {
  const { tenant } = useTenantOptional();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ date, dry_run }: AutoPlanInput): Promise<AutoPlanResult> => {
      if (!tenant?.id) throw new Error("Geen tenant context");
      const { data, error } = await supabase.functions.invoke("auto-plan-day", {
        body: { tenant_id: tenant.id, date, dry_run },
      });
      if (error) throw error;
      return data as AutoPlanResult;
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["consolidation_groups"] });
      qc.invalidateQueries({ queryKey: ["consolidation_groups_by_date", variables.date] });
      qc.invalidateQueries({ queryKey: ["open_orders_by_date", variables.date] });
      if (result.skipped) {
        toast({
          title: "Planbord v2 staat uit",
          description: result.reason ?? "Activeer eerst in stamgegevens.",
        });
        return;
      }
      if (result.proposals_created !== undefined) {
        const unplacedCount = result.unplaced?.length ?? 0;
        toast({
          title: "Auto-plan klaar",
          description: `${result.proposals_created} voorstellen aangemaakt, ${unplacedCount} orders in Open te plannen.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Auto-plan mislukt",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}
