import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useAutonomyTrend } from "@/hooks/useAutonomyDashboard";
import type { DecisionType } from "@/types/confidence";

const MODULE_COLORS: Record<DecisionType, string> = {
  ORDER_INTAKE: "#3b82f6",
  PLANNING: "#8b5cf6",
  DISPATCH: "#f59e0b",
  PRICING: "#10b981",
  INVOICING: "#ef4444",
  CONSOLIDATION: "#6366f1",
};

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

interface AutonomyTrendChartProps {
  weeks?: number;
  height?: number;
}

export function AutonomyTrendChart({ weeks = 8, height = 300 }: AutonomyTrendChartProps) {
  const { data: trendData, isLoading } = useAutonomyTrend(weeks);

  if (isLoading) {
    return (
      <div className="animate-pulse" style={{ height }}>
        <div className="h-full bg-muted/30 rounded-lg" />
      </div>
    );
  }

  if (!trendData || trendData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        Nog geen trendgegevens beschikbaar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
        <XAxis
          dataKey="weekLabel"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [
            `${Math.round(value)}%`,
            MODULE_LABELS[name as DecisionType] ?? name,
          ]}
        />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs">
              {MODULE_LABELS[value as DecisionType] ?? value}
            </span>
          )}
        />
        {(Object.keys(MODULE_COLORS) as DecisionType[]).map((mod) => (
          <Area
            key={mod}
            type="monotone"
            dataKey={mod}
            stroke={MODULE_COLORS[mod]}
            fill={MODULE_COLORS[mod]}
            fillOpacity={0.1}
            strokeWidth={2}
          />
        ))}
        <Area
          type="monotone"
          dataKey="overall"
          stroke="#000"
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 5"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
