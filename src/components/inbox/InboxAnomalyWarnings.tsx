import { motion } from "framer-motion";
import { Bot } from "lucide-react";

export function AnomalyWarnings({ anomalies }: { anomalies: { field: string; value: number; avg_value: number; message: string }[] }) {
  if (!anomalies || anomalies.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {anomalies.map((a, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-start gap-2.5 rounded-lg border border-amber-200/50 bg-amber-50/40 px-3 py-2"
        >
          <Bot className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-800 font-medium leading-snug">{a.message}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-amber-600/70">Huidige waarde: <strong>{a.value}</strong></span>
              <span className="text-[10px] text-amber-600/70">Gemiddeld: <strong>{a.avg_value}</strong></span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
