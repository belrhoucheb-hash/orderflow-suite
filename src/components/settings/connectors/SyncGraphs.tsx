// Sync-graphs voor connector-detail-sidebar.
//
// Toont weekly events bar-chart, success-rate donut, latency sparkline en een
// week-vs-week vergelijking. Werkt op de `useConnectorSyncLog`-output. Als er
// te weinig events zijn (< 10) injecteren we een mock-seed zodat de UI niet
// leeg oogt; zodra echte events binnenkomen overschrijven die de seed.
//
// Pure SVG, geen extra deps.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncLogRow } from "@/hooks/useConnectors";

interface Props {
  slug: string;
  log: SyncLogRow[];
}

type RangeKey = "7d" | "30d";

interface DayBucket {
  date: Date;
  label: string;
  success: number;
  failed: number;
  total: number;
}

const SEED_RNG_SEED = 1337;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromSlug(slug: string): number {
  let hash = SEED_RNG_SEED;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function generateSeedEvents(slug: string, days: number, perDay: number): SyncLogRow[] {
  const rand = mulberry32(seedFromSlug(slug));
  const out: SyncLogRow[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  for (let d = 0; d < days; d++) {
    const dayStart = now - d * dayMs;
    for (let i = 0; i < perDay; i++) {
      const r = rand();
      const status: SyncLogRow["status"] = r < 0.92 ? "SUCCESS" : r < 0.97 ? "FAILED" : "SKIPPED";
      const offset = Math.floor(rand() * dayMs);
      const baseLatency = 180 + Math.floor(rand() * 220);
      const tail = rand() > 0.9 ? Math.floor(rand() * 600) : 0;
      out.push({
        id: `seed-${slug}-${d}-${i}`,
        provider: slug,
        direction: rand() > 0.5 ? "push" : "pull",
        event_type: "seed.sample",
        entity_type: null,
        entity_id: null,
        status,
        records_count: status === "SUCCESS" ? Math.ceil(rand() * 4) : 0,
        error_message: status === "FAILED" ? "Voorbeeldfout (seed)" : null,
        duration_ms: baseLatency + tail,
        external_id: null,
        started_at: new Date(dayStart - offset).toISOString(),
      });
    }
  }
  return out.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

function bucketByDay(rows: SyncLogRow[], days: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    buckets.push({
      date: d,
      label: d.toLocaleDateString("nl-NL", { weekday: "short" }).replace(".", ""),
      success: 0,
      failed: 0,
      total: 0,
    });
  }
  const startMs = buckets[0].date.getTime();
  const endMs = buckets[buckets.length - 1].date.getTime() + 24 * 60 * 60 * 1000;
  for (const row of rows) {
    const ts = new Date(row.started_at).getTime();
    if (ts < startMs || ts >= endMs) continue;
    const dayIdx = Math.floor((ts - startMs) / (24 * 60 * 60 * 1000));
    const bucket = buckets[dayIdx];
    if (!bucket) continue;
    bucket.total += 1;
    if (row.status === "SUCCESS") bucket.success += 1;
    else if (row.status === "FAILED") bucket.failed += 1;
  }
  return buckets;
}

function percentilesFromRows(rows: SyncLogRow[]): { p50: number | null; p95: number | null } {
  const durations = rows.map((r) => r.duration_ms).filter((v): v is number => typeof v === "number" && v > 0);
  if (durations.length === 0) return { p50: null, p95: null };
  durations.sort((a, b) => a - b);
  const at = (q: number) => {
    const idx = Math.min(durations.length - 1, Math.max(0, Math.floor(durations.length * q)));
    return durations[idx];
  };
  return { p50: at(0.5), p95: at(0.95) };
}

function trendOverTime(rows: SyncLogRow[], windowDays: number): number[] {
  const buckets = bucketByDay(rows, windowDays);
  return buckets.map((b) => {
    const bucketRows = rows.filter((r) => {
      const ts = new Date(r.started_at).getTime();
      const start = b.date.getTime();
      return ts >= start && ts < start + 24 * 60 * 60 * 1000;
    });
    const ds = bucketRows.map((r) => r.duration_ms).filter((v): v is number => typeof v === "number");
    if (ds.length === 0) return 0;
    return Math.round(ds.reduce((s, v) => s + v, 0) / ds.length);
  });
}

interface AggregatedStats {
  totalThisWeek: number;
  totalLastWeek: number;
  successRate: number | null;
  failureCount: number;
  weekDelta: number | null;
  p50: number | null;
  p95: number | null;
  buckets: DayBucket[];
  latencyTrend: number[];
  isSeed: boolean;
}

export function aggregateStats(slug: string, rows: SyncLogRow[], range: RangeKey): AggregatedStats {
  const days = range === "7d" ? 7 : 30;
  const isSeed = rows.length < 10;
  const effective = isSeed ? generateSeedEvents(slug, days, 6) : rows;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const thisStart = now - days * dayMs;
  const lastStart = now - 2 * days * dayMs;
  const thisWeek = effective.filter((r) => new Date(r.started_at).getTime() >= thisStart);
  const lastWeek = effective.filter((r) => {
    const ts = new Date(r.started_at).getTime();
    return ts >= lastStart && ts < thisStart;
  });

  const buckets = bucketByDay(effective, days);
  const totalThisWeek = thisWeek.length;
  const totalLastWeek = lastWeek.length;
  const successCount = thisWeek.filter((r) => r.status === "SUCCESS").length;
  const failureCount = thisWeek.filter((r) => r.status === "FAILED").length;
  const successRate = totalThisWeek === 0 ? null : Math.round((successCount / totalThisWeek) * 100);
  const weekDelta = totalLastWeek === 0 ? null : Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100);
  const { p50, p95 } = percentilesFromRows(thisWeek);
  const latencyTrend = trendOverTime(effective, days);

  return {
    totalThisWeek,
    totalLastWeek,
    successRate,
    failureCount,
    weekDelta,
    p50,
    p95,
    buckets,
    latencyTrend,
    isSeed,
  };
}

export function SyncGraphs({ slug, log }: Props) {
  const [range, setRange] = useState<RangeKey>("7d");
  const stats = useMemo(() => aggregateStats(slug, log, range), [slug, log, range]);

  return (
    <div className="card--luxe p-4 space-y-4" data-testid="sync-graphs">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-display font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
          Sync-graph
        </p>
        <div className="inline-flex items-center rounded-full border border-[hsl(var(--gold)/0.2)] bg-white p-0.5">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "h-6 px-2.5 rounded-full text-[10px] font-display font-semibold tabular-nums transition-all",
                range === r
                  ? "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <BarChart buckets={stats.buckets} />

      <div className="grid grid-cols-2 gap-3">
        <Donut percent={stats.successRate ?? 0} label="Success-rate" available={stats.successRate !== null} />
        <div className="rounded-xl border border-[hsl(var(--gold)/0.16)] bg-white p-3 flex flex-col gap-1.5">
          <p className="text-[9px] font-display font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latency</p>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-base font-semibold tabular-nums">
              {stats.p50 !== null ? `${stats.p50}` : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground">p50 ms</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-sm font-semibold tabular-nums text-amber-700">
              {stats.p95 !== null ? `${stats.p95}` : "—"}
            </span>
            <span className="text-[10px] text-muted-foreground">p95 ms</span>
          </div>
          <Sparkline values={stats.latencyTrend} />
        </div>
      </div>

      <WeekDeltaPill delta={stats.weekDelta} totalThisWeek={stats.totalThisWeek} totalLastWeek={stats.totalLastWeek} />

      {stats.isSeed && (
        <p className="text-[10px] text-muted-foreground italic leading-tight">
          Voorbeelddata, vervangt automatisch zodra echte events binnenkomen.
        </p>
      )}
    </div>
  );
}

function BarChart({ buckets }: { buckets: DayBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.total));
  const width = 100;
  const height = 50;
  const barWidth = width / buckets.length - 2;
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${width} ${height + 14}`} className="w-full h-24" role="img" aria-label="Events per dag">
        {buckets.map((b, i) => {
          const x = i * (barWidth + 2);
          const successHeight = (b.success / max) * height;
          const failedHeight = (b.failed / max) * height;
          return (
            <g key={i}>
              <motion.rect
                x={x}
                y={height - successHeight}
                width={barWidth}
                height={successHeight}
                rx={1}
                fill="hsl(var(--gold-deep))"
                fillOpacity={0.18}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                style={{ transformOrigin: `${x}px ${height}px` }}
              />
              <motion.rect
                x={x}
                y={height - successHeight - failedHeight}
                width={barWidth}
                height={failedHeight}
                rx={1}
                fill="hsl(var(--destructive))"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.3, delay: i * 0.04 + 0.1 }}
                style={{ transformOrigin: `${x}px ${height - successHeight}px` }}
              />
              <text
                x={x + barWidth / 2}
                y={height + 9}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 6, fontFamily: "inherit" }}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-sm bg-[hsl(var(--gold-deep))] opacity-50" />
          Succes
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-3 rounded-sm bg-destructive" />
          Mislukt
        </span>
      </div>
    </div>
  );
}

function Donut({ percent, label, available }: { percent: number; label: string; available: boolean }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <div className="rounded-xl border border-[hsl(var(--gold)/0.16)] bg-white p-3 flex flex-col items-center justify-center gap-1">
      <p className="text-[9px] font-display font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <svg viewBox="0 0 50 50" className="h-16 w-16" role="img" aria-label={`${label} ${percent}%`}>
        <circle cx="25" cy="25" r={radius} fill="none" stroke="hsl(var(--gold)/0.2)" strokeWidth="4" />
        {available && (
          <motion.circle
            cx="25"
            cy="25"
            r={radius}
            fill="none"
            stroke={percent >= 95 ? "hsl(var(--gold-deep))" : percent >= 80 ? "#d97706" : "hsl(var(--destructive))"}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 25 25)"
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${dash} ${circumference}` }}
            transition={{ duration: 0.5 }}
          />
        )}
        <text x="25" y="28" textAnchor="middle" className="fill-foreground font-display font-semibold" style={{ fontSize: 10 }}>
          {available ? `${percent}%` : "—"}
        </text>
      </svg>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-6 flex items-center text-[10px] text-muted-foreground">geen trend</div>;
  }
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 18;
  const stepX = w / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-5" role="img" aria-label="Latency trend">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--gold-deep))"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

function WeekDeltaPill({
  delta,
  totalThisWeek,
  totalLastWeek,
}: {
  delta: number | null;
  totalThisWeek: number;
  totalLastWeek: number;
}) {
  if (delta === null) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Activity className="h-3 w-3" />
        Eerste week, geen vergelijking
      </div>
    );
  }
  const positive = delta > 0;
  const Icon = delta === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-display font-semibold rounded-full border px-2 py-0.5",
        delta === 0
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : positive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">
        {delta > 0 ? "+" : ""}
        {delta}% vs vorige periode
      </span>
      <span className="text-muted-foreground/80 font-normal">
        ({totalThisWeek} vs {totalLastWeek})
      </span>
    </div>
  );
}
