// Audit-tab voor connector-detail.
//
// Toont alle acties op deze connector (connect, mapping-save, threshold change,
// manual sync, etc.) in chronologische volgorde. Admin-only.

import { useMemo } from "react";
import { Download, ScrollText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConnectorAuditLog, AUDIT_ACTION_LABELS } from "@/hooks/useConnectorAuditLog";
import { findConnector } from "@/lib/connectors/catalog";

export function AuditTab({ slug }: { slug: string }) {
  const connector = findConnector(slug);
  const log = useConnectorAuditLog(slug);

  const csv = useMemo(() => buildCsv(log.data ?? []), [log.data]);

  const handleExport = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `audit-${slug}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const rows = log.data ?? [];

  return (
    <div className="space-y-4" data-testid="audit-tab">
      <div className="card--luxe p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-display font-semibold tracking-tight">Audit-trail</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Alle handmatige acties op {connector?.name ?? slug} en wie ze heeft uitgevoerd.
                Compliance-grade, geen events verwijderbaar via UI.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>

        {log.isLoading && <p className="text-sm text-muted-foreground">Laden...</p>}
        {!log.isLoading && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--gold)/0.3)] p-8 text-center">
            <ScrollText className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nog geen audit-events.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[hsl(var(--gold-soft)/0.3)]">
                <tr className="text-left">
                  <th className="px-3 py-2 font-display font-semibold uppercase tracking-[0.14em] text-[10px] text-muted-foreground">Tijdstip</th>
                  <th className="px-3 py-2 font-display font-semibold uppercase tracking-[0.14em] text-[10px] text-muted-foreground">Actie</th>
                  <th className="px-3 py-2 font-display font-semibold uppercase tracking-[0.14em] text-[10px] text-muted-foreground">Door</th>
                  <th className="px-3 py-2 font-display font-semibold uppercase tracking-[0.14em] text-[10px] text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-[hsl(var(--gold-soft)/0.08)]"}>
                    <td className="px-3 py-2 tabular-nums text-foreground/80 align-top">
                      {new Date(row.created_at).toLocaleString("nl-NL")}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex h-6 items-center px-2 rounded-md bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))] text-[10px] font-display font-semibold">
                        {AUDIT_ACTION_LABELS[row.action] ?? row.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground align-top">
                      {row.user_id ? row.user_id.slice(0, 8) : "systeem"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-foreground/70 align-top">
                      {Object.keys(row.details ?? {}).length > 0 ? (
                        <details>
                          <summary className="cursor-pointer text-[hsl(var(--gold-deep))]">Bekijk</summary>
                          <pre className="mt-1 p-2 rounded bg-[hsl(var(--gold-soft)/0.18)] overflow-auto max-w-md whitespace-pre-wrap break-all">
                            {JSON.stringify(row.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function buildCsv(rows: ReturnType<typeof useConnectorAuditLog>["data"] extends infer T ? T extends Array<infer U> ? U[] : never : never): string {
  const header = ["created_at", "action", "user_id", "details"];
  const escape = (val: unknown): string => {
    if (val == null) return "";
    const s = typeof val === "string" ? val : JSON.stringify(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const row of rows ?? []) {
    lines.push([
      escape(row.created_at),
      escape(row.action),
      escape(row.user_id ?? ""),
      escape(row.details ?? {}),
    ].join(","));
  }
  return lines.join("\n");
}
