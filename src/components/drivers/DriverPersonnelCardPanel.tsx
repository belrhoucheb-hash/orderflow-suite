import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDriverPersonnelCard } from "@/hooks/useDriverPersonnelCard";

export function DriverPersonnelCardPanel({ driverId }: { driverId: string | null }) {
  const { data, isLoading } = useDriverPersonnelCard(driverId);

  if (!driverId) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Sla eerst de chauffeur op, daarna kan de personeelskaart worden gekoppeld.
      </p>
    );
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Personeelskaart laden...</div>;
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-5 text-sm text-muted-foreground">
        Nog geen personeelskaart uit Nostradamus gevonden voor deze chauffeur.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/20 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">Nostradamus personeelskaart</div>
          <div className="text-xs text-muted-foreground">
            Laatste sync: {new Date(data.synced_at).toLocaleString("nl-NL")}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Personeelsnr: {data.external_employee_id ?? "onbekend"}
        </div>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
          {[
            { value: "details", label: "Details" },
            { value: "contract", label: "Contract" },
            { value: "uren", label: "Uren" },
            { value: "verlof", label: "Verlof" },
            { value: "ziekte", label: "Ziekte" },
            { value: "bestanden", label: "Bestanden" },
          ].map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="rounded-xl border border-border/50">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <KeyValueCard title="Details" value={data.details_json} emptyLabel="Nog geen detailgegevens ontvangen." />
        </TabsContent>
        <TabsContent value="contract" className="mt-4">
          <KeyValueCard title="Contract" value={data.contract_json} emptyLabel="Nog geen contractgegevens ontvangen." />
        </TabsContent>
        <TabsContent value="uren" className="mt-4">
          <KeyValueCard title="Uren" value={data.hours_json} emptyLabel="Nog geen urengegevens ontvangen." />
        </TabsContent>
        <TabsContent value="verlof" className="mt-4">
          <ArrayCard title="Verlof" value={data.leave_json} emptyLabel="Nog geen verlofregels aanwezig." />
        </TabsContent>
        <TabsContent value="ziekte" className="mt-4">
          <ArrayCard title="Ziekte" value={data.sickness_json} emptyLabel="Nog geen ziekteregels aanwezig." />
        </TabsContent>
        <TabsContent value="bestanden" className="mt-4">
          <ArrayCard title="Bestanden" value={data.files_json} emptyLabel="Nog geen bestanden aanwezig." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KeyValueCard({
  title,
  value,
  emptyLabel,
}: {
  title: string;
  value: Record<string, unknown> | null;
  emptyLabel: string;
}) {
  const entries = value ? Object.entries(value) : [];
  return (
    <div className="rounded-2xl border border-border/50 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map(([key, raw]) => (
            <div key={key} className="rounded-xl bg-muted/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{humanizeKey(key)}</div>
              <div className="mt-1 text-sm text-foreground break-words">{formatValue(raw)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArrayCard({
  title,
  value,
  emptyLabel,
}: {
  title: string;
  value: unknown[] | null;
  emptyLabel: string;
}) {
  const rows = Array.isArray(value) ? value : [];
  return (
    <div className="rounded-2xl border border-border/50 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <pre key={index} className="overflow-x-auto rounded-xl bg-muted/20 p-3 text-xs text-foreground">
              {JSON.stringify(row, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </div>
  );
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
