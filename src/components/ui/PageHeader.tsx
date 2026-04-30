import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Page title displayed as h1 */
  title: string;
  /** Small uppercase label above the title */
  eyebrow?: ReactNode;
  /** Optional compact metadata rendered beside the eyebrow */
  meta?: ReactNode;
  /** Optional subtitle / description */
  subtitle?: string;
  /** Action buttons rendered on the right */
  actions?: ReactNode;
  /** Optional content under the subtitle, such as page tabs */
  children?: ReactNode;
  /** Additional className for the wrapper */
  className?: string;
}

export function PageHeader({ title, eyebrow = "Overzicht", meta, subtitle, actions, children, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "page-header-premium relative overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.16)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.46),hsl(var(--card))_46%,hsl(var(--gold-soft)/0.18))] px-5 py-5 shadow-[0_22px_70px_-54px_hsl(32_45%_26%/0.45)]",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, hsl(var(--gold) / 0.62), transparent)" }}
      />
      <div className="page-header-premium__inner relative flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
            <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.7)" }} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))]">
              {eyebrow}
            </span>
            {meta && (
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
                {meta}
              </span>
            )}
          </div>
          <h1
            className="text-[2.15rem] font-semibold leading-[1.05] tracking-tight text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {title}
          </h1>
          {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
        {actions && <div className="page-header-premium__actions flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
