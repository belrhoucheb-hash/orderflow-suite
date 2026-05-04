import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle, Bell, Check, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  useOrderInfoRequests,
  useCreateInfoRequest,
  useFulfillInfoRequest,
  useCancelInfoRequest,
  triggerInfoReminder,
  TRACKABLE_FIELDS,
  defaultExpectedBy,
  type OrderInfoRequest,
} from "@/hooks/useOrderInfoRequests";

interface Props {
  orderId: string;
  /** Pickup-ISO zodat nieuwe requests automatisch T-4u krijgen. */
  pickupAtIso?: string | null;
}

export function OrderInfoRequestsCard({ orderId, pickupAtIso }: Props) {
  const { data: requests = [], isLoading } = useOrderInfoRequests(orderId);
  const createMut = useCreateInfoRequest();
  const fulfillMut = useFulfillInfoRequest();
  const cancelMut = useCancelInfoRequest();

  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState<string>(TRACKABLE_FIELDS[0].name);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const openRequests = requests.filter(r => r.status === "PENDING" || r.status === "OVERDUE");
  const closedRequests = requests.filter(r => r.status === "FULFILLED" || r.status === "CANCELLED");

  const handleAdd = async () => {
    const field = TRACKABLE_FIELDS.find(f => f.name === newField);
    if (!field) return;
    try {
      await createMut.mutateAsync({
        order_id: orderId,
        field_name: field.name,
        field_label: field.label,
        promised_by_name: contactName.trim() || null,
        promised_by_email: contactEmail.trim() || null,
        expected_by: defaultExpectedBy(pickupAtIso),
      });
      toast.success(`"${field.label}" toegevoegd aan rappellijst`);
      setAdding(false);
      setContactName("");
      setContactEmail("");
    } catch (e: any) {
      if (String(e?.message || "").includes("duplicate")) {
        toast.error("Dit veld staat al open");
      } else {
        toast.error(e.message || "Kon niet toevoegen");
      }
    }
  };

  const handleFulfill = async (req: OrderInfoRequest) => {
    const value = window.prompt(`Vul waarde in voor ${req.field_label ?? req.field_name}:`);
    if (value === null) return;
    if (!value.trim()) {
      toast.error("Lege waarde niet toegestaan");
      return;
    }
    try {
      await fulfillMut.mutateAsync({ id: req.id, value: value.trim(), source: "manual" });
      toast.success("Geregistreerd als ontvangen");
    } catch (e: any) {
      toast.error(e.message || "Kon niet opslaan");
    }
  };

  const handleRemind = async (req: OrderInfoRequest) => {
    try {
      await triggerInfoReminder(req.id);
      toast.success("Herinnering verzonden");
    } catch (e: any) {
      toast.error(e.message || "Kon herinnering niet verzenden");
    }
  };

  const handleCancel = async (req: OrderInfoRequest) => {
    const reason = window.prompt("Reden voor annuleren (optioneel):") ?? "";
    try {
      await cancelMut.mutateAsync({ id: req.id, reason: reason.trim() || undefined });
      toast.success("Geannuleerd");
    } catch (e: any) {
      toast.error(e.message || "Kon niet annuleren");
    }
  };

  return (
    <section className={openRequests.some(r => r.status === "OVERDUE") ? "card--luxe relative border-red-300 p-6 sm:p-7" : "card--luxe relative p-6 sm:p-7"}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="section-label flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
            Klantinformatie
            {openRequests.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.22)] bg-[hsl(var(--gold-soft)/0.45)] px-1.5 text-[10px] font-semibold text-[hsl(var(--gold-deep))]">
                {openRequests.length}
              </span>
            )}
          </div>
          <h3 className="section-title">Openstaande informatie</h3>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" className="btn-luxe h-8 gap-1 px-3" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Toevoegen
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {isLoading && <div className="font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">Laden…</div>}

        {adding && (
          <div className="space-y-3 rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.18)] p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={newField} onValueChange={setNewField}>
                <SelectTrigger className="h-8 text-xs w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRACKABLE_FIELDS.map(f => (
                    <SelectItem key={f.name} value={f.name}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Contactpersoon"
                className="h-8 text-xs flex-1 min-w-[140px]"
              />
              <Input
                type="email"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                placeholder="email@klant.nl"
                className="h-8 text-xs flex-1 min-w-[180px]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setAdding(false)}>Annuleren</Button>
              <Button size="sm" className="btn-primary h-7" onClick={handleAdd} disabled={createMut.isPending}>
                Toevoegen
              </Button>
            </div>
          </div>
        )}

        {openRequests.length === 0 && !adding && (
          <p className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.14)] px-3 py-2 font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground/75">
            Dossier compleet — geen openstaande info van klant.
          </p>
        )}

        {openRequests.map(req => {
          const isOverdue = req.status === "OVERDUE";
          return (
            <div
              key={req.id}
              className={`rounded-xl border p-3 text-sm ${isOverdue ? "border-red-300 bg-red-50/60" : "border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.20)]"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isOverdue
                      ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      : <Clock className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" />}
                    <span className="font-display text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] font-semibold">
                      {req.field_label ?? req.field_name}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {req.promised_by_name && (
                      <div>Belooft te sturen: <span className="font-medium text-foreground">{req.promised_by_name}</span>{req.promised_by_email ? ` (${req.promised_by_email})` : ""}</div>
                    )}
                    {req.expected_by && (
                      <div>
                        Verwacht {isOverdue ? "was" : "binnen"}: {" "}
                        <span className={isOverdue ? "text-red-700 font-medium tabular-nums" : "text-foreground tabular-nums"}>
                          {formatDistanceToNow(new Date(req.expected_by), { addSuffix: true, locale: nl })}
                        </span>
                      </div>
                    )}
                    <div>
                      Reminders verzonden: <span className="tabular-nums">{req.reminder_sent_at.length}</span>
                      {req.escalated_at ? " • planner geëscaleerd" : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="btn-luxe h-7 gap-1 px-2.5" onClick={() => handleFulfill(req)}>
                    <Check className="h-3 w-3" /> Vul in
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => handleRemind(req)}>
                    <Bell className="h-3 w-3" /> Herinner
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground" onClick={() => handleCancel(req)}>
                    <X className="h-3 w-3" /> Annuleer
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {closedRequests.length > 0 && (
          <details className="pt-2">
            <summary className="font-display text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70 cursor-pointer select-none">
              Historie (<span className="tabular-nums">{closedRequests.length}</span>)
            </summary>
            <div className="space-y-1 mt-2">
              {closedRequests.map(req => (
                <div key={req.id} className="flex items-center gap-2 rounded-md border border-[hsl(var(--gold)/0.10)] bg-white/55 px-2 py-1.5 text-xs text-muted-foreground">
                  {req.status === "FULFILLED"
                    ? <Check className="h-3 w-3 text-emerald-600" />
                    : <X className="h-3 w-3" />}
                  <span className="font-medium text-foreground">{req.field_label ?? req.field_name}</span>
                  {req.status === "FULFILLED" && req.fulfilled_value && (
                    <span>→ {req.fulfilled_value}</span>
                  )}
                  {req.status === "CANCELLED" && req.cancelled_reason && (
                    <span>({req.cancelled_reason})</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
