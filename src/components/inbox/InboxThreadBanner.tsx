import { motion } from "framer-motion";
import { Plus, ArrowLeft, Trash2, CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderDraft } from "./types";
import { THREAD_TYPE_CONFIG } from "./types";

const ICONS: Record<string, any> = {
  Plus,
  ArrowLeft,
  Trash2,
  CheckCircle2,
  CircleAlert,
};

const FIELD_LABELS: Record<string, string> = {
  weight_kg: "Gewicht",
  quantity: "Aantal",
  pickup_address: "Ophaaladres",
  delivery_address: "Afleveradres",
  requirements: "Vereisten",
  unit: "Eenheid",
  dimensions: "Afmetingen",
  transport_type: "Transport type",
  client_name: "Klantnaam",
};

export function ThreadDiffBanner({ order }: { order: OrderDraft }) {
  if (order.thread_type === "new" || !order.thread_type) return null;
  const config = THREAD_TYPE_CONFIG[order.thread_type];
  if (!config) return null;
  const changes = (order.changes_detected || []) as { field: string; old_value: string; new_value: string }[];
  const Icon = ICONS[config.icon as string];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-blue-200/60 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 p-4 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <div className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border", config.color)}>
          {Icon && <Icon className="h-3 w-3" />}
          E-mail Thread: {config.label}
        </div>
        {order.parent_order_id && (
          <span className="text-xs text-muted-foreground">
            Reactie op bestaande order
          </span>
        )}
      </div>

      {changes.length > 0 && (
        <div className="space-y-1.5">
          {changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-sm rounded-lg bg-white/80 border border-blue-100/60 px-3 py-2">
              <span className="text-muted-foreground font-medium min-w-[80px]">{FIELD_LABELS[change.field] || change.field}</span>
              <span className="text-destructive/70 line-through">{change.old_value}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-emerald-700 font-semibold">{change.new_value}</span>
            </div>
          ))}
        </div>
      )}

      {order.thread_type === "cancellation" && (
        <p className="text-xs text-destructive/80 font-medium">
          ⚠ Klant wil deze order annuleren. Controleer en verwerk handmatig.
        </p>
      )}
    </motion.div>
  );
}
