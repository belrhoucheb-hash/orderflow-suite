import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { RETURN_REASON_LABELS, type ReturnReason } from "@/types/packaging";
import { Undo2 } from "lucide-react";

export function ReturnOrdersList({ parentOrderId }: { parentOrderId: string }) {
  const { data: returns = [] } = useQuery({
    queryKey: ["orders", "returns", parentOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at, status, return_reason")
        .eq("parent_order_id", parentOrderId)
        .eq("order_type", "RETOUR")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!parentOrderId,
  });

  if (returns.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Undo2 className="h-4 w-4 text-amber-600" />
        Retourzendingen ({returns.length})
      </h3>
      {returns.map((r: any) => (
        <Link
          key={r.id}
          to={`/orders/${r.id}`}
          className="flex items-center justify-between rounded-lg border border-border/30 p-3 hover:bg-muted/30 transition-colors"
        >
          <div>
            <span className="text-sm font-mono font-medium">
              RCS-{new Date(r.created_at).getFullYear()}-{String(r.order_number).padStart(4, "0")}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {r.return_reason ? RETURN_REASON_LABELS[r.return_reason as ReturnReason] : ""}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {r.status}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
