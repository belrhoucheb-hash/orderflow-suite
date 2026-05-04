import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Clock, Search, Sparkles, Zap, AlertCircle, ArrowRight, Activity,
  Lock, Radio, ArrowLeftRight, Webhook, KeyRound, Globe2, MapPin, Package, ChevronUp, X,
  Info, Users, TrendingUp, Rocket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  type ConnectorCategory,
} from "@/lib/connectors/catalog";
import { CONNECTOR_BUNDLES, type ConnectorBundle } from "@/lib/connectors/bundles";
import { useConnectorList, type ConnectorWithStatus } from "@/hooks/useConnectors";
import { useConnectorVotes } from "@/hooks/useConnectorVotes";
import { cn } from "@/lib/utils";
import { fuzzySearch, highlightSegments, type FuzzyMatch } from "@/lib/fuzzy";
import { EmptyStateIllustration } from "@/components/settings/connectors/EmptyStateIllustration";
import {
  MarketplaceTour,
  shouldAutoStartTour,
} from "@/components/settings/connectors/MarketplaceTour";
import { buildStripStats } from "@/lib/connectors/marketplaceStats";
// Marketplace fase 4 toevoegingen, additief.
import { BulkActionsBar } from "@/components/settings/connectors/BulkActionsBar";
import { HealthBanner } from "@/components/settings/connectors/HealthBanner";
import { HealthDot } from "@/components/settings/connectors/HealthDot";

interface Props {
  onSelect: (slug: string) => void;
  onSelectBundle?: (bundleId: string) => void;
}

const BUNDLE_ICONS = {
  sparkles: <Sparkles className="h-4 w-4" />,
  radio: <Radio className="h-4 w-4" />,
  "map-pin": <MapPin className="h-4 w-4" />,
  package: <Package className="h-4 w-4" />,
};

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


const CAPABILITY_ICON: Array<{ test: (cap: string) => boolean; icon: ReactNode }> = [
  { test: (c) => /oauth/i.test(c), icon: <Lock className="h-3 w-3" /> },
  { test: (c) => /api[\s-]?key/i.test(c), icon: <KeyRound className="h-3 w-3" /> },
  { test: (c) => /webhook/i.test(c), icon: <Webhook className="h-3 w-3" /> },
  { test: (c) => /realtime/i.test(c), icon: <Radio className="h-3 w-3" /> },
  { test: (c) => /bidirectioneel/i.test(c), icon: <ArrowLeftRight className="h-3 w-3" /> },
  { test: (c) => /(NL|BE|EU|wereldwijd|cloud)/i.test(c), icon: <Globe2 className="h-3 w-3" /> },
  { test: (c) => /push|sync/i.test(c), icon: <Zap className="h-3 w-3" /> },
];

function capabilityIcon(cap: string): ReactNode {
  return CAPABILITY_ICON.find((m) => m.test(cap))?.icon ?? <Sparkles className="h-3 w-3" />;
}

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const VALID_CATEGORIES: FilterChip[] = CHIP_ORDER;

function isValidChip(value: string | null): value is FilterChip {
  return !!value && (VALID_CATEGORIES as string[]).includes(value);
}

export function ConnectorCatalog({ onSelect, onSelectBundle }: Props) {
  const list = useConnectorList();
  const votes = useConnectorVotes();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initial state uit URL leiden, daarna twee-richtingen sync.
  const initialCat = searchParams.get("cat");
  const initialQuery = searchParams.get("q") ?? "";
  const initialCapability = searchParams.get("cap");
  const [filter, setFilter] = useState<FilterChip>(
    isValidChip(initialCat) ? initialCat : "alle",
  );
  const [query, setQuery] = useState(initialQuery);
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(initialCapability);

  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);

  const [tourOpen, setTourOpen] = useState(false);

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

  // URL sync: chip + query <-> ?cat=&q=
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (filter === "alle") params.delete("cat");
    else params.set("cat", filter);
    if (!query.trim()) params.delete("q");
    else params.set("q", query.trim());
    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      setSearchParams(params, { replace: true });
    }
    // We willen niet reageren op iedere searchParams-mutatie van buitenaf,
    // alleen op lokale filter/query-wijzigingen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, query]);

  // Autostart tour voor first-time users (als er items zijn).
  useEffect(() => {
    if (!list.isLoading && all.length > 0 && shouldAutoStartTour()) {
      const t = window.setTimeout(() => setTourOpen(true), 600);
      return () => window.clearTimeout(t);
    }
  }, [list.isLoading, all.length]);

  // Click-buiten + ESC sluit autocomplete.
  useEffect(() => {
    if (!autocompleteOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!searchWrapperRef.current) return;
      if (!searchWrapperRef.current.contains(e.target as Node)) {
        setAutocompleteOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAutocompleteOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [autocompleteOpen]);

  if (list.isLoading) {
    return <CatalogSkeleton />;
  }

  const liveCount = all.filter((c) => c.enabled && c.hasCredentials).length;
  const liveAvailableCount = all.filter((c) => c.enabled && c.hasCredentials && c.status !== "soon").length;
  const allEnabledLive = all.filter((c) => c.hasCredentials && c.status !== "soon");
  const allPaused = allEnabledLive.length > 0 && allEnabledLive.every((c) => !c.enabled);
  const availableCount = all.filter((c) => c.status !== "soon").length;
  const totalCount = all.length;

  const queryTrim = query.trim();
  const queryLower = queryTrim.toLowerCase();

  // Fuzzy autocomplete: top-5 suggesties op basis van naam/capabilities.
  const fuzzyMatches: Array<FuzzyMatch<ConnectorWithStatus>> = queryTrim
    ? fuzzySearch(all, queryTrim, {
        fields: [
          { name: "name", get: (c) => c.name, weight: 2 },
          { name: "description", get: (c) => c.description },
          {
            name: "capabilities",
            get: (c) => (c.capabilities ?? []).join(" "),
          },
          {
            name: "category",
            get: (c) => CATEGORY_LABELS[c.category],
          },
        ],
        limit: 50,
      })
    : [];
  const matchedSlugs = new Set(fuzzyMatches.map((m) => m.item.slug));
  const suggestions = fuzzyMatches.slice(0, 5);

  const filtered = all.filter((c) => {
    if (filter !== "alle" && c.category !== filter) return false;
    if (capabilityFilter && !(c.capabilities ?? []).includes(capabilityFilter)) return false;
    if (!queryLower) return true;
    return matchedSlugs.has(c.slug);
  });

  const liveAndBeta = filtered.filter((c) => c.status !== "soon");
  const roadmap = filtered.filter((c) => c.status === "soon");
  const showBundles = filter === "alle" && !queryLower && !capabilityFilter;
  const showFeatured = filter === "alle" && !queryLower && !capabilityFilter;
  const stripStats = buildStripStats(all);

  const handleSelectSuggestion = (slug: string) => {
    setAutocompleteOpen(false);
    setQuery("");
    onSelect(slug);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!autocompleteOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[activeSuggestion];
      if (pick) handleSelectSuggestion(pick.item.slug);
    }
  };

  return (
    <div className="space-y-8">
      {/* Marketplace fase 4: globale storingsbanner. */}
      <HealthBanner onSelect={onSelect} />

      {/* HERO */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-[28px] border border-[hsl(var(--gold)/0.25)] bg-gradient-to-br from-white via-[hsl(var(--gold-soft)/0.3)] to-white p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_30px_60px_-30px_rgba(0,0,0,0.18)]"
      >
        <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-[hsl(var(--gold)/0.22)] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-[hsl(var(--gold-light)/0.18)] blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(var(--gold-deep)) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex h-7 items-center rounded-full bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-3 text-[10px] font-display font-semibold uppercase tracking-[0.24em] text-white shadow-sm">
              Marketplace
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-[hsl(var(--gold)/0.3)] bg-white/70 backdrop-blur-sm px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
              <Sparkles className="h-3 w-3 mr-1" />
              {totalCount} koppelingen
            </span>
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              aria-label="Start marketplace-rondleiding"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[hsl(var(--gold)/0.3)] bg-white/70 backdrop-blur-sm px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] hover:bg-white hover:border-[hsl(var(--gold)/0.5)] transition-colors"
            >
              <Info className="h-3 w-3" />
              Tour
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatPill icon={<Users className="h-3 w-3" />}>
              <span className="tabular-nums font-semibold">{stripStats.topConnector.tenants}</span>
              <span className="ml-1 text-muted-foreground">tenants gebruiken {stripStats.topConnector.name} deze maand</span>
            </StatPill>
            <StatPill icon={<TrendingUp className="h-3 w-3" />}>
              <span className="tabular-nums font-semibold">{stripStats.newSinceLastMonth}</span>
              <span className="ml-1 text-muted-foreground">nieuwe koppelingen sinds vorige maand</span>
            </StatPill>
            <StatPill icon={<Rocket className="h-3 w-3" />}>
              <span className="tabular-nums font-semibold">{stripStats.bundlesSpeedup}%</span>
              <span className="ml-1 text-muted-foreground">sneller live met bundels</span>
            </StatPill>
          </div>

          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground leading-tight">
            Koppel OrderFlow aan je stack.
            <span className="block text-[hsl(var(--gold-deep))]">In een paar klikken live.</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Boekhouding, telematica, communicatie of webshop. Beheer alle koppelingen op een plek met sync-log, mapping, en audit. Officiele partners, OAuth-flows en realtime events ingebouwd.
          </p>

          <div ref={searchWrapperRef} className="relative mt-6 max-w-2xl" data-tour="search">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--gold-deep))] pointer-events-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveSuggestion(0);
                setAutocompleteOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (query.trim().length > 0) setAutocompleteOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              role="combobox"
              aria-expanded={autocompleteOpen && suggestions.length > 0}
              aria-controls="connector-autocomplete"
              aria-autocomplete="list"
              placeholder="Zoek op naam, capability of categorie..."
              className="w-full h-12 pl-11 pr-4 rounded-2xl border border-[hsl(var(--gold)/0.3)] bg-white text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold)/0.4)] focus:border-[hsl(var(--gold)/0.5)] transition-all"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-6 items-center rounded-md border border-[hsl(var(--gold)/0.25)] bg-white/80 px-2 text-[10px] font-mono text-muted-foreground pointer-events-none">
              /
            </kbd>

            {autocompleteOpen && suggestions.length > 0 && (
              <div
                id="connector-autocomplete"
                role="listbox"
                className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.25)] bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]"
              >
                {suggestions.map((s, i) => {
                  const segments = highlightSegments(s.item.name, s.matchedField === "name" ? s.matchedIndices : []);
                  const active = i === activeSuggestion;
                  return (
                    <button
                      key={s.item.slug}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveSuggestion(i)}
                      onClick={() => handleSelectSuggestion(s.item.slug)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        active ? "bg-[hsl(var(--gold-soft)/0.55)]" : "hover:bg-[hsl(var(--gold-soft)/0.3)]",
                      )}
                    >
                      <BrandTile connector={s.item} size={32} muted />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-display font-semibold tracking-tight text-foreground truncate">
                          {segments.map((seg, idx) =>
                            seg.match ? (
                              <mark
                                key={idx}
                                className="bg-transparent text-[hsl(var(--gold-deep))] font-bold"
                              >
                                {seg.text}
                              </mark>
                            ) : (
                              <span key={idx}>{seg.text}</span>
                            ),
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {CATEGORY_LABELS[s.item.category]}
                          {s.item.status === "soon" ? " , Roadmap" : ""}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Marketplace fase 4: bulk-acties onder de zoekbar. */}
          {liveCount > 0 && (
            <div className="mt-4">
              <BulkActionsBar liveCount={liveAvailableCount} paused={allPaused} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </motion.div>

      {showFeatured && (
        <section data-tour="featured">
          <SectionHeader eyebrow="Aanbevolen" subtitle="Onze pick voor 2026" icon={<Sparkles className="h-3.5 w-3.5" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
            <AnimatePresence>
              {featured.map((c, i) => (
                <FeaturedCard key={c.slug} connector={c} delay={i * 0.05} onSelect={() => onSelect(c.slug)} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {showBundles && (
        <section data-tour="bundles">
          <SectionHeader eyebrow="Bundels" subtitle="Klaar-voor-gebruik combinaties met onboarding-wizard" icon={<Zap className="h-3.5 w-3.5" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
            {CONNECTOR_BUNDLES.map((bundle, i) => (
              <BundleCard
                key={bundle.id}
                bundle={bundle}
                connectors={all.filter((c) => bundle.slugs.includes(c.slug))}
                delay={i * 0.05}
                onOpen={() => onSelectBundle?.(bundle.id)}
              />
            ))}
          </div>
        </section>
      )}

      <div data-tour="chips" className="flex flex-wrap items-center gap-2 sticky top-0 z-10 -mx-1 px-1 py-2 bg-gradient-to-b from-background via-background/95 to-transparent">
        {CHIP_ORDER.map((chip) => {
          const active = filter === chip;
          const count = chip === "alle" ? all.length : all.filter((c) => c.category === chip).length;
          return (
            <button
              key={chip}
              onClick={() => setFilter(chip)}
              className={cn(
                "h-9 px-4 rounded-full text-xs font-display font-semibold transition-all border inline-flex items-center gap-1.5",
                active
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white border-transparent shadow-[0_8px_20px_-8px_hsl(var(--gold-deep)/0.5)]"
                  : "bg-white text-foreground border-[hsl(var(--gold)/0.22)] hover:border-[hsl(var(--gold)/0.45)] hover:bg-[hsl(var(--gold-soft)/0.4)] hover:-translate-y-0.5",
              )}
            >
              {CHIP_LABELS[chip]}
              <span className={cn(
                "ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums",
                active ? "bg-white/25 text-white" : "bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))]",
              )}>
                {count}
              </span>
            </button>
          );
        })}
        {capabilityFilter && (
          <button
            type="button"
            onClick={() => setCapabilityFilter(null)}
            aria-label={`Wis capability-filter ${capabilityFilter}`}
            className="h-9 px-3 rounded-full text-xs font-display font-semibold inline-flex items-center gap-1.5 border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold-soft)/0.6)] text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft))] transition-colors"
          >
            {capabilityIcon(capabilityFilter)}
            {capabilityFilter}
            <X className="h-3 w-3" />
          </button>
        )}
        {(query || filter !== "alle" || capabilityFilter) && (
          <button
            onClick={() => { setFilter("alle"); setQuery(""); setCapabilityFilter(null); }}
            className="h-9 px-3 rounded-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Wis filter
          </button>
        )}
      </div>

      {liveAndBeta.length === 0 && roadmap.length === 0 ? (
        <EmptyStateIllustration
          category={filter}
          query={queryTrim || undefined}
          onClear={() => {
            setFilter("alle");
            setQuery("");
            setAutocompleteOpen(false);
          }}
        />
      ) : (
        <>
          {liveAndBeta.length > 0 && (
            <section className="space-y-4">
              <SectionHeader eyebrow="Beschikbaar" subtitle={`${liveAndBeta.length} ${liveAndBeta.length === 1 ? "koppeling" : "koppelingen"} klaar om te verbinden`} icon={<CheckCircle2 className="h-3.5 w-3.5" />} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {liveAndBeta.map((c, i) => (
                    <ConnectorCard
                      key={c.slug}
                      connector={c}
                      delay={i * 0.04}
                      onSelect={() => onSelect(c.slug)}
                      activeCapability={capabilityFilter}
                      onCapabilityClick={(cap) =>
                        setCapabilityFilter((current) => (current === cap ? null : cap))
                      }
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          )}

          {roadmap.length > 0 && (
            <section className="space-y-4">
              <SectionHeader
                eyebrow="Op de roadmap"
                subtitle="Stem voor de koppelingen die jij het hardste nodig hebt, hoogste stemmen eerst"
                icon={<Clock className="h-3.5 w-3.5" />}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                <AnimatePresence>
                  {[...roadmap]
                    .sort((a, b) => votes.voteCount(b.slug) - votes.voteCount(a.slug))
                    .map((c, i) => (
                      <RoadmapCard
                        key={c.slug}
                        connector={c}
                        delay={i * 0.03}
                        voteCount={votes.voteCount(c.slug)}
                        hasVoted={votes.hasVoted(c.slug)}
                        onVote={() => votes.toggleVote(c.slug)}
                      />
                    ))}
                </AnimatePresence>
              </div>
            </section>
          )}
        </>
      )}

      <div className="relative overflow-hidden rounded-[24px] border border-[hsl(var(--gold)/0.25)] bg-gradient-to-br from-[hsl(var(--gold-deep))] via-[hsl(var(--gold-deep))] to-[hsl(var(--gold))] p-6 sm:p-7 text-white shadow-[0_20px_40px_-20px_hsl(var(--gold-deep)/0.5)]">
        <div className="absolute -top-20 -right-20 h-48 w-48 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]">
            <Zap className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <p className="text-base font-display font-semibold tracking-tight">Mis je een koppeling?</p>
            <p className="text-sm text-white/85 mt-0.5">
              Stuur een verzoek, wij stemmen 'm in op de roadmap en je hoort terug van het productteam.
            </p>
          </div>
          <a
            href={"mailto:product@orderflow.nl?subject=" + encodeURIComponent("Verzoek nieuwe koppeling") + "&body=" + encodeURIComponent("Ik mis de volgende koppeling in OrderFlow:\n\nNaam:\nWebsite:\nWaarom belangrijk:\n\nDank!")}
            className="h-11 px-5 rounded-xl text-xs font-display font-semibold bg-white text-[hsl(var(--gold-deep))] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)] hover:shadow-[0_6px_16px_-4px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-1.5"
          >
            Vraag aan
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <MarketplaceTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

function StatPill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.5)] px-3 text-[11px] font-medium text-foreground/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <span className="text-[hsl(var(--gold-deep))]">{icon}</span>
      {children}
    </span>
  );
}

function SectionHeader({ eyebrow, subtitle, icon }: { eyebrow: string; subtitle: string; icon?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.24em] flex items-center gap-1.5">
          {icon}
          {eyebrow}
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-[hsl(var(--gold)/0.18)] bg-white p-8 animate-pulse">
        <div className="h-6 w-40 rounded-full bg-[hsl(var(--gold-soft))]" />
        <div className="mt-4 h-9 w-2/3 rounded-lg bg-slate-100" />
        <div className="mt-2 h-4 w-1/2 rounded-md bg-slate-50" />
        <div className="mt-6 h-12 w-full max-w-2xl rounded-2xl bg-slate-50" />
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-50" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-44 rounded-2xl bg-white border border-[hsl(var(--gold)/0.12)] animate-pulse" />
        ))}
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
  icon: ReactNode;
  label: string;
  value: number;
  tone: "success" | "gold" | "muted";
  hint: string;
}) {
  const palette = {
    success: "bg-gradient-to-br from-emerald-50 to-emerald-50/40 border-emerald-200/70 text-emerald-700",
    gold: "bg-gradient-to-br from-[hsl(var(--gold-soft)/0.6)] to-[hsl(var(--gold-soft)/0.2)] border-[hsl(var(--gold)/0.3)] text-[hsl(var(--gold-deep))]",
    muted: "bg-gradient-to-br from-slate-50 to-white border-slate-200/70 text-slate-600",
  }[tone];
  return (
    <div className={cn("rounded-2xl border p-4 flex items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]", palette)}>
      <span className="h-10 w-10 rounded-xl bg-white/80 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.05)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-semibold tabular-nums leading-none">{value}</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">{label}</span>
        </div>
        <p className="text-[11px] opacity-75 mt-0.5 truncate">{hint}</p>
      </div>
    </div>
  );
}

function FeaturedCard({
  connector,
  delay,
  onSelect,
}: {
  connector: ConnectorWithStatus;
  delay: number;
  onSelect: () => void;
}) {
  const isLive = connector.enabled && connector.hasCredentials;
  const tint = withAlpha(connector.brandColor, 0.06);
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -3 }}
      className="group relative rounded-2xl border border-[hsl(var(--gold)/0.2)] p-5 text-left overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_rgba(0,0,0,0.06)] hover:border-[hsl(var(--gold)/0.45)] hover:shadow-[0_16px_36px_-16px_rgba(0,0,0,0.22)] transition-shadow"
      style={{
        background: `linear-gradient(135deg, ${tint} 0%, white 50%, hsl(var(--gold-soft) / 0.25) 100%)`,
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 inset-x-0 h-1"
        style={{ backgroundColor: `#${connector.brandColor}` }}
      />
      <div className="flex items-start justify-between gap-3">
        <BrandTile connector={connector} size={56} />
        {connector.badge && (
          <Badge
            variant="outline"
            className="text-[9px] font-display font-bold uppercase tracking-[0.16em] border-[hsl(var(--gold)/0.3)] bg-white/80 backdrop-blur-sm text-[hsl(var(--gold-deep))]"
          >
            {BADGE_LABELS[connector.badge]}
          </Badge>
        )}
      </div>
      <p className="mt-4 text-base font-display font-semibold text-foreground tracking-tight truncate">{connector.name}</p>
      <p className="mt-1 text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{connector.description}</p>
      <div className="mt-4 flex items-center justify-between">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-display font-semibold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Verbonden
          </span>
        ) : connector.status === "soon" ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            Roadmap
          </span>
        ) : (
          <span className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))]">
            {connector.status === "beta" ? "Beta" : "Klaar om te verbinden"}
          </span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-[hsl(var(--gold-deep))] group-hover:translate-x-0.5 transition-all" />
      </div>
    </motion.button>
  );
}

function ConnectorCard({
  connector,
  delay,
  onSelect,
  activeCapability,
  onCapabilityClick,
}: {
  connector: ConnectorWithStatus;
  delay: number;
  onSelect: () => void;
  activeCapability?: string | null;
  onCapabilityClick?: (cap: string) => void;
}) {
  const isLive = connector.enabled && connector.hasCredentials;
  const tint = withAlpha(connector.brandColor, 0.04);
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -2 }}
      className="group relative rounded-2xl border border-[hsl(var(--gold)/0.18)] p-5 text-left overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_rgba(0,0,0,0.05)] hover:border-[hsl(var(--gold)/0.45)] hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.22)] transition-shadow cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--gold)/0.5)]"
      style={{
        background: `linear-gradient(180deg, white 0%, ${tint} 100%)`,
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 inset-x-0 h-[3px] opacity-80 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: `#${connector.brandColor}` }}
      />
      <span
        aria-hidden
        className="absolute -inset-y-2 -left-2/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-[hsl(var(--gold)/0.16)] to-transparent opacity-0 group-hover:opacity-100 group-hover:left-full transition-all duration-700 ease-out pointer-events-none"
      />

      <div className="flex items-start justify-between gap-3">
        <BrandTile connector={connector} size={52} />
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge connector={connector} live={isLive} />
          {isLive && <HealthDot slug={connector.slug} />}
          {connector.badge && (
            <Badge
              variant="outline"
              className="text-[9px] font-display font-bold uppercase tracking-[0.16em] border-[hsl(var(--gold)/0.3)] bg-white/80 backdrop-blur-sm text-[hsl(var(--gold-deep))]"
            >
              {BADGE_LABELS[connector.badge]}
            </Badge>
          )}
        </div>
      </div>

      <h4 className="mt-4 text-base font-display font-semibold text-foreground tracking-tight">
        {connector.name}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {connector.description}
      </p>

      {(connector.capabilities ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(connector.capabilities ?? []).map((cap) => {
            const active = activeCapability === cap;
            const clickable = Boolean(onCapabilityClick);
            return (
              <button
                key={cap}
                type="button"
                disabled={!clickable}
                onClick={(e) => {
                  if (!clickable) return;
                  e.stopPropagation();
                  onCapabilityClick?.(cap);
                }}
                aria-pressed={active}
                title={clickable ? `Filter op ${cap}` : cap}
                className={cn(
                  "inline-flex h-6 items-center gap-1 px-2 rounded-full text-[10px] font-display font-semibold tracking-wide transition-all",
                  active
                    ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                    : "bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]",
                  clickable && !active && "hover:bg-[hsl(var(--gold-soft))] hover:ring-1 hover:ring-[hsl(var(--gold)/0.4)]",
                  !clickable && "cursor-default",
                )}
              >
                {capabilityIcon(cap)}
                {cap}
              </button>
            );
          })}
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
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {CATEGORY_LABELS[connector.category]}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] group-hover:gap-1.5 transition-all">
          {isLive ? "Beheren" : "Verbinden"}
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </motion.div>
  );
}

function RoadmapCard({
  connector,
  delay,
  voteCount,
  hasVoted,
  onVote,
}: {
  connector: ConnectorWithStatus;
  delay: number;
  voteCount: number;
  hasVoted: boolean;
  onVote: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.25, delay }}
      className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-gradient-to-br from-white to-slate-50/40 p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] hover:border-[hsl(var(--gold)/0.3)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <BrandTile connector={connector} size={40} muted />
        <Badge variant="secondary" className="gap-1 text-[10px] bg-slate-100 text-slate-600 hover:bg-slate-100 border-0">
          <Clock className="h-3 w-3" />
          Roadmap
        </Badge>
      </div>
      <h4 className="mt-3 text-sm font-display font-semibold text-foreground tracking-tight">{connector.name}</h4>
      <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
        {connector.description}
      </p>
      <div className="mt-3 pt-3 border-t border-[hsl(var(--gold)/0.1)] flex items-center justify-between">
        <span className="text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Stem voor versnelling
        </span>
        <button
          type="button"
          onClick={onVote}
          aria-pressed={hasVoted}
          className={cn(
            "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-[11px] font-display font-semibold tabular-nums transition-all",
            hasVoted
              ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white border-transparent shadow-[0_4px_12px_-4px_hsl(var(--gold-deep)/0.4)]"
              : "bg-white text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.3)] hover:border-[hsl(var(--gold)/0.5)] hover:bg-[hsl(var(--gold-soft)/0.4)]",
          )}
        >
          <ChevronUp className={cn("h-3 w-3 transition-transform", hasVoted && "scale-110")} />
          {voteCount}
        </button>
      </div>
    </motion.div>
  );
}

function BundleCard({
  bundle,
  connectors,
  delay,
  onOpen,
}: {
  bundle: ConnectorBundle;
  connectors: ConnectorWithStatus[];
  delay: number;
  onOpen: () => void;
}) {
  const liveCount = connectors.filter((c) => c.enabled && c.hasCredentials).length;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -3 }}
      className={cn(
        "group relative rounded-2xl border border-[hsl(var(--gold)/0.18)] p-5 overflow-hidden text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_3px_rgba(0,0,0,0.05)] hover:border-[hsl(var(--gold)/0.4)] hover:shadow-[0_16px_36px_-16px_rgba(0,0,0,0.22)] transition-shadow bg-gradient-to-br",
        bundle.accent,
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="h-8 w-8 rounded-xl bg-white/80 backdrop-blur-sm flex items-center justify-center text-[hsl(var(--gold-deep))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.05)]">
          {BUNDLE_ICONS[bundle.icon]}
        </span>
        <p className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]">Bundel</p>
      </div>
      <h4 className="text-base font-display font-semibold text-foreground tracking-tight">{bundle.title}</h4>
      <p className="text-[12px] text-muted-foreground leading-relaxed mt-1 mb-4">{bundle.blurb}</p>
      <div className="flex items-center -space-x-2 mb-4">
        {connectors.map((c) => (
          <div key={c.slug} className="relative rounded-xl bg-white ring-2 ring-white" title={c.name}>
            <BrandTile connector={c} size={36} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground">
          {liveCount} van {connectors.length} actief
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] group-hover:gap-1.5 transition-all">
          Open onboarding
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </motion.button>
  );
}

function BrandTile({
  connector,
  size = 44,
  muted = false,
}: {
  connector: ConnectorWithStatus;
  size?: number;
  muted?: boolean;
}) {
  const radius = Math.round(size * 0.27);
  if (connector.logoUrl) {
    return (
      <div
        className={cn(
          "bg-white border flex items-center justify-center overflow-hidden shrink-0 transition-all",
          muted
            ? "border-[hsl(var(--gold)/0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_1px_2px_rgba(0,0,0,0.04)]"
            : "border-[hsl(var(--gold)/0.22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_6px_rgba(0,0,0,0.08)] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_10px_rgba(0,0,0,0.12)]",
        )}
        style={{ width: size, height: size, borderRadius: radius }}
        aria-hidden="true"
      >
        <img src={connector.logoUrl} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center text-white font-display font-bold tracking-tight shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_6px_rgba(0,0,0,0.12)]"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
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
      <Badge className="gap-1 text-[10px] font-display bg-emerald-600 hover:bg-emerald-700 border-0">
        <CheckCircle2 className="h-3 w-3" />
        Verbonden
      </Badge>
    );
  }
  if (connector.status === "beta") {
    return (
      <Badge variant="outline" className="text-[10px] font-display border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-700">
        Beta
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] font-display border-[hsl(var(--gold)/0.25)] bg-white/80 backdrop-blur-sm text-muted-foreground">
      Niet verbonden
    </Badge>
  );
}
