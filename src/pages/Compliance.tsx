import type React from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  Globe2,
  PackageCheck,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type CountResult = {
  value: number;
  available: boolean;
};

type ComplianceCounts = {
  privacyRequests: CountResult;
  cmrDocuments: CountResult;
  invoiceArchive: CountResult;
  securityIncidents: CountResult;
  eftiDatasets: CountResult;
  complianceModules: CountResult;
  backupTests: CountResult;
  suppliers: CountResult;
};

const emptyCount: CountResult = { value: 0, available: false };

const sprintRows = [
  {
    sprint: "01",
    label: "Foundation",
    status: "Basis ingericht",
    owner: "Retentie, legal hold, audit",
  },
  {
    sprint: "02",
    label: "POD evidence",
    status: "Private opslag",
    owner: "Signed URL en access log",
  },
  {
    sprint: "03",
    label: "AVG/GPS",
    status: "Privacy controls",
    owner: "Purpose, access log, DSAR",
  },
  {
    sprint: "04",
    label: "CMR/eCMR",
    status: "Bewijslaag",
    owner: "Hash, versies, verificatie",
  },
  {
    sprint: "05",
    label: "Fiscaal archief",
    status: "Lock & events",
    owner: "7 jaar, correctieflow",
  },
  {
    sprint: "06",
    label: "NIS2 operations",
    status: "Registers",
    owner: "Incident, backup, supplier",
  },
  {
    sprint: "07",
    label: "eFTI readiness",
    status: "Dataset export",
    owner: "Hash en inspectietoken",
  },
  {
    sprint: "08",
    label: "Transport modules",
    status: "Tenant switches",
    owner: "ADR, douane, cold chain",
  },
];

const moduleRows = [
  { code: "ADR", label: "Gevaarlijke stoffen", document: "ADR-documenten", tone: "warning" },
  { code: "CUSTOMS", label: "Douane/export", document: "Export- en aangiftebewijs", tone: "default" },
  { code: "COLD_CHAIN", label: "Cold chain", document: "Temperatuurregistratie", tone: "default" },
  { code: "WASTE", label: "Afvaltransport", document: "Begeleidingsbrief", tone: "warning" },
  { code: "PHARMA_FOOD", label: "Farma/food", document: "Batch en hygiënebewijs", tone: "default" },
];

async function safeCount(table: string): Promise<CountResult> {
  const db = supabase as any;
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true });

  if (error) {
    return emptyCount;
  }

  return { value: count ?? 0, available: true };
}

async function loadComplianceCounts(): Promise<ComplianceCounts> {
  const [
    privacyRequests,
    cmrDocuments,
    invoiceArchive,
    securityIncidents,
    eftiDatasets,
    complianceModules,
    backupTests,
    suppliers,
  ] = await Promise.all([
    safeCount("privacy_requests"),
    safeCount("cmr_documents"),
    safeCount("invoice_archive"),
    safeCount("security_incidents"),
    safeCount("efti_datasets"),
    safeCount("compliance_modules"),
    safeCount("backup_restore_tests"),
    safeCount("supplier_security_register"),
  ]);

  return {
    privacyRequests,
    cmrDocuments,
    invoiceArchive,
    securityIncidents,
    eftiDatasets,
    complianceModules,
    backupTests,
    suppliers,
  };
}

function StatusPill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-700",
        tone === "default" && "border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.24)] text-[hsl(var(--gold-deep))]",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "success" && "bg-emerald-500",
          tone === "warning" && "bg-amber-500",
          tone === "default" && "bg-[hsl(var(--gold-deep))]",
        )}
      />
      {children}
    </span>
  );
}

function MetricBlock({
  label,
  value,
  caption,
  icon: Icon,
  muted,
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  muted?: boolean;
}) {
  return (
    <div className="min-h-[10.5rem] border-b border-r border-[hsl(var(--gold)/0.10)] px-6 py-6 xl:border-b-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">
          <span className="h-px w-5 bg-[hsl(var(--gold)/0.55)]" />
          {label}
        </div>
        <Icon className="h-4 w-4 text-[hsl(var(--gold)/0.62)]" strokeWidth={1.7} />
      </div>
      <div
        className={cn(
          "text-[2.45rem] font-semibold leading-none tracking-tight tabular-nums",
          muted ? "text-muted-foreground" : "text-foreground",
        )}
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{caption}</p>
    </div>
  );
}

export default function Compliance() {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["compliance-cockpit-counts"],
    queryFn: loadComplianceCounts,
  });

  const counts = data ?? {
    privacyRequests: emptyCount,
    cmrDocuments: emptyCount,
    invoiceArchive: emptyCount,
    securityIncidents: emptyCount,
    eftiDatasets: emptyCount,
    complianceModules: emptyCount,
    backupTests: emptyCount,
    suppliers: emptyCount,
  };

  const unavailableCount = useMemo(
    () => Object.values(counts).filter((result) => !result.available).length,
    [counts],
  );

  const evidenceTotal =
    counts.privacyRequests.value +
    counts.cmrDocuments.value +
    counts.invoiceArchive.value +
    counts.securityIncidents.value +
    counts.eftiDatasets.value;

  return (
    <div className="page-container">
      <header className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(135deg,hsl(42_36%_98%),hsl(var(--card))_48%,hsl(var(--gold-soft)/0.28))] px-5 py-5 shadow-[0_18px_60px_-52px_hsl(32_35%_28%/0.35)]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div
              className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-[hsl(var(--gold-deep))]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="h-px w-6 bg-[hsl(var(--gold)/0.55)]" />
              Compliance
              <span className="text-muted-foreground">8 sprints</span>
            </div>
            <h1 className="text-[2rem] font-semibold leading-none tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Compliance cockpit
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-luxe" type="button" onClick={() => void refetch()}>
              <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              Vernieuwen
            </button>
            <button className="btn-luxe btn-luxe--primary" type="button">
              <FileText className="h-4 w-4" />
              Audit export
            </button>
          </div>
        </div>
      </header>

      <section
        className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card shadow-[0_20px_70px_-60px_hsl(var(--ink)/0.45)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1.1fr_repeat(5,1fr)]">
          <MetricBlock label="Bewijsregels" value={String(evidenceTotal)} caption="Logs en snapshots" icon={Database} />
          <MetricBlock label="AVG" value={String(counts.privacyRequests.value)} caption="Privacy verzoeken" icon={ShieldCheck} muted={!counts.privacyRequests.available} />
          <MetricBlock label="CMR" value={String(counts.cmrDocuments.value)} caption="Documenten" icon={FileText} muted={!counts.cmrDocuments.available} />
          <MetricBlock label="NIS2" value={String(counts.securityIncidents.value)} caption="Incidenten" icon={AlertTriangle} muted={!counts.securityIncidents.available} />
          <MetricBlock label="eFTI" value={String(counts.eftiDatasets.value)} caption="Datasets" icon={Globe2} muted={!counts.eftiDatasets.available} />
          <MetricBlock label="Modules" value={String(counts.complianceModules.value)} caption="Tenant switches" icon={PackageCheck} muted={!counts.complianceModules.available} />
        </div>
      </section>

      {unavailableCount > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <div>
              <p className="text-sm font-semibold">Migrations nog niet overal zichtbaar</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-700">
                Sommige compliance-tabellen geven nog geen data terug. Zodra de migrations op de omgeving zijn toegepast, vult deze cockpit automatisch.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card shadow-[0_28px_90px_-72px_hsl(var(--ink)/0.5)]">
          <div className="border-b border-[hsl(var(--gold)/0.14)] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Sprintlijn</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                  Compliance voortgang
                </h2>
              </div>
              <StatusPill tone="success">Foundation actief</StatusPill>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full table-fixed">
              <colgroup>
                <col className="w-[76px]" />
                <col className="w-[23%]" />
                <col className="w-[24%]" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.14)] [&>th]:px-4 [&>th]:py-4 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.16em] [&>th]:text-[hsl(var(--gold-deep))]">
                  <th>Sprint</th>
                  <th>Domein</th>
                  <th>Status</th>
                  <th>Bewijs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--border)/0.7)] [&>tr>td]:px-4 [&>tr>td]:py-4 [&>tr>td]:align-middle">
                {sprintRows.map((row) => (
                  <tr key={row.sprint} className="table-row">
                    <td className="font-semibold tabular-nums text-foreground">#{row.sprint}</td>
                    <td className="font-semibold text-foreground/90">{row.label}</td>
                    <td>
                      <StatusPill>{row.status}</StatusPill>
                    </td>
                    <td className="truncate text-muted-foreground">{row.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card p-5 shadow-[0_28px_90px_-72px_hsl(var(--ink)/0.5)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Volgende actie</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Productproces koppelen
              </h2>
            </div>
            <Clock3 className="h-4 w-4 text-[hsl(var(--gold)/0.62)]" strokeWidth={1.7} />
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Orderdetail: compliance status per dossier tonen.",
              "Settings: modules activeren en documentregels beheren.",
              "Audit export: bewijsrapport per periode genereren.",
            ].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-xl bg-[hsl(var(--gold-soft)/0.12)] px-3.5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--gold)/0.18)] bg-card text-[11px] font-semibold text-[hsl(var(--gold-deep))]">
                  {index + 1}
                </span>
                <span className="text-sm text-foreground/90">{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.10)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Backup tests</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{counts.backupTests.value}</p>
            </div>
            <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.10)] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leveranciers</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-foreground">{counts.suppliers.value}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-card shadow-[0_28px_90px_-72px_hsl(var(--ink)/0.5)]">
        <div className="border-b border-[hsl(var(--gold)/0.14)] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]">Modules</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Conditional transport compliance
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full table-fixed">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[25%]" />
              <col />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.14)] [&>th]:px-4 [&>th]:py-4 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.16em] [&>th]:text-[hsl(var(--gold-deep))]">
                <th>Code</th>
                <th>Module</th>
                <th>Documentregel</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border)/0.7)] [&>tr>td]:px-4 [&>tr>td]:py-4 [&>tr>td]:align-middle">
              {moduleRows.map((row) => (
                <tr key={row.code} className="table-row">
                  <td className="font-semibold tabular-nums text-foreground">{row.code}</td>
                  <td className="font-semibold text-foreground/90">{row.label}</td>
                  <td className="text-muted-foreground">{row.document}</td>
                  <td>
                    <StatusPill tone={row.tone === "warning" ? "warning" : "default"}>
                      Tenant keuze
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 border-t border-[hsl(var(--gold)/0.14)] px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="rounded-full border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.24)] px-3 py-1 text-[hsl(var(--gold-deep))]">5 modules</span>
            <span>Alleen actief na tenant-configuratie</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Auditbaar ingericht
          </div>
        </footer>
      </section>
    </div>
  );
}
