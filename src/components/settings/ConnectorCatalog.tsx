import { CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  type ConnectorCategory,
} from "@/lib/connectors/catalog";
import { useConnectorList, type ConnectorWithStatus } from "@/hooks/useConnectors";

interface Props {
  onSelect: (slug: string) => void;
}

export function ConnectorCatalog({ onSelect }: Props) {
  const list = useConnectorList();

  if (list.isLoading) {
    return <div className="card--luxe p-6 text-sm text-muted-foreground">Laden...</div>;
  }

  const grouped: Record<ConnectorCategory, ConnectorWithStatus[]> = {
    boekhouding: [],
    telematica: [],
    klantportaal: [],
    overig: [],
  };
  for (const c of list.data ?? []) grouped[c.category].push(c);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Integraties</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Koppel OrderFlow aan je boekhouding, telematica of klantportaal. Per koppeling beheer je verbinding, mapping en sync-log op één plek.
        </p>
      </div>

      {(Object.keys(grouped) as ConnectorCategory[])
        .filter((cat) => grouped[cat].length > 0)
        .map((cat) => (
          <section key={cat} className="space-y-3">
            <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.18em]">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped[cat].map((c) => (
                <ConnectorCard key={c.slug} connector={c} onSelect={() => onSelect(c.slug)} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function ConnectorCard({
  connector,
  onSelect,
}: {
  connector: ConnectorWithStatus;
  onSelect: () => void;
}) {
  const isSoon = connector.status === "soon";
  const isLive = connector.enabled && connector.hasCredentials;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isSoon}
      className={`card--luxe p-5 text-left transition-all group ${
        isSoon ? "opacity-60 cursor-not-allowed" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="h-10 w-10 rounded-md bg-muted/30 border border-border flex items-center justify-center text-xs text-muted-foreground">
          {connector.name.slice(0, 2).toUpperCase()}
        </div>
        <StatusBadge connector={connector} live={isLive} />
      </div>
      <h4 className="mt-3 text-base font-semibold text-foreground">{connector.name}</h4>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        {connector.description}
      </p>
      {connector.supportedEvents.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {connector.supportedEvents.map((e) => (
            <Badge key={e} variant="outline" className="text-[10px] font-mono">{e}</Badge>
          ))}
        </div>
      )}
    </button>
  );
}

function StatusBadge({
  connector,
  live,
}: {
  connector: ConnectorWithStatus;
  live: boolean;
}) {
  if (connector.status === "soon") {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px]">
        <Clock className="h-3 w-3" />
        Binnenkort
      </Badge>
    );
  }
  if (live) {
    return (
      <Badge variant="default" className="gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Verbonden
      </Badge>
    );
  }
  if (connector.status === "beta") {
    return <Badge variant="outline" className="text-[10px]">Beta</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">Niet verbonden</Badge>;
}
