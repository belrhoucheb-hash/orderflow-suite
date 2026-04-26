import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronDown, ChevronRight, ShieldAlert, CheckCircle2, AlertTriangle, Unlock,
  X, Car, ExternalLink,
} from "lucide-react";
import {
  useVehicleCheckHistory,
  useReleaseVehicleCheck,
  useBulkSignedPhotoUrls,
  type VehicleCheckHistoryRow,
} from "@/hooks/useVehicleCheckHistory";
import { useVehicles } from "@/hooks/useVehicles";
import { useDrivers } from "@/hooks/useDrivers";
import { toast } from "sonner";
import { LuxeSelect } from "@/components/ui/LuxeSelect";
import { LuxeDatePicker } from "@/components/ui/LuxePicker";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "In uitvoering",
  OK: "OK",
  DAMAGE_FOUND: "Schade gemeld",
  RELEASED: "Vrijgegeven",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string }> = {
  PENDING:       { bg: "hsl(var(--muted))",       fg: "hsl(var(--muted-foreground))", border: "hsl(var(--border))" },
  OK:            { bg: "hsl(142 60% 94%)",        fg: "hsl(142 55% 28%)",             border: "hsl(142 40% 70%)" },
  DAMAGE_FOUND:  { bg: "hsl(0 80% 95%)",          fg: "hsl(0 65% 40%)",               border: "hsl(0 55% 75%)" },
  RELEASED:      { bg: "hsl(var(--gold-soft))",   fg: "hsl(var(--gold-deep))",        border: "hsl(var(--gold) / 0.4)" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold"
      style={{
        background: s.bg, color: s.fg,
        border: `1px solid ${s.border}`,
        fontFamily: "var(--font-display)",
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

interface LightboxPhoto {
  url: string;
  side: string;
  severity: string;
  ai_description: string | null;
  ai_diff: string | null;
}

function Lightbox({ photo, onClose }: { photo: LightboxPhoto; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sevColor =
    photo.severity === "blocking" ? "hsl(0 65% 40%)" :
    photo.severity === "minor" ? "hsl(32 70% 35%)" :
    "hsl(142 55% 28%)";
  const sevLabel =
    photo.severity === "blocking" ? "Blokkerend" :
    photo.severity === "minor" ? "Minor" : "OK";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-w-5xl w-full max-h-[90vh] overflow-auto rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="absolute top-3 right-3 z-10 rounded-full p-2 bg-background/80 hover:bg-background border border-border/60 shadow"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="grid md:grid-cols-[1.5fr_1fr] gap-0">
          <div className="bg-black flex items-center justify-center">
            <img src={photo.url} alt={photo.side} className="w-full h-auto max-h-[80vh] object-contain" />
          </div>
          <div className="p-5 space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                Zijde
              </div>
              <div className="text-lg font-semibold capitalize" style={{ fontFamily: "var(--font-display)" }}>
                {photo.side}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                Severity
              </div>
              <div className="text-sm font-semibold" style={{ color: sevColor, fontFamily: "var(--font-display)" }}>
                {sevLabel}
              </div>
            </div>
            {photo.ai_description && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  AI beschrijving
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{photo.ai_description}</p>
              </div>
            )}
            {photo.ai_diff && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold mb-1" style={{ fontFamily: "var(--font-display)" }}>
                  Verschil met baseline
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{photo.ai_diff}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoThumb({
  url, severity, onClick,
}: { url: string | null; severity: string; onClick: () => void }) {
  const ring =
    severity === "blocking" ? "ring-red-400" :
    severity === "minor" ? "ring-amber-400" :
    "ring-emerald-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-20 h-20 rounded-lg overflow-hidden bg-muted ring-2 ${ring} hover:scale-105 transition-transform`}
      aria-label="Vergroot foto"
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : null}
    </button>
  );
}

function RowDetail({
  row, urlMap, onRelease, onPhoto,
}: {
  row: VehicleCheckHistoryRow;
  urlMap: Record<string, string>;
  onRelease: () => void;
  onPhoto: (p: LightboxPhoto) => void;
}) {
  return (
    <div className="px-4 pb-4 pt-1 bg-background/50">
      {row.photos.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))] mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Foto's
          </div>
          <div className="flex flex-wrap gap-2">
            {row.photos.map((p) => {
              const url = urlMap[p.storage_path] ?? null;
              return (
                <div key={p.id} className="flex flex-col gap-1 items-center">
                  <PhotoThumb
                    url={url}
                    severity={p.severity}
                    onClick={() => {
                      if (!url) return;
                      onPhoto({
                        url,
                        side: p.side,
                        severity: p.severity,
                        ai_description: p.ai_description,
                        ai_diff: p.ai_diff,
                      });
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{p.side}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {row.damage_events.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-red-700" style={{ fontFamily: "var(--font-display)" }}>
              Schade-meldingen
            </div>
            <Link
              to={`/voertuigcheck/voertuig/${row.vehicle_id}`}
              className="text-xs text-[hsl(var(--gold-deep))] hover:underline inline-flex items-center gap-1"
            >
              <Car className="h-3 w-3" />
              Bekijk alle schade op dit voertuig
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <ul className="space-y-1.5">
            {row.damage_events.map((d) => (
              <li key={d.id} className="text-sm flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium capitalize">{d.side}</span>{": "}
                  <span className="text-foreground/80">{d.description ?? "geen beschrijving"}</span>
                  <span className="text-muted-foreground text-xs ml-2">[{d.severity} · {d.status}]</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {row.notes && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-muted-foreground mb-1" style={{ fontFamily: "var(--font-display)" }}>
            Opmerkingen chauffeur
          </div>
          <p className="text-sm text-foreground/80 italic">{row.notes}</p>
        </div>
      )}

      {row.status === "RELEASED" && (row.released_at || row.release_reason || row.released_by) && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: "hsl(var(--gold-soft) / 0.5)", border: "1px solid hsl(var(--gold) / 0.3)" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--gold-deep))] mb-1" style={{ fontFamily: "var(--font-display)" }}>
            Vrijgave
          </div>
          <div className="text-xs text-foreground/80 space-y-0.5">
            {row.released_at && (
              <div>Moment: {new Date(row.released_at).toLocaleString("nl-NL")}</div>
            )}
            {row.released_by && (
              <div>Door: <span className="font-mono">{row.released_by.slice(0, 8)}…</span></div>
            )}
            {row.release_reason && (
              <div>Reden: <span className="italic">{row.release_reason}</span></div>
            )}
          </div>
        </div>
      )}

      {row.status === "DAMAGE_FOUND" && (
        <button
          type="button"
          className="btn-luxe btn-luxe--primary"
          onClick={onRelease}
          style={{ fontFamily: "var(--font-display)" }}
        >
          <Unlock className="h-4 w-4" />
          Vrijgeven voor chauffeur
        </button>
      )}
    </div>
  );
}

type Tab = "all" | "releases";

function toIsoStart(d: string) { return d ? `${d}T00:00:00.000Z` : undefined; }
function toIsoEnd(d: string) { return d ? `${d}T23:59:59.999Z` : undefined; }

function defaultDateRange() {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}

export default function VoertuigcheckHistorie({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get("status") ?? "";

  const [tab, setTab] = useState<Tab>("all");
  const [statusFilter, setStatusFilter] = useState<string>(urlStatus);
  const [vehicleFilter, setVehicleFilter] = useState<string>("");
  const [driverFilter, setDriverFilter] = useState<string>("");
  const [onlyOpenDamage, setOnlyOpenDamage] = useState<boolean>(false);
  const range = useMemo(defaultDateRange, []);
  const [fromDate, setFromDate] = useState<string>(range.from);
  const [toDate, setToDate] = useState<string>(range.to);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<LightboxPhoto | null>(null);

  useEffect(() => {
    if (urlStatus && urlStatus !== statusFilter) setStatusFilter(urlStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus]);

  const { data: rows = [], isLoading } = useVehicleCheckHistory({
    status: statusFilter || undefined,
    vehicleId: vehicleFilter || undefined,
    driverId: driverFilter || undefined,
    from: toIsoStart(fromDate),
    to: toIsoEnd(toDate),
    onlyOpenDamage: tab === "all" ? onlyOpenDamage : false,
    releasedOnly: tab === "releases",
  });
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();
  const release = useReleaseVehicleCheck();

  const allPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const r of rows) for (const p of r.photos) paths.add(p.storage_path);
    return Array.from(paths);
  }, [rows]);
  const { data: urlMap = {} } = useBulkSignedPhotoUrls(allPaths);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleRelease = (id: string) => {
    const reason = window.prompt("Reden van vrijgave (optioneel):") ?? undefined;
    release.mutate(
      { checkId: id, reason },
      {
        onSuccess: () => toast.success("Check vrijgegeven. Chauffeur kan rijden."),
        onError: (e: any) => toast.error("Vrijgave mislukt: " + (e?.message ?? e)),
      },
    );
  };

  const stats = useMemo(() => ({
    total: rows.length,
    ok: rows.filter((r) => r.status === "OK").length,
    damage: rows.filter((r) => r.status === "DAMAGE_FOUND").length,
    released: rows.filter((r) => r.status === "RELEASED").length,
  }), [rows]);

  const updateStatus = (v: string) => {
    setStatusFilter(v);
    const next = new URLSearchParams(searchParams);
    if (v) next.set("status", v); else next.delete("status");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-6xl p-4 md:p-6"} style={{ fontFamily: "var(--font-ui)" }}>
      {!embedded && (
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
          <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
          <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
            Voertuigcheck
          </span>
        </div>
        <h1 className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          Historie
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Overzicht van alle pre-trip checks, bevindingen en schade-attributie.
        </p>
      </header>
      )}

      {!embedded && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Totaal checks", value: stats.total, icon: ShieldAlert },
          { label: "OK", value: stats.ok, icon: CheckCircle2 },
          { label: "Schade open", value: stats.damage, icon: AlertTriangle },
          { label: "Vrijgegeven", value: stats.released, icon: Unlock },
        ].map((s) => (
          <div key={s.label} className="card--luxe p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                {s.label}
              </span>
              <s.icon className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            </div>
            <div className="text-[1.75rem] font-semibold mt-1" style={{ fontFamily: "var(--font-display)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      )}

      <div className={embedded ? "mb-3 flex items-center gap-1 border-b border-[hsl(var(--gold)/0.1)]" : "mb-4 flex items-center gap-1 border-b border-border/50"}>
        {[
          { key: "all" as const, label: "Alle checks" },
          { key: "releases" as const, label: "Vrijgaves (audit)" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="relative px-4 py-2 text-sm font-medium transition-colors"
            style={{
              fontFamily: "var(--font-display)",
              color: tab === t.key ? "hsl(var(--gold-deep))" : "hsl(var(--muted-foreground))",
            }}
          >
            {t.label}
            {tab === t.key && (
              <span
                className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
                style={{ background: "hsl(var(--gold))" }}
              />
            )}
          </button>
        ))}
      </div>

      <div className={embedded ? "rounded-[1.15rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.06)] p-4 mb-4" : "card--luxe p-5 mb-4"} style={{ overflow: "visible" }}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 items-end">
          <div className="flex flex-col min-w-0">
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Status
            </label>
            <LuxeSelect
              value={statusFilter || "__all"}
              onChange={(v) => updateStatus(v === "__all" ? "" : v)}
              placeholder="Alle statussen"
              ariaLabel="Status filter"
              options={[
                { value: "__all", label: "Alle statussen" },
                { value: "OK", label: "OK" },
                { value: "DAMAGE_FOUND", label: "Schade gemeld" },
                { value: "RELEASED", label: "Vrijgegeven" },
                { value: "PENDING", label: "In uitvoering" },
              ]}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Voertuig
            </label>
            <LuxeSelect
              value={vehicleFilter || "__all"}
              onChange={(v) => setVehicleFilter(v === "__all" ? "" : v)}
              placeholder="Alle voertuigen"
              ariaLabel="Voertuig filter"
              options={[
                { value: "__all", label: "Alle voertuigen" },
                ...vehicles.map((v: any) => ({
                  value: v.id,
                  label: `${v.code} · ${v.name}`,
                })),
              ]}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Chauffeur
            </label>
            <LuxeSelect
              value={driverFilter || "__all"}
              onChange={(v) => setDriverFilter(v === "__all" ? "" : v)}
              placeholder="Alle chauffeurs"
              ariaLabel="Chauffeur filter"
              options={[
                { value: "__all", label: "Alle chauffeurs" },
                ...(drivers ?? []).map((d: any) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Van
            </label>
            <LuxeDatePicker value={fromDate} onChange={setFromDate} ariaLabel="Vanaf datum" />
          </div>

          <div className="flex flex-col min-w-0">
            <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5" style={{ fontFamily: "var(--font-display)" }}>
              Tot
            </label>
            <LuxeDatePicker value={toDate} onChange={setToDate} ariaLabel="Tot datum" />
          </div>
        </div>

        {tab === "all" && (
          <div className="mt-4 pt-4 border-t border-[hsl(var(--gold)/0.2)] flex items-center justify-end">
            <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={onlyOpenDamage}
                onChange={(e) => setOnlyOpenDamage(e.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--gold-deep))]"
              />
              <span
                className="text-[11px] uppercase tracking-[0.14em] font-semibold text-foreground/80 group-hover:text-[hsl(var(--gold-deep))] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Alleen openstaande schade
              </span>
            </label>
          </div>
        )}
      </div>

      <div className={embedded ? "overflow-hidden rounded-[1.15rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))]" : "card--luxe overflow-hidden"}>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Laden…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {tab === "releases"
              ? "Geen vrijgaves gevonden in deze periode."
              : "Nog geen checks geregistreerd met deze filters."}
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((r) => {
              const isOpen = expanded.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--gold-soft))/0.3] transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3 text-sm tabular-nums text-foreground/80">
                        {new Date(r.started_at).toLocaleString("nl-NL", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                      <div className="col-span-3 text-sm font-medium truncate" style={{ fontFamily: "var(--font-display)" }}>
                        {r.vehicle_code ?? "geen"} {r.vehicle_name ? `· ${r.vehicle_name}` : ""}
                      </div>
                      <div className="col-span-3 text-sm truncate">
                        {r.is_baseline_seed ? (
                          <span className="text-[hsl(var(--gold-deep))]">Baseline-seed</span>
                        ) : (
                          r.driver_name ?? "geen"
                        )}
                      </div>
                      <div className="col-span-2">
                        <StatusPill status={r.status} />
                      </div>
                      <div className="col-span-1 text-xs text-muted-foreground text-right">
                        {r.damage_events.length > 0 && (
                          <span className="text-red-600 font-medium">{r.damage_events.length} schade</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <RowDetail
                      row={r}
                      urlMap={urlMap}
                      onRelease={() => handleRelease(r.id)}
                      onPhoto={setLightbox}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
