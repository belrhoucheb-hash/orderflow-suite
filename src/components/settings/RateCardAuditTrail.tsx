import { useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { History, ChevronDown, ChevronUp, Plus, Pencil, Trash2 } from "lucide-react";
import { useRateCardAuditLog, type AuditLogEntry, type AuditAction } from "@/hooks/useRateCardAuditLog";

interface Props {
  rateCardId: string;
}

const ACTION_LABEL: Record<AuditAction, string> = {
  card_created: "Tariefkaart aangemaakt",
  card_updated: "Tariefkaart gewijzigd",
  card_deleted: "Tariefkaart verwijderd",
  rule_created: "Regel toegevoegd",
  rule_updated: "Regel gewijzigd",
  rule_deleted: "Regel verwijderd",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Naam",
  is_active: "Status",
  client_id: "Klant",
  valid_from: "Geldig vanaf",
  valid_until: "Geldig tot",
  currency: "Valuta",
  rule_type: "Type",
  amount: "Bedrag",
  min_amount: "Min. bedrag",
  transport_type: "Transporttype",
  conditions: "Condities",
  sort_order: "Volgorde",
  vehicle_type_id: "Voertuigtype",
};

function actionIcon(action: AuditAction) {
  if (action.endsWith("_created")) return Plus;
  if (action.endsWith("_deleted")) return Trash2;
  return Pencil;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "leeg";
  if (typeof v === "boolean") return v ? "aan" : "uit";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function summarizeEntry(entry: AuditLogEntry): { title: string; details: string[] } {
  const title = ACTION_LABEL[entry.action];
  const details: string[] = [];

  if (entry.action === "card_updated" || entry.action === "rule_updated") {
    for (const field of entry.changed_fields ?? []) {
      const label = FIELD_LABEL[field] ?? field;
      const before = entry.before_data?.[field];
      const after = entry.after_data?.[field];
      details.push(`${label}: ${formatValue(before)} → ${formatValue(after)}`);
    }
  } else if (entry.action === "rule_created" || entry.action === "card_created") {
    const name = entry.after_data?.name ?? entry.after_data?.rule_type;
    if (name) details.push(`${formatValue(name)}`);
  } else if (entry.action === "rule_deleted" || entry.action === "card_deleted") {
    const name = entry.before_data?.name ?? entry.before_data?.rule_type;
    if (name) details.push(`${formatValue(name)}`);
  }

  return { title, details };
}

export function RateCardAuditTrail({ rateCardId }: Props) {
  const [open, setOpen] = useState(false);
  const { data: entries = [], isLoading } = useRateCardAuditLog(rateCardId, 50);

  const rendered = useMemo(() => entries.map((e) => ({ entry: e, summary: summarizeEntry(e) })), [entries]);

  return (
    <div className="rounded-lg border border-[hsl(var(--gold)/0.15)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[hsl(var(--gold-soft)/0.2)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          <span className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
            Geschiedenis
          </span>
          <span className="text-[11px] text-muted-foreground">
            {isLoading ? "laden..." : `${entries.length} ${entries.length === 1 ? "gebeurtenis" : "gebeurtenissen"}`}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
        )}
      </button>

      {open && (
        <div className="border-t border-[hsl(var(--gold)/0.12)] divide-y divide-[hsl(var(--gold)/0.08)]">
          {isLoading && (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">Geschiedenis laden...</p>
          )}
          {!isLoading && entries.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
              Nog geen gebeurtenissen. Zodra iemand deze tariefkaart bewerkt verschijnt het hier.
            </p>
          )}
          {!isLoading && rendered.map(({ entry, summary }) => {
            const Icon = actionIcon(entry.action);
            const created = new Date(entry.created_at);
            const relative = formatDistanceToNow(created, { addSuffix: true, locale: nl });
            const absolute = format(created, "d MMM yyyy, HH:mm", { locale: nl });
            return (
              <div key={entry.id} className="px-3 py-2.5 flex items-start gap-3">
                <div
                  className="h-6 w-6 rounded-md flex items-center justify-center border border-[hsl(var(--gold)/0.3)] shrink-0 mt-0.5"
                  style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.7), hsl(var(--gold-soft)/0.25))" }}
                >
                  <Icon className="h-3 w-3 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-medium text-foreground">{summary.title}</p>
                    <p
                      className="text-[10px] text-muted-foreground tabular-nums shrink-0"
                      title={absolute}
                    >
                      {relative}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {entry.actor_display_name ?? "Onbekende gebruiker"}
                  </p>
                  {summary.details.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {summary.details.map((d, i) => (
                        <li key={i} className="text-[11px] text-foreground/80 pl-2 border-l-2 border-[hsl(var(--gold)/0.25)]">
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
