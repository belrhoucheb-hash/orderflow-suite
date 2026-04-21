import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useClientAudit, type ClientAuditEntry } from "@/hooks/useClientAudit";
import { Clock, User } from "lucide-react";

interface Props {
  clientId: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Naam",
  kvk_number: "KvK-nummer",
  btw_number: "BTW-nummer",
  email: "E-mail",
  phone: "Telefoon",
  contact_person: "Contactpersoon",
  payment_terms: "Betalingstermijn",
  is_active: "Status",
  notes: "Notities",
  billing_email: "Factuur e-mail",
  address: "Hoofdadres",
  street: "Straat",
  city: "Plaats",
  zipcode: "Postcode",
  billing_address: "Factuuradres",
  billing_street: "Factuur straat",
  billing_city: "Factuur plaats",
  billing_zipcode: "Factuur postcode",
  shipping_address: "Postadres",
  shipping_street: "Post straat",
  shipping_city: "Post plaats",
  shipping_zipcode: "Post postcode",
  "contact.created": "Contact toegevoegd",
  "contact.updated": "Contact gewijzigd",
  "contact.deleted": "Contact verwijderd",
  "note.updated": "Notitie gewijzigd",
};

function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "leeg";
  if (typeof v === "boolean") return v ? "ja" : "nee";
  if (typeof v === "string") return v.length ? v : "leeg";
  if (typeof v === "number") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function ClientHistoryTab({ clientId }: Props) {
  const { data, isLoading } = useClientAudit(clientId);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Historie laden...</p>;
  }

  if (!data?.length) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Nog geen wijzigingen geregistreerd.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">
        Wijzigingen
      </h3>
      <ol className="relative space-y-3 border-l border-[hsl(var(--gold)/0.25)] pl-4 ml-1">
        {data.map((entry) => (
          <TimelineItem key={entry.id} entry={entry} />
        ))}
      </ol>
    </div>
  );
}

function TimelineItem({ entry }: { entry: ClientAuditEntry }) {
  const when = (() => {
    try {
      return format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: nl });
    } catch {
      return entry.created_at;
    }
  })();

  const oldText = formatValue(entry.old_value);
  const newText = formatValue(entry.new_value);

  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-[hsl(var(--gold-deep))]"
        style={{ background: "hsl(var(--gold-soft))" }}
      />
      <div
        className="rounded-lg border border-[hsl(var(--gold)/0.2)] px-3 py-2"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.15) 100%)",
        }}
      >
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1 min-w-0">
            <User className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{entry.user_name || "Systeem"}</span>
          </span>
          <span className="flex items-center gap-1 tabular-nums shrink-0">
            <Clock className="h-3 w-3" strokeWidth={1.5} />
            {when}
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-foreground">
          {labelForField(entry.field)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          <span className="line-through">{oldText}</span>
          <span className="mx-1.5 text-[hsl(var(--gold-deep))]">&rsaquo;</span>
          <span className="text-foreground">{newText}</span>
        </p>
      </div>
    </li>
  );
}
