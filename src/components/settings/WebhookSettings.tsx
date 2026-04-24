import { useState } from "react";
import {
  Plus,
  Copy,
  Trash2,
  Send,
  History,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  AVAILABLE_EVENTS,
  useWebhookSubscriptions,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useWebhookDeliveries,
  useWebhookDeliveryAttempts,
  useReplayDelivery,
  useTestWebhook,
  type WebhookSubscription,
  type WebhookDelivery,
} from "@/hooks/useWebhooks";

export function WebhookSettings() {
  const subs = useWebhookSubscriptions();
  const [createOpen, setCreateOpen] = useState(false);
  const [newSecret, setNewSecret] = useState<{ secret: string; name: string } | null>(null);
  const [logFor, setLogFor] = useState<WebhookSubscription | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Webhooks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Stuur events (orders, ritten, facturen) in real-time naar een eigen URL.
            Elke POST wordt HMAC-SHA256 gesigned met de subscription-secret.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuwe webhook
        </Button>
      </div>

      {subs.isLoading && (
        <div className="card--luxe p-6 text-sm text-muted-foreground">Laden...</div>
      )}

      {!subs.isLoading && (subs.data?.length ?? 0) === 0 && (
        <div className="card--luxe p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nog geen webhooks. Maak er een aan om events naar je eigen backend te sturen.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {(subs.data ?? []).map((sub) => (
          <SubscriptionRow
            key={sub.id}
            sub={sub}
            onShowLog={() => setLogFor(sub)}
          />
        ))}
      </div>

      <CreateWebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(secret, name) => setNewSecret({ secret, name })}
      />

      <SecretRevealDialog
        open={newSecret !== null}
        onOpenChange={(open) => !open && setNewSecret(null)}
        secret={newSecret?.secret ?? ""}
        name={newSecret?.name ?? ""}
      />

      <DeliveryLogSheet
        sub={logFor}
        onClose={() => setLogFor(null)}
      />
    </div>
  );
}

function SubscriptionRow({
  sub,
  onShowLog,
}: {
  sub: WebhookSubscription;
  onShowLog: () => void;
}) {
  const update = useUpdateWebhook();
  const del = useDeleteWebhook();
  const test = useTestWebhook();

  const hasIssue = sub.failure_count > 0;

  return (
    <div className="card--luxe p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{sub.name}</span>
          {!sub.is_active && (
            <Badge variant="secondary" className="text-xs">Inactief</Badge>
          )}
          {hasIssue && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="h-3 w-3" />
              {sub.failure_count} mislukkingen
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
          {sub.url}
        </p>
        <div className="flex gap-1.5 flex-wrap mt-2">
          {sub.events.map((e) => (
            <Badge key={e} variant="outline" className="text-[11px] font-mono">
              {e}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Switch
          checked={sub.is_active}
          onCheckedChange={(v) => update.mutate({ id: sub.id, patch: { is_active: v } })}
          aria-label="Actief"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => test.mutate(sub.id)}
          disabled={test.isPending}
          title="Stuur test-event"
        >
          <Send className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onShowLog} title="Delivery log">
          <History className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Verwijder webhook "${sub.name}"?`)) del.mutate(sub.id);
          }}
          className="text-destructive hover:text-destructive"
          title="Verwijderen"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string, name: string) => void;
}) {
  const create = useCreateWebhook();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState<string[]>([]);

  const reset = () => {
    setName("");
    setUrl("");
    setDescription("");
    setEvents([]);
  };

  const toggleEvent = (ev: string) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    if (!url.match(/^https:\/\//i)) {
      toast.error("URL moet beginnen met https://");
      return;
    }
    if (events.length === 0) {
      toast.error("Kies minstens één event");
      return;
    }
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        events,
        description: description.trim() || undefined,
      });
      onCreated(res.secret, res.subscription.name);
      reset();
      onOpenChange(false);
    } catch {
      /* toast in hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuwe webhook</DialogTitle>
          <DialogDescription>
            Events worden HMAC-SHA256 gesigned. De secret wordt eenmaal getoond na aanmaak.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="wh-name">Naam</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ERP koppeling"
            />
          </div>
          <div>
            <Label htmlFor="wh-url">URL (https)</Label>
            <Input
              id="wh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/webhooks/orderflow"
              type="url"
            />
          </div>
          <div>
            <Label htmlFor="wh-desc">Omschrijving (optioneel)</Label>
            <Textarea
              id="wh-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label className="mb-2 block">Events</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_EVENTS.map((ev) => (
                <label
                  key={ev.value}
                  className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/30"
                >
                  <Checkbox
                    checked={events.includes(ev.value)}
                    onCheckedChange={() => toggleEvent(ev.value)}
                  />
                  <span className="font-mono text-xs">{ev.value}</span>
                  <span className="text-muted-foreground text-xs">{ev.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Aanmaken..." : "Aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretRevealDialog({
  open,
  onOpenChange,
  secret,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secret: string;
  name: string;
}) {
  const copy = () => {
    navigator.clipboard.writeText(secret);
    toast.success("Secret gekopieerd");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Secret voor "{name}"</DialogTitle>
          <DialogDescription>
            Kopieer deze secret nu. Hij wordt niet meer getoond. Gebruik hem om de
            HMAC-signature aan jouw kant te verifiëren.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 border border-border rounded p-3 font-mono text-sm break-all">
          {secret}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={copy} className="gap-2">
            <Copy className="h-4 w-4" />
            Kopieer
          </Button>
          <Button onClick={() => onOpenChange(false)}>Sluit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryLogSheet({
  sub,
  onClose,
}: {
  sub: WebhookSubscription | null;
  onClose: () => void;
}) {
  const deliveries = useWebhookDeliveries(sub?.id ?? null);
  const replay = useReplayDelivery();
  const [selected, setSelected] = useState<string | null>(null);
  const attempts = useWebhookDeliveryAttempts(selected);

  return (
    <Sheet open={sub !== null} onOpenChange={(o) => !o && (onClose(), setSelected(null))}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Delivery log: {sub?.name}</SheetTitle>
          <SheetDescription>
            Laatste 50 deliveries. Gebruik replay om een delivery opnieuw in te plannen.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {deliveries.isLoading && (
            <p className="text-sm text-muted-foreground">Laden...</p>
          )}

          {!deliveries.isLoading && (deliveries.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              Nog geen deliveries.
            </p>
          )}

          {(deliveries.data ?? []).map((d) => (
            <DeliveryRow
              key={d.id}
              d={d}
              expanded={selected === d.id}
              onToggle={() => setSelected(selected === d.id ? null : d.id)}
              onReplay={() => replay.mutate(d.id)}
              attempts={selected === d.id ? attempts.data ?? [] : []}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DeliveryRow({
  d,
  expanded,
  onToggle,
  onReplay,
  attempts,
}: {
  d: WebhookDelivery;
  expanded: boolean;
  onToggle: () => void;
  onReplay: () => void;
  attempts: Array<{
    attempt_number: number;
    status_code: number | null;
    response_body: string | null;
    error_message: string | null;
    duration_ms: number | null;
    attempted_at: string;
  }>;
}) {
  return (
    <div className="border border-border rounded">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/20"
      >
        <StatusIcon status={d.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{d.event_type}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(d.created_at).toLocaleString("nl-NL")}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {d.attempt_count} poging(en){d.status === "PENDING" && d.next_attempt_at ?
              `, volgende: ${new Date(d.next_attempt_at).toLocaleString("nl-NL")}` : ""}
          </div>
        </div>
        {(d.status === "FAILED" || d.status === "DEAD" || d.status === "DELIVERED") && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onReplay(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onReplay(); } }}
            className="text-xs gap-1 inline-flex items-center px-2 py-1 rounded hover:bg-muted cursor-pointer"
          >
            <RefreshCw className="h-3 w-3" />
            Replay
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/10">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Payload</p>
            <pre className="text-[11px] bg-background p-2 rounded border border-border overflow-x-auto mt-1">
              {JSON.stringify(d.payload, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Pogingen</p>
            {attempts.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nog geen pogingen geregistreerd.</p>
            )}
            {attempts.map((a) => (
              <div key={a.attempt_number} className="text-xs mt-1 p-2 bg-background border border-border rounded">
                <div className="flex items-center gap-2">
                  <span className="font-mono">#{a.attempt_number}</span>
                  <span>{a.status_code ?? "geen response"}</span>
                  <span className="text-muted-foreground">{a.duration_ms ?? "—"} ms</span>
                  <span className="text-muted-foreground ml-auto">
                    {new Date(a.attempted_at).toLocaleString("nl-NL")}
                  </span>
                </div>
                {a.error_message && (
                  <p className="text-destructive mt-1">{a.error_message}</p>
                )}
                {a.response_body && (
                  <pre className="mt-1 text-[11px] text-muted-foreground overflow-x-auto">{a.response_body}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: WebhookDelivery["status"] }) {
  if (status === "DELIVERED") return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (status === "PENDING") return <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
  if (status === "DEAD") return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
}
