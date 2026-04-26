import { useEffect, useState } from "react";
import { AlertTriangle, Brain, Clock3, Database, Package, ShieldAlert, Truck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";
import {
  DEFAULT_EXCEPTION_SETTINGS,
  normalizeExceptionSettings,
  type AnomalyVisibilitySeverity,
  type ExceptionSettings,
} from "@/lib/exceptionSettings";

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5 pr-4">
        <Label className="text-sm font-medium">{title}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function updateNumber(value: string, fallback: number, min: number, max: number) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function ExceptionRulesSettings() {
  const { data: loaded, isLoading } = useLoadSettings("exceptions");
  const save = useSaveSettings("exceptions");
  const [form, setForm] = useState<ExceptionSettings>(DEFAULT_EXCEPTION_SETTINGS);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    if (isLoading) return;
    const normalized = normalizeExceptionSettings(loaded as Record<string, unknown>);
    setForm(normalized);
    setBaseline(JSON.stringify(normalized));
  }, [isLoading, loaded]);

  const dirty = baseline !== "" && JSON.stringify(form) !== baseline;

  function update<K extends keyof ExceptionSettings>(key: K, value: ExceptionSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await save.mutateAsync(form as unknown as Record<string, unknown>);
      setBaseline(JSON.stringify(form));
      toast.success("Exception-regels opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  }

  return (
    <div className="card--luxe p-6 space-y-6">
      <div>
        <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
          Exception Rules
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bepaal welke uitzonderingen zichtbaar zijn, uit welke bronnen ze komen en vanaf welke drempel ze aandacht moeten vragen.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <Database className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Live bronnen</p>
          </div>
          <div className="divide-y divide-[hsl(var(--gold)/0.1)]">
            <ToggleRow
              title="Delivery exceptions"
              description="Toon live meldingen uit de tabel delivery_exceptions."
              checked={form.deliveryExceptionsEnabled}
              onCheckedChange={(checked) => update("deliveryExceptionsEnabled", checked)}
            />
            <ToggleRow
              title="Anomalies"
              description="Toon AI- en detectiemeldingen uit het anomalies-register."
              checked={form.anomaliesEnabled}
              onCheckedChange={(checked) => update("anomaliesEnabled", checked)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <ShieldAlert className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Afgeleide regels</p>
          </div>
          <div className="divide-y divide-[hsl(var(--gold)/0.1)]">
            <ToggleRow
              title="Missing data"
              description="Maak uitzonderingen voor draft-orders met ontbrekende velden."
              checked={form.missingDataEnabled}
              onCheckedChange={(checked) => update("missingDataEnabled", checked)}
            />
            <ToggleRow
              title="SLA-risico"
              description="Laat SLA-risico's zien naast de losse SLA-instellingen."
              checked={form.slaEnabled}
              onCheckedChange={(checked) => update("slaEnabled", checked)}
            />
            <ToggleRow
              title="Vertragingen"
              description="Maak uitzonderingen voor orders die te lang onderweg blijven."
              checked={form.delayEnabled}
              onCheckedChange={(checked) => update("delayEnabled", checked)}
            />
            <ToggleRow
              title="Capaciteit"
              description="Waarschuw wanneer voertuigen boven de ingestelde benutting komen."
              checked={form.capacityEnabled}
              onCheckedChange={(checked) => update("capacityEnabled", checked)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <Clock3 className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Drempels</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delay-threshold" className="text-sm font-medium">Vertragingsdrempel (uur)</Label>
              <Input
                id="delay-threshold"
                type="number"
                min={1}
                max={168}
                value={form.delayThresholdHours}
                onChange={(e) => update("delayThresholdHours", updateNumber(e.target.value, form.delayThresholdHours, 1, 168))}
                className="max-w-[180px]"
              />
              <p className="text-xs text-muted-foreground">Na dit aantal uur in `IN_TRANSIT` verschijnt een vertragingsexception.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity-threshold" className="text-sm font-medium">Capaciteitsdrempel (%)</Label>
              <Input
                id="capacity-threshold"
                type="number"
                min={1}
                max={100}
                value={form.capacityUtilizationThreshold}
                onChange={(e) => update("capacityUtilizationThreshold", updateNumber(e.target.value, form.capacityUtilizationThreshold, 1, 100))}
                className="max-w-[180px]"
              />
              <p className="text-xs text-muted-foreground">Voertuigen boven deze benutting worden in `Uitzonderingen` zichtbaar.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anomaly-severity" className="text-sm font-medium">Minimale anomaly-severity</Label>
              <div className="max-w-[220px]">
                <Select
                  value={form.anomalyMinSeverity}
                  onValueChange={(value) => update("anomalyMinSeverity", value as AnomalyVisibilitySeverity)}
                >
                  <SelectTrigger id="anomaly-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-background p-4">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Wat toon je precies</p>
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Delivery exception-types</p>
              <div className="divide-y divide-[hsl(var(--gold)/0.1)] rounded-xl border border-[hsl(var(--gold)/0.12)] px-3">
                <ToggleRow title="Delay" description="Klassieke vertragingen op orders of trips." checked={form.deliveryTypes.delay} onCheckedChange={(checked) => update("deliveryTypes", { ...form.deliveryTypes, delay: checked })} />
                <ToggleRow title="Missing data" description="Delivery exception voor missende data." checked={form.deliveryTypes.missingData} onCheckedChange={(checked) => update("deliveryTypes", { ...form.deliveryTypes, missingData: checked })} />
                <ToggleRow title="Capacity" description="Capaciteitssignalen vanuit delivery_exceptions." checked={form.deliveryTypes.capacity} onCheckedChange={(checked) => update("deliveryTypes", { ...form.deliveryTypes, capacity: checked })} />
                <ToggleRow title="SLA breach" description="SLA breach signalen uit je operationele flow." checked={form.deliveryTypes.slaBreach} onCheckedChange={(checked) => update("deliveryTypes", { ...form.deliveryTypes, slaBreach: checked })} />
                <ToggleRow title="Predicted delay" description="Voorspelde vertragingen vanuit ETA / AI." checked={form.deliveryTypes.predictedDelay} onCheckedChange={(checked) => update("deliveryTypes", { ...form.deliveryTypes, predictedDelay: checked })} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Delivery severities</p>
              <div className="divide-y divide-[hsl(var(--gold)/0.1)] rounded-xl border border-[hsl(var(--gold)/0.12)] px-3">
                <ToggleRow title="Low" description="Informatieve meldingen met lage impact." checked={form.deliverySeverities.low} onCheckedChange={(checked) => update("deliverySeverities", { ...form.deliverySeverities, low: checked })} />
                <ToggleRow title="Medium" description="Meldingen die vandaag bekeken moeten worden." checked={form.deliverySeverities.medium} onCheckedChange={(checked) => update("deliverySeverities", { ...form.deliverySeverities, medium: checked })} />
                <ToggleRow title="High" description="Hoge prioriteit in operations." checked={form.deliverySeverities.high} onCheckedChange={(checked) => update("deliverySeverities", { ...form.deliverySeverities, high: checked })} />
                <ToggleRow title="Critical" description="Direct oppakken." checked={form.deliverySeverities.critical} onCheckedChange={(checked) => update("deliverySeverities", { ...form.deliverySeverities, critical: checked })} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
          <div className="flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <Package className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Intake</p>
          </div>
          <p className="mt-2 text-sm text-foreground">{form.missingDataEnabled ? "Missing data actief" : "Missing data uit"}</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
          <div className="flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <Truck className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Transport</p>
          </div>
          <p className="mt-2 text-sm text-foreground">Vertraging na {form.delayThresholdHours} uur</p>
        </div>
        <div className="rounded-xl border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-4">
          <div className="flex items-center gap-2 text-[hsl(var(--gold-deep))]">
            <Brain className="h-4 w-4" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Anomaly filter</p>
          </div>
          <p className="mt-2 text-sm text-foreground">Vanaf {form.anomalyMinSeverity}</p>
        </div>
      </div>

      <div className="pt-4 border-t border-[hsl(var(--gold)/0.12)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || save.isPending}
          className="btn-luxe btn-luxe--primary !h-9"
        >
          {save.isPending ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
