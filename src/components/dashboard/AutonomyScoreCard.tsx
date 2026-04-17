import { Brain, Bot, CheckCircle2, Edit3 } from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { useAutonomyScore } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function progressColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

interface AutonomyScoreCardProps {
  compact?: boolean;
}

export function AutonomyScoreCard({ compact = false }: AutonomyScoreCardProps) {
  const { data, isLoading, isError } = useAutonomyScore();

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card--luxe p-5"
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
            <Brain className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          </div>
          <div>
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>AI Autonomie</span>
            <p className="text-xs text-muted-foreground">Laden...</p>
          </div>
        </div>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/50 rounded" />
          <div className="h-2 bg-muted/50 rounded" />
        </div>
      </motion.div>
    );
  }

  // When query errors or returns no data, show a zero-state instead of infinite loading
  const resolvedData = data ?? {
    overall: 0,
    perModule: {
      ORDER_INTAKE: 0,
      PLANNING: 0,
      DISPATCH: 0,
      PRICING: 0,
      INVOICING: 0,
      CONSOLIDATION: 0,
    },
    todayStats: { autonomous: 0, validated: 0, manual: 0 },
  };

  if (isError) {
    console.warn("[AutonomyScoreCard] Failed to load autonomy score, showing zero-state");
  }

  const overall = Math.round(resolvedData.overall);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.06 }}
      className="card--luxe p-5"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
          <Brain className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
        </div>
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[hsl(var(--gold-deep))]"
          style={{ fontFamily: "var(--font-display)" }}>
          AI Autonomie
        </span>
      </div>

      {/* Overall score */}
      <div className="flex items-end gap-3 mb-3">
        <span className={`text-3xl font-bold font-display tabular-nums ${scoreColor(overall)}`}>
          {overall}%
        </span>
        <div className="flex-1">
          <Progress value={overall} className="h-2" />
        </div>
      </div>

      {/* Today stats */}
      <div className="flex gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{resolvedData.todayStats.autonomous}</span> autonoom
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{resolvedData.todayStats.validated}</span> gevalideerd
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Edit3 className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{resolvedData.todayStats.manual}</span> handmatig
          </span>
        </div>
      </div>

      {/* Per-module breakdown (hidden in compact mode) */}
      {!compact && (
        <div className="space-y-1.5 pt-2 border-t border-border/30">
          {Object.entries(resolvedData.perModule).map(([mod, score]) => (
            <div key={mod} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-24 truncate">
                {MODULE_LABELS[mod as DecisionType]}
              </span>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progressColor(score)}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
              <span className={`text-xs font-medium tabular-nums w-8 text-right ${scoreColor(score)}`}>
                {Math.round(score)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
