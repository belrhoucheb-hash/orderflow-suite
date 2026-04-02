import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface KPIItem {
  /** Display label below the value */
  label: string;
  /** The main value to display */
  value: string | number;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Tailwind text-color class for the icon, e.g. "text-blue-600" */
  iconColor?: string;
  /** Tailwind bg class for the icon container, e.g. "bg-blue-500/10" */
  iconBg?: string;
  /** Optional trend indicator */
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
}

interface KPIStripProps {
  items: KPIItem[];
  /** Number of columns on large screens. Default: matches item count, max 6. */
  columns?: 3 | 4 | 5 | 6;
  /** Additional className */
  className?: string;
  /** Enable entrance animation (default true) */
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
          <Wrapper key={item.label} {...animationProps} className="card-stat">
            <div
              className={cn(
                "card-stat__icon-wrap",
                item.iconBg ?? "bg-muted",
              )}
            >
              <item.icon className={cn("h-4 w-4", item.iconColor ?? "text-muted-foreground")} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <p className="card-stat__value">{item.value}</p>
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
              <p className="card-stat__label">{item.label}</p>
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
}
