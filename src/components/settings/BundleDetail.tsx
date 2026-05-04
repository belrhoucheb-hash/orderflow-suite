import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Radio, MapPin, Package, Lock, Zap, SkipForward, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findBundle, type ConnectorBundle } from "@/lib/connectors/bundles";
import { useConnectorList, type ConnectorWithStatus } from "@/hooks/useConnectors";
import { CATEGORY_LABELS } from "@/lib/connectors/catalog";
import { cn } from "@/lib/utils";

interface Props {
  bundleId: string;
  onBack: () => void;
  onSelectConnector: (slug: string) => void;
}

function skipKey(bundleId: string, slug: string): string {
  return `orderflow_bundle_skipped_${bundleId}_${slug}`;
}

function readSkipped(bundleId: string, slug: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(skipKey(bundleId, slug)) === "1";
  } catch {
    return false;
  }
}

function writeSkipped(bundleId: string, slug: string, skipped: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (skipped) {
      window.localStorage.setItem(skipKey(bundleId, slug), "1");
    } else {
      window.localStorage.removeItem(skipKey(bundleId, slug));
    }
  } catch {
    // localStorage onbeschikbaar, valt stil terug
  }
}

const ICONS = {
  sparkles: Sparkles,
  radio: Radio,
  "map-pin": MapPin,
  package: Package,
};

export function BundleDetail({ bundleId, onBack, onSelectConnector }: Props) {
  const bundle = findBundle(bundleId);
  const list = useConnectorList();

  const connectors = useMemo(() => {
    if (!bundle || !list.data) return [];
    return bundle.slugs
      .map((s) => list.data!.find((c) => c.slug === s))
      .filter((c): c is ConnectorWithStatus => Boolean(c));
  }, [bundle, list.data]);

  const [skipped, setSkipped] = useState<Record<string, boolean>>({});

  // Lees skip-state per slug uit localStorage zodra de bundel + slugs bekend zijn.
  useEffect(() => {
    if (!bundle) return;
    const next: Record<string, boolean> = {};
    for (const slug of bundle.slugs) {
      next[slug] = readSkipped(bundle.id, slug);
    }
    setSkipped(next);
  }, [bundle]);

  const toggleSkip = useCallback(
    (slug: string, value: boolean) => {
      if (!bundle) return;
      writeSkipped(bundle.id, slug, value);
      setSkipped((prev) => ({ ...prev, [slug]: value }));
    },
    [bundle],
  );

  if (!bundle) {
    return (
      <div className="card--luxe p-6">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[hsl(var(--gold-deep))]">
          <ArrowLeft className="h-3.5 w-3.5" /> Terug naar marketplace
        </button>
        <p className="mt-4 text-sm text-muted-foreground">Onbekende bundel: {bundleId}</p>
      </div>
    );
  }

  const Icon = ICONS[bundle.icon];
  const isLive = (c: ConnectorWithStatus) => c.enabled && c.hasCredentials;
  const liveCount = connectors.filter(isLive).length;
  // Skipped telt alleen als de connector niet al actief is, anders dubbeltelling.
  const skippedCount = connectors.filter((c) => !isLive(c) && skipped[c.slug]).length;
  const plannedCount = connectors.length - liveCount - skippedCount;
  const totalCount = connectors.length;
  // Voortgangsbalk: skipped telt als "voltooid" voor de %.
  const completedForBar = liveCount + skippedCount;
  const progress = totalCount === 0 ? 0 : Math.round((completedForBar / totalCount) * 100);

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[hsl(var(--gold-deep))] hover:gap-2 transition-all"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar marketplace
      </button>

      {/* HERO */}
      <BundleHero
        bundle={bundle}
        icon={Icon}
        progress={progress}
        liveCount={liveCount}
        skippedCount={skippedCount}
        plannedCount={plannedCount}
        totalCount={totalCount}
      />

      {/* WIZARD */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
            Onboarding-stappen
          </h3>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {liveCount} van {totalCount} koppelingen actief
          </span>
        </div>

        <div className="space-y-2">
          {connectors.map((connector, i) => (
            <BundleStep
              key={connector.slug}
              index={i}
              total={totalCount}
              connector={connector}
              skipped={Boolean(skipped[connector.slug])}
              onConnect={() => onSelectConnector(connector.slug)}
              onSkip={() => toggleSkip(connector.slug, true)}
              onUnskip={() => toggleSkip(connector.slug, false)}
            />
          ))}
        </div>
      </div>

      {/* SUMMARY */}
      <div className="rounded-2xl border border-[hsl(var(--gold)/0.22)] bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.3)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-[hsl(var(--gold-soft))] flex items-center justify-center text-[hsl(var(--gold-deep))] shrink-0">
            <Zap className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-display font-semibold text-foreground">Tip voor deze bundel</p>
            <p className="text-[12px] text-muted-foreground leading-relaxed mt-1">
              {bundle.tagline}. Werk de stappen op volgorde af, dan zorgt OrderFlow er automatisch voor dat events naar elke koppeling stromen zodra de eerste factuur of trip live gaat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BundleHero({
  bundle,
  icon: Icon,
  progress,
  liveCount,
  skippedCount,
  plannedCount,
  totalCount,
}: {
  bundle: ConnectorBundle;
  icon: typeof Sparkles;
  progress: number;
  liveCount: number;
  skippedCount: number;
  plannedCount: number;
  totalCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[hsl(var(--gold)/0.25)] p-6 sm:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_30px_60px_-30px_rgba(0,0,0,0.18)] bg-gradient-to-br",
        bundle.accent,
      )}
    >
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/40 blur-3xl pointer-events-none" />

      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex h-7 items-center rounded-full bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-3 text-[10px] font-display font-semibold uppercase tracking-[0.24em] text-white shadow-sm">
            Bundel
          </span>
          <span className="inline-flex h-7 items-center rounded-full border border-[hsl(var(--gold)/0.3)] bg-white/80 backdrop-blur-sm px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
            {totalCount} koppelingen
          </span>
        </div>

        <div className="flex items-start gap-4">
          <span className="h-14 w-14 rounded-2xl bg-white/80 backdrop-blur-sm flex items-center justify-center text-[hsl(var(--gold-deep))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_12px_rgba(0,0,0,0.06)] shrink-0">
            <Icon className="h-6 w-6" />
          </span>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">
              {bundle.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl leading-relaxed">
              {bundle.blurb}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white/70 backdrop-blur-sm border border-[hsl(var(--gold)/0.18)] p-4">
          <div className="flex items-center justify-between text-[11px] font-display font-semibold mb-2">
            <span className="uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]">Voortgang</span>
            <span className="tabular-nums text-foreground">{liveCount} / {totalCount} actief · {progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[hsl(var(--gold-soft))] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] rounded-full"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
            <span>gepland: <strong className="text-foreground font-display">{plannedCount}</strong></span>
            <span>overgeslagen: <strong className="text-foreground font-display">{skippedCount}</strong></span>
            <span>actief: <strong className="text-foreground font-display">{liveCount}</strong></span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function BundleStep({
  index,
  total,
  connector,
  skipped,
  onConnect,
  onSkip,
  onUnskip,
}: {
  index: number;
  total: number;
  connector: ConnectorWithStatus;
  skipped: boolean;
  onConnect: () => void;
  onSkip: () => void;
  onUnskip: () => void;
}) {
  const isLive = connector.enabled && connector.hasCredentials;
  const isLast = index === total - 1;
  const isSkipped = !isLive && skipped;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05 }}
      className="relative"
    >
      <div
        className={cn(
          "flex items-center gap-4 rounded-2xl border bg-white p-4 transition-all hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]",
          isLive
            ? "border-emerald-300 bg-gradient-to-br from-emerald-50/40 to-white"
            : isSkipped
              ? "border-slate-200 bg-slate-50/60"
              : "border-[hsl(var(--gold)/0.18)]",
        )}
      >
        {/* Step number */}
        <span
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center text-sm font-display font-bold shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]",
            isLive
              ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
              : isSkipped
                ? "bg-slate-200 text-slate-500 border border-slate-300"
                : "bg-gradient-to-br from-[hsl(var(--gold-soft))] to-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)/0.25)]",
          )}
        >
          {isLive ? <CheckCircle2 className="h-5 w-5" /> : isSkipped ? <SkipForward className="h-4 w-4" /> : index + 1}
        </span>

        {/* Logo */}
        <BundleConnectorTile connector={connector} />

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-display font-semibold tracking-tight truncate",
            isSkipped ? "text-muted-foreground" : "text-foreground",
          )}>{connector.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {CATEGORY_LABELS[connector.category]}
            {connector.status === "soon" && " · Roadmap"}
            {connector.status === "beta" && " · Beta"}
          </p>
        </div>

        {/* Right cluster: status + skip-action */}
        <div className="flex items-center gap-2 shrink-0">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-display font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Actief
            </span>
          ) : connector.status === "soon" ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-display font-semibold text-slate-600">
              Roadmap
            </span>
          ) : isSkipped ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-slate-100 border border-slate-300 text-[11px] font-display font-semibold text-slate-600">
                <SkipForward className="h-3 w-3" />
                Overgeslagen
              </span>
              <button
                type="button"
                onClick={onUnskip}
                className="inline-flex items-center gap-1 text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] hover:underline"
              >
                <RotateCcw className="h-3 w-3" />
                Toch verbinden
              </button>
            </>
          ) : (
            <>
              <Button
                onClick={onConnect}
                size="sm"
                className="h-9 px-3 rounded-xl text-xs font-display font-semibold bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-md hover:opacity-95 gap-1.5"
              >
                <Lock className="h-3 w-3" />
                Verbinden
                <ArrowRight className="h-3 w-3" />
              </Button>
              <button
                type="button"
                onClick={onSkip}
                className="text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition-colors px-1.5"
              >
                Sla over
              </button>
            </>
          )}
        </div>
      </div>

      {/* Connector line between steps */}
      {!isLast && (
        <div
          aria-hidden
          className="absolute left-9 -bottom-2 w-px h-2 bg-gradient-to-b from-[hsl(var(--gold)/0.4)] to-transparent"
        />
      )}
    </motion.div>
  );
}

function BundleConnectorTile({ connector }: { connector: ConnectorWithStatus }) {
  if (connector.logoUrl) {
    return (
      <div
        className="h-11 w-11 rounded-xl bg-white border border-[hsl(var(--gold)/0.22)] flex items-center justify-center overflow-hidden shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_6px_rgba(0,0,0,0.06)]"
        aria-hidden="true"
      >
        <img src={connector.logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-display font-bold text-sm shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_rgba(0,0,0,0.12)]"
      style={{ backgroundColor: `#${connector.brandColor}` }}
      aria-hidden="true"
    >
      {connector.brandInitial}
    </div>
  );
}
