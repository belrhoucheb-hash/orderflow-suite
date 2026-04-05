import { useState } from "react";
import { GraduationCap, Bot, Eye, BookOpen } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLearningProgress } from "@/hooks/useAutonomyDashboard";
import type { LearningMetric } from "@/types/autonomy-dashboard";

const STATUS_CONFIG: Record<
  LearningMetric["status"],
  { label: string; icon: typeof Bot; color: string; variant: "default" | "secondary" | "outline" }
> = {
  autonomous: { label: "Autonoom", icon: Bot, color: "text-emerald-600", variant: "default" },
  validation: { label: "Validatie", icon: Eye, color: "text-blue-600", variant: "secondary" },
  learning: { label: "Leren", icon: BookOpen, color: "text-amber-600", variant: "outline" },
};

type FilterStatus = "all" | LearningMetric["status"];

export function LearningProgress() {
  const { data: metrics, isLoading } = useLearningProgress();
  const [filter, setFilter] = useState<FilterStatus>("all");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse p-3 rounded-lg bg-muted/30">
            <div className="h-4 bg-muted/50 rounded w-1/3 mb-2" />
            <div className="h-2 bg-muted/50 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  const filtered = metrics?.filter(
    (m) => filter === "all" || m.status === filter
  ) ?? [];

  const counts = {
    all: metrics?.length ?? 0,
    autonomous: metrics?.filter((m) => m.status === "autonomous").length ?? 0,
    validation: metrics?.filter((m) => m.status === "validation").length ?? 0,
    learning: metrics?.filter((m) => m.status === "learning").length ?? 0,
  };

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4">
        {(["all", "autonomous", "validation", "learning"] as FilterStatus[]).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "Alle" : STATUS_CONFIG[status].label}
            <span className="ml-1 text-muted-foreground">({counts[status]})</span>
          </Button>
        ))}
      </div>

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <GraduationCap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Geen klanten gevonden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((metric) => {
            const statusCfg = STATUS_CONFIG[metric.status];
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={metric.clientId}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {metric.clientName}
                    </span>
                    <Badge variant={statusCfg.variant} className="text-[10px] px-1.5 py-0">
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {statusCfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {metric.totalOrders} orders
                    </span>
                    {metric.autonomousSince && (
                      <span className="text-xs text-emerald-600">
                        Autonoom sinds {new Date(metric.autonomousSince).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20">
                    <Progress value={metric.currentConfidence} className="h-1.5" />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-8 text-right">
                    {Math.round(metric.currentConfidence)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
