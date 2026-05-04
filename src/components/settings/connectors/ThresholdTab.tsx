// Threshold-tab voor connector-detail.
//
// Per-connector configureerbare grenzen: max failures per X minuten en max
// latency in ms. Bij overschrijding logt de health-cron een waarschuwing
// naar de notificaties-tabel zodat de planner het ziet.

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, Save, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useConnectorThreshold, useSaveConnectorThreshold, DEFAULT_THRESHOLD } from "@/hooks/useConnectorThresholds";

export function ThresholdTab({ slug }: { slug: string }) {
  const threshold = useConnectorThreshold(slug);
  const save = useSaveConnectorThreshold(slug);

  const [maxFailures, setMaxFailures] = useState(DEFAULT_THRESHOLD.max_failures);
  const [windowMinutes, setWindowMinutes] = useState(DEFAULT_THRESHOLD.window_minutes);
  const [maxLatency, setMaxLatency] = useState(DEFAULT_THRESHOLD.max_latency_ms);
  const [notifyPlanner, setNotifyPlanner] = useState(DEFAULT_THRESHOLD.notify_planner);

  useEffect(() => {
    if (!threshold.data) return;
    setMaxFailures(threshold.data.max_failures);
    setWindowMinutes(threshold.data.window_minutes);
    setMaxLatency(threshold.data.max_latency_ms);
    setNotifyPlanner(threshold.data.notify_planner);
  }, [threshold.data]);

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        max_failures: maxFailures,
        window_minutes: windowMinutes,
        max_latency_ms: maxLatency,
        notify_planner: notifyPlanner,
      });
      toast.success("Drempelwaarden opgeslagen");
    } catch (e) {
      toast.error("Opslaan mislukt", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="space-y-4" data-testid="threshold-tab">
      <div className="card--luxe p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-display font-semibold tracking-tight">Drempelwaarden voor monitoring</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Bij overschrijding stuurt OrderFlow automatisch een waarschuwing naar de planner. Tweak de waarden zodat ruis-meldingen geen vermoeidheid veroorzaken.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <NumField
            id="th-max-failures"
            label="Max mislukte events"
            value={maxFailures}
            onChange={setMaxFailures}
            min={1}
            suffix="events"
          />
          <NumField
            id="th-window"
            label="Tijdvenster"
            value={windowMinutes}
            onChange={setWindowMinutes}
            min={1}
            suffix="minuten"
          />
          <NumField
            id="th-latency"
            label="Max latency"
            value={maxLatency}
            onChange={setMaxLatency}
            min={100}
            step={50}
            suffix="ms"
            className="sm:col-span-2"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-[hsl(var(--gold)/0.18)] bg-white p-3">
          <div className="flex items-center gap-2">
            {notifyPlanner ? <Bell className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" /> : <BellOff className="h-3.5 w-3.5 text-muted-foreground" />}
            <div>
              <Label className="text-xs font-display font-semibold">Notificeer planner bij overschrijding</Label>
              <p className="text-[11px] text-muted-foreground">Push-notificatie naar de planner-rol via de notifications-tabel.</p>
            </div>
          </div>
          <Switch checked={notifyPlanner} onCheckedChange={setNotifyPlanner} />
        </div>

        <div>
          <Button onClick={handleSave} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Opslaan
          </Button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  id,
  value,
  onChange,
  min,
  step = 1,
  suffix,
  className,
}: {
  label: string;
  id: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          value={value}
          step={step}
          min={min}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="pr-20"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-display font-semibold uppercase tracking-[0.16em] text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
