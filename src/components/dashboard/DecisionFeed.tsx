import { Bot, CheckCircle2, Edit3, XCircle, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useDecisionFeed } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const DECISION_TYPE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

const RESOLUTION_CONFIG: Record<string, { icon: typeof Bot; color: string; bg: string; label: string }> = {
  AUTO_EXECUTED: { icon: Bot, color: "text-emerald-600", bg: "bg-emerald-500/10", label: "Autonoom" },
  APPROVED: { icon: CheckCircle2, color: "text-blue-600", bg: "bg-blue-500/10", label: "Goedgekeurd" },
  MODIFIED: { icon: Edit3, color: "text-amber-600", bg: "bg-amber-500/10", label: "Aangepast" },
  REJECTED: { icon: XCircle, color: "text-red-600", bg: "bg-red-500/10", label: "Afgewezen" },
  PENDING: { icon: Clock, color: "text-gray-500", bg: "bg-gray-500/10", label: "Wachtend" },
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Vandaag";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Gisteren";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

interface DecisionFeedProps {
  limit?: number;
  maxHeight?: string;
}

export function DecisionFeed({ limit = 20, maxHeight = "400px" }: DecisionFeedProps) {
  const { data: decisions, isLoading } = useDecisionFeed(limit);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse flex items-center gap-3 p-2">
            <div className="h-8 w-8 rounded-full bg-muted/50" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 bg-muted/50 rounded w-3/4" />
              <div className="h-2 bg-muted/50 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!decisions || decisions.length === 0) {
    return (
      <div className="text-center py-8">
        <Bot className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nog geen beslissingen</p>
      </div>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="pr-2">
      <div className="space-y-1">
        {decisions.map((decision) => {
          const config = RESOLUTION_CONFIG[decision.resolution] ?? RESOLUTION_CONFIG.PENDING;
          const Icon = config.icon;
          return (
            <div
              key={decision.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div className={`h-8 w-8 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {decision.proposed_action}
                  </span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    {DECISION_TYPE_LABELS[decision.decision_type] ?? decision.decision_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(decision.input_confidence)}% confidence
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    {formatDate(decision.created_at)} {formatTime(decision.created_at)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
