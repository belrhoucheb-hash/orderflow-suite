import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface KPIItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
}

interface KPIStripProps {
  items: KPIItem[];
  columns?: 3 | 4 | 5 | 6;
  className?: string;
  animate?: boolean;
}

const colsClass: Record<number, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export function KPIStrip({ items, columns, className, animate = true }: KPIStripProps) {
  const cols = columns ?? Math.min(items.length, 6) as 3 | 4 | 5 | 6;

  return (
    <div
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 gap-3",
        colsClass[cols],
        className,
      )}
    >
      {items.map((item, i) => {
        const Wrapper = animate ? motion.div : "div";
        const animationProps = animate
          ? {
              initial: { opacity: 0, y: 8 },
              animate: { opacity: 1, y: 0 },
              transition: { delay: i * 0.03, duration: 0.25 },
            }
          : {};

        return (
          <Wrapper
            key={item.label}
            {...animationProps}
            className="relative p-3.5 rounded-xl overflow-hidden flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.15) 100%)",
              border: "1px solid hsl(var(--gold) / 0.15)",
            }}
          >
            <span
              className="absolute top-0 left-1/4 right-1/4 h-px pointer-events-none"
              style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold) / 0.3), transparent)" }}
            />
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "hsl(var(--gold-soft) / 0.4)" }}
            >
              <item.icon className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <p className="text-lg font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{item.value}</p>
                {item.trend && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[11px] font-medium",
                      item.trend.direction === "up" && "text-emerald-600",
                      item.trend.direction === "down" && "text-red-500",
                      item.trend.direction === "neutral" && "text-muted-foreground",
                    )}
                  >
                    {item.trend.direction === "up" && <TrendingUp className="h-3 w-3" />}
                    {item.trend.direction === "down" && <TrendingDown className="h-3 w-3" />}
                    {item.trend.value}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
