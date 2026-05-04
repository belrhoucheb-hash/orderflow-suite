// Webhook-replay dialog voor de Sync-log.
//
// Toont de event-payload (read-only of bewerkbaar) en stuurt 'm via de
// `connector-replay-event` Edge Function opnieuw door de connector.

import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { SyncLogRow } from "@/hooks/useConnectors";
import { useReplaySyncEvent } from "@/hooks/useReplaySyncEvent";

interface Props {
  row: SyncLogRow | null;
  open: boolean;
  onClose: () => void;
}

interface SyncLogRowWithPayload extends SyncLogRow {
  payload?: Record<string, unknown> | null;
}

export function WebhookReplayDialog({ row, open, onClose }: Props) {
  const replay = useReplaySyncEvent(row?.provider ?? null);
  const [editMode, setEditMode] = useState(false);
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  const initialPayload = useMemo(() => {
    const r = row as SyncLogRowWithPayload | null;
    return r?.payload ?? { id: row?.id, event_type: row?.event_type, entity_id: row?.entity_id };
  }, [row]);

  useEffect(() => {
    if (!open) return;
    setEditMode(false);
    setParseError(null);
    setText(JSON.stringify(initialPayload, null, 2));
  }, [open, initialPayload]);

  const handleSubmit = async () => {
    if (!row) return;
    let payload: Record<string, unknown>;
    if (editMode) {
      try {
        payload = JSON.parse(text);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Ongeldige JSON");
        return;
      }
    } else {
      payload = (initialPayload as Record<string, unknown>) ?? {};
    }
    try {
      await replay.mutateAsync({
        eventId: row.id,
        eventType: row.event_type,
        payload,
        edited: editMode,
      });
      toast.success("Event opnieuw verstuurd");
      onClose();
    } catch (e) {
      toast.error("Replay mislukt", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tight inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            Event opnieuw versturen
          </DialogTitle>
          <DialogDescription>
            {row?.event_type ? `Type ${row.event_type}` : "Onbekend type"}, originele tijd{" "}
            {row?.started_at ? new Date(row.started_at).toLocaleString("nl-NL") : "-"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white p-3">
          <div>
            <Label className="text-xs font-display font-semibold">Bewerk payload</Label>
            <p className="text-[11px] text-muted-foreground">Standaard verstuur je de originele payload ongewijzigd.</p>
          </div>
          <Switch checked={editMode} onCheckedChange={setEditMode} aria-label="Bewerk payload" />
        </div>

        {editMode ? (
          <div className="space-y-1.5">
            <Label className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              JSON-payload
            </Label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParseError(null);
              }}
              spellCheck={false}
              className="w-full h-64 rounded-xl border border-[hsl(var(--gold)/0.25)] bg-white p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)]"
            />
            {parseError && (
              <p className="text-[11px] text-destructive inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {parseError}
              </p>
            )}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2 text-[11px] text-amber-800 leading-relaxed">
              Bewerken wordt gelogd in de audit-trail. Pas alleen aan als je weet waarom.
            </div>
          </div>
        ) : (
          <pre className="max-h-64 overflow-auto rounded-xl border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.18)] p-3 font-mono text-[11px] leading-relaxed text-foreground">
            {JSON.stringify(initialPayload, null, 2)}
          </pre>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Annuleren
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={replay.isPending} className="gap-1.5">
            {replay.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Opnieuw versturen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
