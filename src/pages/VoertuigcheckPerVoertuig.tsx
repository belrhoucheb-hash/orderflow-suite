import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, Wrench, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  useVehicleDamageHistory,
  useMarkDamageRepaired,
  type DamageEventRow,
} from "@/hooks/useVehicleCheckHistory";
import { useVehicles } from "@/hooks/useVehicles";

const STATUS_STYLE: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  OPEN:         { bg: "hsl(0 80% 95%)",      fg: "hsl(0 65% 40%)",     border: "hsl(0 55% 75%)",  label: "Open" },
  ACKNOWLEDGED: { bg: "hsl(38 92% 94%)",     fg: "hsl(32 70% 35%)",    border: "hsl(38 70% 70%)", label: "Bevestigd" },
  DISPUTED:     { bg: "hsl(260 60% 95%)",    fg: "hsl(260 50% 40%)",   border: "hsl(260 50% 75%)", label: "Betwist" },
  REPAIRED:     { bg: "hsl(142 60% 94%)",    fg: "hsl(142 55% 28%)",   border: "hsl(142 40% 70%)", label: "Hersteld" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.OPEN;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-[0.14em] font-semibold"
      style={{
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        fontFamily: "var(--font-display)",
      }}
    >
      {s.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const isBlocking = severity === "blocking";
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] font-semibold"
      style={{
        color: isBlocking ? "hsl(0 65% 40%)" : "hsl(32 70% 35%)",
        fontFamily: "var(--font-display)",
      }}
    >
      <AlertTriangle className="h-3 w-3" />
      {isBlocking ? "Blokkerend" : "Minor"}
    </span>
  );
}

function DamageRow({ d }: { d: DamageEventRow }) {
  const repair = useMarkDamageRepaired();
  const onRepair = () => {
    const notes = window.prompt("Reparatienotitie (optioneel):") ?? undefined;
    repair.mutate(
      { damageId: d.id, notes },
      {
        onSuccess: () => toast.success("Schade gemarkeerd als hersteld."),
        onError: (e: any) => toast.error("Mislukt: " + (e?.message ?? e)),
      },
    );
  };

  return (
    <li className="p-4 border-b border-border/40 last:border-b-0">
      <div className="flex items-start gap-4">
        <div className="shrink-0 mt-1">
          {d.status === "REPAIRED" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold capitalize" style={{ fontFamily: "var(--font-display)" }}>
              {d.side}
            </span>
            <SeverityBadge severity={d.severity} />
            <StatusPill status={d.status} />
          </div>
          <p className="text-sm text-foreground/80 mb-1">
            {d.description ?? "Geen beschrijving"}
          </p>
          <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Date(d.created_at).toLocaleString("nl-NL", {
                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </span>
            {d.attributed_driver_name && (
              <span>Toegeschreven aan: <span className="text-foreground/70 font-medium">{d.attributed_driver_name}</span></span>
            )}
            {d.repaired_at && (
              <span>Hersteld op: {new Date(d.repaired_at).toLocaleDateString("nl-NL")}</span>
            )}
          </div>
          {d.repair_notes && (
            <p className="text-xs italic text-muted-foreground mt-1">Reparatie: {d.repair_notes}</p>
          )}
        </div>
        {d.status !== "REPAIRED" && (
          <button
            type="button"
            className="btn-luxe"
            onClick={onRepair}
            disabled={repair.isPending}
            style={{ fontFamily: "var(--font-display)" }}
          >
            <Wrench className="h-4 w-4" />
            Markeer als hersteld
          </button>
        )}
      </div>
    </li>
  );
}

export default function VoertuigcheckPerVoertuig() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const { data: vehicles = [] } = useVehicles();
  const { data: damages = [], isLoading } = useVehicleDamageHistory(vehicleId);

  const vehicle = useMemo(
    () => vehicles.find((v: any) => v.id === vehicleId),
    [vehicles, vehicleId],
  );

  const stats = useMemo(() => ({
    total: damages.length,
    open: damages.filter((d) => d.status === "OPEN").length,
    repaired: damages.filter((d) => d.status === "REPAIRED").length,
  }), [damages]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto" style={{ fontFamily: "var(--font-ui)" }}>
      <Link
        to="/voertuigcheck"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[hsl(var(--gold-deep))] transition-colors mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Terug naar historie
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
          <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
          <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
            Voertuigcheck · Schadehistorie
          </span>
        </div>
        <h1 className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          {vehicle ? `${vehicle.code ?? ""} · ${vehicle.name ?? ""}` : "Voertuig"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tijdlijn van alle schade-meldingen voor dit voertuig.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Totaal", value: stats.total },
          { label: "Open", value: stats.open },
          { label: "Hersteld", value: stats.repaired },
        ].map((s) => (
          <div key={s.label} className="card--luxe p-4">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {s.label}
            </span>
            <div className="text-[1.75rem] font-semibold mt-1" style={{ fontFamily: "var(--font-display)" }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card--luxe overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Laden…</div>
        ) : damages.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Geen schade-meldingen geregistreerd voor dit voertuig.
          </div>
        ) : (
          <ul>
            {damages.map((d) => (
              <DamageRow key={d.id} d={d} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
