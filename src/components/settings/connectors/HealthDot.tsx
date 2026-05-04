// Compacte status-dot voor in de marketplace ConnectorCard.
//
// Drie tonen: groen (ok), amber (verhoogde latency / paar fouten),
// rood (storing). Gebruikt useTenantSyncHealth zodat alle kaartjes uit
// dezelfde aggregate-query halen.

import { useTenantSyncHealth } from "@/hooks/useTenantSyncHealth";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
  className?: string;
}

const TONE = {
  ok: { dot: "bg-emerald-500", label: "Alles ok" },
  degraded: { dot: "bg-amber-500", label: "Verhoogde latency" },
  down: { dot: "bg-red-500", label: "Storing" },
};

export function HealthDot({ slug, className }: Props) {
  const health = useTenantSyncHealth();
  const entry = health.data?.byProvider[slug];
  if (!entry || entry.total === 0) return null;
  const tone = TONE[entry.status];

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10px] font-display font-semibold", className)}
      title={`${tone.label} · ${entry.failed}/${entry.total} fouten`}
    >
      <span className="relative flex h-2 w-2">
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", tone.dot, entry.status !== "ok" && "animate-ping")} />
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone.dot)} />
      </span>
      <span
        className={cn(
          entry.status === "ok" && "text-emerald-700",
          entry.status === "degraded" && "text-amber-700",
          entry.status === "down" && "text-red-700",
        )}
      >
        {tone.label}
      </span>
    </span>
  );
}
