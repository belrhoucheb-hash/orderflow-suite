// Globale storing-banner bovenin de marketplace.
//
// Wordt zichtbaar zodra > 1 connector in de laatste 5 minuten meer dan
// 5 failures had. Klik op een naam om naar die connector te gaan.

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { findConnector } from "@/lib/connectors/catalog";
import { useTenantSyncHealth, HEALTH_CONSTANTS } from "@/hooks/useTenantSyncHealth";

interface Props {
  onSelect?: (slug: string) => void;
}

export function HealthBanner({ onSelect }: Props) {
  const health = useTenantSyncHealth();

  const incident = health.data?.globalIncident ?? false;
  const affected = health.data?.affectedProviders ?? [];

  if (!incident || affected.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="health-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        role="alert"
        data-testid="health-banner"
        className="rounded-2xl border border-red-200 bg-gradient-to-br from-red-50 via-red-50/60 to-white p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_24px_-12px_rgba(220,38,38,0.18)]"
      >
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-semibold text-foreground">
              Storing op {affected.length} koppelingen
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Meer dan {HEALTH_CONSTANTS.FAILURE_THRESHOLD} mislukte events in de afgelopen{" "}
              {HEALTH_CONSTANTS.WINDOW_MIN} minuten. Open de getroffen koppeling om de Sync-log te bekijken.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {affected.map((slug) => {
                const c = findConnector(slug);
                const name = c?.name ?? slug;
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => onSelect?.(slug)}
                    className="inline-flex items-center gap-1 h-7 px-3 rounded-full border border-red-200 bg-white text-[11px] font-display font-semibold text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
