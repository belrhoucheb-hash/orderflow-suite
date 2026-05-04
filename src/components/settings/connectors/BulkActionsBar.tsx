// Bulk-actiebalk bovenin de marketplace.
//
// Drie acties:
//   1. Pauzeer alle    , zet enabled=false op alle integration_credentials
//      van de tenant (werkt als toggle, kan ook hervatten).
//   2. Test alle       , itereert door live connectors en draait per
//      connector de connector-<provider> test. Toont live progress in
//      een dialog met per-connector status.
//   3. Re-run failed   , confirm-dialog, daarna delegate naar
//      connectors-bulk-replay edge function (placeholder).
//
// Dit component plaatst zichzelf in een eigen rij, additief onder de
// zoekbar. Geen wijziging aan de bestaande hero-layout.

import { useState } from "react";
import { Activity, PauseCircle, PlayCircle, RotateCcw, CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBulkConnectorActions, type BulkTestProgressItem } from "@/hooks/useBulkConnectorActions";

export function BulkActionsBar({ liveCount, paused }: { liveCount: number; paused: boolean }) {
  const bulk = useBulkConnectorActions();
  const [testOpen, setTestOpen] = useState(false);
  const [progress, setProgress] = useState<BulkTestProgressItem[]>([]);
  const [replayOpen, setReplayOpen] = useState(false);

  const handleTestAll = async () => {
    setProgress([]);
    setTestOpen(true);
    try {
      await bulk.testAll((updates) => setProgress(updates));
    } catch (e) {
      toast.error("Test alle mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handlePauseToggle = async () => {
    try {
      const next = !paused;
      await bulk.setAllEnabled(!next);
      toast.success(next ? "Alle koppelingen gepauzeerd" : "Alle koppelingen hervat");
    } catch (e) {
      toast.error("Wijziging mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleReplayConfirm = async () => {
    try {
      await bulk.replayFailedLast24h();
      toast.success("Replay-job in gang gezet");
      setReplayOpen(false);
    } catch (e) {
      toast.error("Replay starten mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <>
      <div
        data-testid="bulk-actions-bar"
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-[hsl(var(--gold)/0.2)] bg-white/80 backdrop-blur-sm p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_8px_-4px_rgba(0,0,0,0.06)]"
      >
        <span className="inline-flex items-center gap-1.5 px-2 text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]">
          <Activity className="h-3 w-3" />
          Bulk
        </span>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePauseToggle}
            disabled={bulk.isPending}
            className="h-8 px-3 text-[11px] font-display font-semibold border-[hsl(var(--gold)/0.25)] gap-1.5"
          >
            {paused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
            {paused ? "Hervat alle" : "Pauzeer alle"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestAll}
            disabled={bulk.isPending || liveCount === 0}
            className="h-8 px-3 text-[11px] font-display font-semibold border-[hsl(var(--gold)/0.25)] gap-1.5"
          >
            <Activity className="h-3.5 w-3.5" />
            Test alle verbindingen
            {liveCount > 0 && (
              <span className="inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] text-[9px] tabular-nums">
                {liveCount}
              </span>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setReplayOpen(true)}
            disabled={bulk.isPending}
            className="h-8 px-3 text-[11px] font-display font-semibold border-[hsl(var(--gold)/0.25)] gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Re-run failed (laatste 24u)
          </Button>
        </div>
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight">Test alle verbindingen</DialogTitle>
            <DialogDescription>Per connector wordt een ping gedaan. Geen data wordt aangepast.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {progress.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verbindingen aan het verzamelen...
                </motion.div>
              )}
              {progress.map((item) => {
                const Icon = item.status === "success" ? CheckCircle2 : item.status === "failed" ? XCircle : Loader2;
                const tone = item.status === "success" ? "text-emerald-600" : item.status === "failed" ? "text-destructive" : "text-amber-500";
                return (
                  <motion.div
                    key={item.slug}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--gold)/0.16)] bg-white p-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone, item.status === "pending" && "animate-spin")} />
                      <span className="text-xs font-display font-semibold truncate">{item.name}</span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-display font-semibold uppercase tracking-[0.16em]",
                        item.status === "success" && "text-emerald-600",
                        item.status === "failed" && "text-destructive",
                        item.status === "pending" && "text-amber-600",
                      )}
                    >
                      {item.status === "pending" ? "Bezig" : item.status === "success" ? "Ok" : "Mislukt"}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setTestOpen(false)}>
              Sluiten
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={replayOpen} onOpenChange={setReplayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display tracking-tight inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Re-run failed events
            </DialogTitle>
            <DialogDescription>
              We zoeken alle mislukte events van de laatste 24 uur en proberen ze opnieuw uit te voeren via de oorspronkelijke connector.
              Dit kan dubbele boekingen veroorzaken als de oorspronkelijke push achteraf toch geslaagd is.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-800 leading-relaxed">
            Tip: controleer eerst de Sync-log van een individuele connector als je niet zeker bent of een event opnieuw moet.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setReplayOpen(false)}>
              Annuleren
            </Button>
            <Button size="sm" onClick={handleReplayConfirm} disabled={bulk.isPending} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Start replay
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
