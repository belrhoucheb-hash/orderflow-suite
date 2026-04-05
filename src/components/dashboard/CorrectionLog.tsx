import { Edit3, AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCorrectionLog } from "@/hooks/useAutonomyDashboard";
import { detectCorrectionPatterns } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CorrectionLogProps {
  days?: number;
}

export function CorrectionLog({ days = 7 }: CorrectionLogProps) {
  const { data: corrections, isLoading } = useCorrectionLog(days);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse p-3 rounded-lg bg-muted/30">
            <div className="h-4 bg-muted/50 rounded w-2/3 mb-2" />
            <div className="h-3 bg-muted/50 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const patterns = detectCorrectionPatterns(corrections ?? []);

  return (
    <div className="space-y-4">
      {/* Detected patterns */}
      {patterns.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Patronen gedetecteerd
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1.5">
              {patterns.map((pattern) => (
                <div
                  key={pattern.decisionType}
                  className="flex items-center gap-2 text-sm"
                >
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {TYPE_LABELS[pattern.decisionType]}
                  </Badge>
                  <span className="text-muted-foreground">{pattern.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correction list */}
      {(!corrections || corrections.length === 0) ? (
        <div className="text-center py-8">
          <Edit3 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Geen correcties in de afgelopen {days} dagen
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {corrections.map((correction) => (
            <div
              key={correction.id}
              className="p-3 rounded-lg bg-muted/20 border border-border/30"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {TYPE_LABELS[correction.decisionType]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(correction.createdAt)}
                </span>
                {correction.resolvedBy && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    door {correction.resolvedBy}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-red-500/80 line-through truncate max-w-[40%]">
                  {correction.proposedAction}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-emerald-600 font-medium truncate max-w-[40%]">
                  {correction.actualAction}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
