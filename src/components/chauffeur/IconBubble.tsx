import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type IconBubbleVariant = "gold" | "muted" | "danger" | "success" | "warn";

interface Props {
  icon: ReactNode;
  size?: number;
  variant?: IconBubbleVariant;
  className?: string;
}

const PALETTE: Record<IconBubbleVariant, string> = {
  gold: "bg-gradient-to-br from-[hsl(var(--gold-soft))] via-[hsl(var(--gold-light)/0.6)] to-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
  muted: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
  danger:
    "bg-gradient-to-br from-red-100 to-red-50 text-red-600 dark:from-red-900/40 dark:to-red-900/20 dark:text-red-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
  success:
    "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-700 dark:from-emerald-900/40 dark:to-emerald-900/20 dark:text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
  warn:
    "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700 dark:from-amber-900/40 dark:to-amber-900/20 dark:text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(0,0,0,0.06)]",
};

/** Premium icon-bubble: gold-soft gradient cirkel met subtiele inset-glow. */
export function IconBubble({ icon, size = 36, variant = "gold", className }: Props) {
  return (
    <span
      className={cn("flex items-center justify-center rounded-2xl shrink-0", PALETTE[variant], className)}
      style={{ width: size, height: size }}
    >
      {icon}
    </span>
  );
}
