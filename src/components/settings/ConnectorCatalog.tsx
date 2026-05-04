import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Search, Sparkles, ShieldCheck, Zap, AlertCircle, ArrowRight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  type ConnectorCategory,
} from "@/lib/connectors/catalog";
import { useConnectorList, type ConnectorWithStatus } from "@/hooks/useConnectors";
import { cn } from "@/lib/utils";

interface Props {
  onSelect: (slug: string) => void;
}

type FilterChip = "alle" | ConnectorCategory;

const CHIP_ORDER: FilterChip[] = ["alle", "boekhouding", "telematica", "communicatie", "webshop_erp"];
const CHIP_LABELS: Record<FilterChip, string> = {
  alle: "Alle",
  ...CATEGORY_LABELS,
};

const BADGE_LABELS: Record<NonNullable<ConnectorWithStatus["badge"]>, string> = {
  officieel: "Officieel",
  populair: "Populair",
  nieuw: "Nieuw",
  aanbevolen: "Aanbevolen",
};

export function ConnectorCatalog({ onSelect }: Props) {
  const list = useConnectorList();
  const [filter, setFilter] = useState<FilterChip>("alle");
  const [query, setQuery] = useState("");

  const all = useMemo(() => list.data ?? [], [list.data]);

  const featured = useMemo(() => {
    const order = (c: ConnectorWithStatus) => {
      if (c.enabled && c.hasCredentials) return 0;
      if (c.status === "live") return 1;
      if (c.status === "beta") return 2;
      return 3;
    };
    // Eerst hand-gecureerde featured-connectors, daarna eventueel aangevuld op status.
    const curated = all.filter((c) => c.featured).sort((a, b) => order(a) - order(b));
    if (curated.length >= 4) return curated.slice(0, 4);
    const fallback = all.filter((c) => !c.featured).sort((a, b) => order(a) - order(b));
    return [...curated, ...fallback].slice(0, 4);
  }, [all]);

  if (list.isLoading) {
    return <div className="card--luxe p-6 text-sm text-muted-foreground">Laden...</div>;
  }

  const liveCount = all.filter((c) => c.enabled && c.hasCredentials).length;
  const availableCount = all.filter((c) => c.status !== "soon").length;
  const totalCount = all.length;

  const queryLower = query.trim().toLowerCase();
  const filtered = all.filter((c) => {
    if (filter !== "alle" && c.category !== filter) return false;
    if (!queryLower) return true;
    return (
      c.name.toLowerCase().includes(queryLower) ||
      c.description.toLowerCase().includes(queryLower) ||
      (c.capabilities ?? []).some((cap) => cap.toLowerCase().includes(queryLower))
    );
  });

  const liveAndBeta = filtered.filter((c) => c.status !== "soon");
  const roadmap = filtered.filter((c) => c.status === "soon");

  return (
    <div className="space-y-6">
      {/* HERO */}
      <div className="card--luxe relative overflow-hidden p-6">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[hsl(var(--gold)/0.18)] blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex h-7 items-center rounded-full bg-[hsl(var(--gold-soft))] px-2.5 text-[10px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
              Marketplace
            </span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Koppel OrderFlow aan je stack
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Boekhouding, telematica, communicatie of webshop, beheer alle koppelingen op een plek met sync-log, mapping en audit.
          </p>

          {/* Search */}
          <div className="relative mt-5 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek op naam, beschrijving of capability..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-[hsl(var(--gold)/0.25)] bg-white/80 backdrop-blur-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.35)] focus:border-[hsl(var(--gold)/0.4)] transition-all"
            />
          </div>

          {/* Health strip */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <HealthCell
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Verbonden"
              value={liveCount}
              tone="success"
              hint={liveCount === 0 ? "Nog geen koppelingen actief" : `${liveCount} ${liveCount === 1 ? "koppeling actief" : "koppelingen actief"}`}
            />
            <HealthCell
              icon={<Activity className="h-4 w-4" />}
              label="Beschikbaar"
              value={availableCount}
              tone="gold"
              hint="Klaar om te verbinden"
            />
            <HealthCell
              icon={<Sparkles className="h-4 w-4" />}
              label="Roadmap"
              value={totalCount - availableCount}
              tone="muted"
              hint="In voorbereiding"
            />
          </div>
        </div>
      </div>

      {/* FEATURED ROW */}
      {filter === "alle" && !queryLower && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.22em] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Aanbevolen
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {featured.map((c) => (
              <FeaturedCard key={c.slug} connector={c} onSelect={() => onSelect(c.slug)} />
            ))}
          </div>
        </section>
      )}

      {/* CATEGORY CHIPS */}
      <div className="flex flex-wrap items-center gap-2">
        {CHIP_ORDER.map((chip) => {
          const active = filter === chip;
          return (
            <button
              key={chip}
              onClick={() => setFilter(chip)}
              className={cn(
                "h-8 px-3.5 rounded-full text-xs font-display font-semibold transition-all border",
                active
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white border-transparent shadow-sm"
                  : "bg-white text-foreground border-[hsl(var(--gold)/0.22)] hover:border-[hsl(var(--gold)/0.4)] hover:bg-[hsl(var(--gold-soft)/0.4)]",
              )}
            >
              {CHIP_LABELS[chip]}
            </button>
          );
        })}
        {(query || filter !== "alle") && (
          <button
            onClick={() => { setFilter("alle"); setQuery(""); }}
            className="h-8 px-3 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Wis filter
          </button>
        )}
      </div>

      {/* RESULTS */}
      {liveAndBeta.length === 0 && roadmap.length === 0 ? (
        <div className="card--luxe p-10 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-semibold font-display text-foreground">Geen koppelingen gevonden</p>
          <p className="text-xs text-muted-foreground mt-1">Probeer een andere zoekterm of filter.</p>
        </div>
      ) : (
        <>
          {liveAndBeta.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.22em]">
                Beschikbaar
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveAndBeta.map((c) => (
                  <ConnectorCard key={c.slug} connector={c} onSelect={() => onSelect(c.slug)} />
                ))}
              </div>
            </section>
          )}

          {roadmap.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.22em]">
                  Op de roadmap
                </h3>
                <p className="text-xs text-muted-foreground">
                  Aangekondigd, deze koppelingen worden binnenkort live gezet.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {roadmap.map((c) => (
                  <RoadmapCard key={c.slug} connector={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* REQUEST PANEL */}
      <div className="card--luxe p-5 flex flex-col sm:flex-row sm:items-center gap-4 border-[hsl(var(--gold)/0.22)]">
        <div className="h-10 w-10 rounded-xl bg-[hsl(var(--gold-soft))] flex items-center justify-center text-[hsl(var(--gold-deep))] shrink-0">
          <Zap className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-display font-semibold text-foreground">Mis je een koppeling?</p>
          <p className="text-xs text-muted-foreground">Stuur een verzoek, dan stemmen we 'm in op de roadmap. Je hoort terug van het productteam.</p>
        </div>
        <a
          href={"mailto:product@orderflow.nl?subject=" + encodeURIComponent("Verzoek nieuwe koppeling") + "&body=" + encodeURIComponent("Ik mis de volgende koppeling in OrderFlow:\n\nNaam:\nWebsite:\nWaarom belangrijk:\n\nDank!")}
          className="h-10 px-4 rounded-xl text-xs font-display font-semibold bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm hover:opacity-95 transition-opacity flex items-center justify-center"
        >
          Vraag aan
        </a>
      </div>
    </div>
  );
}

function HealthCell({
  icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "success" | "gold" | "muted";
  hint: string;
}) {
  const palette = {
    success: "bg-emerald-50/70 border-emerald-200/60 text-emerald-700",
    gold: "bg-[hsl(var(--gold-soft)/0.5)] border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold-deep))]",
    muted: "bg-slate-50/80 border-slate-200/70 text-slate-600",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-3 flex items-center gap-3", palette)}>
      <span className="h-8 w-8 rounded-lg bg-white/70 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular-nums leading-none">{value}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">{label}</span>
        </div>
        <p className="text-[11px] opacity-80 mt-0.5 truncate">{hint}</p>
      </div>
    </div>
  );
}

function FeaturedCard({
  connector,
  onSelect,
}: {
  connector: ConnectorWithStatus;
  onSelect: () => void;
}) {
  const isLive = connector.enabled && connector.hasCredentials;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.25)] p-4 text-left transition-all hover:border-[hsl(var(--gold)/0.4)] hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
    >
      <BrandTile connector={connector} size={48} />
      <p className="mt-3 text-sm font-display font-semibold text-foreground truncate">{connector.name}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-snug">{connector.description}</p>
      <div className="mt-2.5 flex items-center justify-between">
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Verbonden
          </span>
        ) : connector.status === "soon" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            Roadmap
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-[hsl(var(--gold-deep))]">
            {connector.status === "beta" ? "Beta" : "Klaar om te verbinden"}
          </span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-[hsl(var(--gold-deep))] group-hover:translate-x-0.5 transition-all" />
      </div>
    </button>
  );
}

function ConnectorCard({
  connector,
  onSelect,
}: {
  connector: ConnectorWithStatus;
  onSelect: () => void;
}) {
  const isLive = connector.enabled && connector.hasCredentials;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group relative card--luxe p-5 text-left transition-all hover:border-[hsl(var(--gold)/0.4)] hover:shadow-[0_12px_32px_-14px_rgba(0,0,0,0.2)] hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <BrandTile connector={connector} />
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge connector={connector} live={isLive} />
          {connector.badge && (
            <Badge
              variant="outline"
              className="text-[9px] font-display font-bold uppercase tracking-[0.14em] border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.4)] text-[hsl(var(--gold-deep))]"
            >
              {BADGE_LABELS[connector.badge]}
            </Badge>
          )}
        </div>
      </div>

      <h4 className="mt-3 text-base font-display font-semibold text-foreground tracking-tight">
        {connector.name}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {connector.description}
      </p>

      {(connector.capabilities ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(connector.capabilities ?? []).map((cap) => (
            <span
              key={cap}
              className="inline-flex h-5 items-center px-2 rounded-full bg-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))] text-[10px] font-semibold tracking-wide"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {connector.supportedEvents.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {connector.supportedEvents.map((e) => (
            <span key={e} className="inline-flex h-5 items-center px-2 rounded-md border border-[hsl(var(--gold)/0.2)] bg-white text-[10px] font-mono text-muted-foreground">
              {e}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-[hsl(var(--gold)/0.12)] flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {CATEGORY_LABELS[connector.category]}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--gold-deep))] group-hover:gap-1.5 transition-all">
          {isLive ? "Beheren" : "Verbinden"}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function RoadmapCard({ connector }: { connector: ConnectorWithStatus }) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-white/60 p-4 text-left opacity-75">
      <div className="flex items-start justify-between gap-3">
        <BrandTile connector={connector} size={36} />
        <Badge variant="secondary" className="gap-1 text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-100">
          <Clock className="h-3 w-3" />
          Roadmap
        </Badge>
      </div>
      <h4 className="mt-3 text-sm font-display font-semibold text-foreground">{connector.name}</h4>
      <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
        {connector.description}
      </p>
    </div>
  );
}

function BrandTile({
  connector,
  size = 44,
}: {
  connector: ConnectorWithStatus;
  size?: number;
}) {
  if (connector.logoUrl) {
    return (
      <div
        className="rounded-xl bg-white border border-[hsl(var(--gold)/0.18)] flex items-center justify-center overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_3px_rgba(0,0,0,0.06)] shrink-0"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <img src={connector.logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center text-white font-display font-bold tracking-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_3px_rgba(0,0,0,0.12)] shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: `#${connector.brandColor}`,
        fontSize: size * 0.32,
      }}
      aria-hidden="true"
    >
      {connector.brandInitial}
    </div>
  );
}

function StatusBadge({
  connector,
  live,
}: {
  connector: ConnectorWithStatus;
  live: boolean;
}) {
  if (live) {
    return (
      <Badge className="gap-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 border-0">
        <CheckCircle2 className="h-3 w-3" />
        Verbonden
      </Badge>
    );
  }
  if (connector.status === "beta") {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-700">
        Beta
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] border-[hsl(var(--gold)/0.25)] bg-white text-muted-foreground">
      Niet verbonden
    </Badge>
  );
}
