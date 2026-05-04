import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DEFAULT_ETA_NOTIFICATION_SETTINGS,
  type EtaNotificationSettings as EtaNotificationSettingsType,
} from "@/types/notifications";
import { useLoadEtaSettings, useSaveEtaSettings } from "@/hooks/useEtaSettings";
import { useLoadSettings, useSaveSettings } from "@/hooks/useSettings";

interface GeneralSettings {
  broadcast_stop_updates?: boolean;
}

const SEVERITY_OPTIONS: Array<{ value: EtaNotificationSettingsType["predicted_delay_severity"]; label: string }> = [
  { value: "LOW", label: "Laag" },
  { value: "MEDIUM", label: "Gemiddeld" },
  { value: "HIGH", label: "Hoog" },
];

function clampInt(value: string, fallback: number, min = 0, max = 720): number {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function EtaNotificationSettings() {
  const { data: loaded, isLoading } = useLoadEtaSettings();
  const save = useSaveEtaSettings();
  const { data: generalSettings } = useLoadSettings<GeneralSettings>("general");
  const saveGeneral = useSaveSettings("general");

  const [form, setForm] = useState<EtaNotificationSettingsType>(DEFAULT_ETA_NOTIFICATION_SETTINGS);
  const [broadcastStopUpdates, setBroadcastStopUpdates] = useState<boolean>(true);
  const [baseline, setBaseline] = useState<string>("");

  useEffect(() => {
    if (isLoading) return;
    setForm(loaded);
    setBroadcastStopUpdates(generalSettings?.broadcast_stop_updates ?? true);
    setBaseline(
      JSON.stringify({
        eta: loaded,
        broadcast: generalSettings?.broadcast_stop_updates ?? true,
      }),
    );
  }, [isLoading, loaded, generalSettings]);

  const dirty =
    baseline !== "" &&
    JSON.stringify({ eta: form, broadcast: broadcastStopUpdates }) !== baseline;

  async function handleSave() {
    try {
      await save.mutateAsync(form as unknown as Record<string, unknown>);
      await saveGeneral.mutateAsync({
        ...(generalSettings ?? {}),
        broadcast_stop_updates: broadcastStopUpdates,
      });
      setBaseline(JSON.stringify({ eta: form, broadcast: broadcastStopUpdates }));
      toast.success("ETA-instellingen opgeslagen");
    } catch {
      toast.error("Fout bij opslaan", { description: "Probeer het opnieuw." });
    }
  }

  function update<K extends keyof EtaNotificationSettingsType>(
    key: K,
    value: EtaNotificationSettingsType[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="card--luxe p-6 space-y-6">
      <div>
        <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
          ETA en klant-meldingen
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bepaal wanneer klanten een aankomstmelding krijgen en wanneer de planner een waarschuwing ziet bij een voorspelde vertraging.
        </p>
      </div>

      <div className="flex items-center justify-between py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <div className="space-y-0.5 pr-4">
          <Label className="text-sm font-medium">Stuur klanten automatisch een statusupdate</Label>
          <p className="text-xs text-muted-foreground">
            Verstuurt portal-notificatie en e-mail bij stop-overgang naar onderweg, aangekomen of afgeleverd. Mislukte bezorgingen versturen ook altijd een melding.
          </p>
        </div>
        <Switch
          checked={broadcastStopUpdates}
          onCheckedChange={(v) => setBroadcastStopUpdates(v)}
        />
      </div>

      <div className="flex items-center justify-between py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <div className="space-y-0.5 pr-4">
          <Label className="text-sm font-medium">Klant-notificaties aan</Label>
          <p className="text-xs text-muted-foreground">
            Hoofdschakelaar. Staat dit uit, dan stuurt het systeem geen klant-SMS, ongeacht de drempels hieronder.
          </p>
        </div>
        <Switch
          checked={form.customer_notifications_enabled}
          onCheckedChange={(v) => update("customer_notifications_enabled", v)}
        />
      </div>

      <div className="space-y-2 py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <Label htmlFor="eta-lead" className="text-sm font-medium">
          Vooraankondiging klant (minuten)
        </Label>
        <Input
          id="eta-lead"
          type="number"
          min={0}
          max={720}
          value={form.customer_push_lead_minutes}
          onChange={(e) =>
            update("customer_push_lead_minutes", clampInt(e.target.value, form.customer_push_lead_minutes))
          }
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          De klant ontvangt zoveel minuten vóór de verwachte aankomst een eerste SMS met track-link.
        </p>
      </div>

      <div className="space-y-2 py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <Label htmlFor="eta-update" className="text-sm font-medium">
          Drempel update-SMS (minuten)
        </Label>
        <Input
          id="eta-update"
          type="number"
          min={0}
          max={720}
          value={form.customer_update_threshold_minutes}
          onChange={(e) =>
            update(
              "customer_update_threshold_minutes",
              clampInt(e.target.value, form.customer_update_threshold_minutes),
            )
          }
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          Alleen als de verwachte aankomst meer dan dit aantal minuten verschuift, krijgt de klant een tweede bericht.
        </p>
      </div>

      <div className="space-y-2 py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <Label htmlFor="eta-delay-threshold" className="text-sm font-medium">
          Drempel voorspelde vertraging (minuten)
        </Label>
        <Input
          id="eta-delay-threshold"
          type="number"
          min={0}
          max={720}
          value={form.predicted_delay_threshold_minutes}
          onChange={(e) =>
            update(
              "predicted_delay_threshold_minutes",
              clampInt(e.target.value, form.predicted_delay_threshold_minutes),
            )
          }
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          Hoeveel minuten boven het tijdvenster voordat een waarschuwing in Uitzonderingen verschijnt.
        </p>
      </div>

      <div className="space-y-2 py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <Label htmlFor="eta-badge-threshold" className="text-sm font-medium">
          Drempel ETA-badge in dispatcher (minuten)
        </Label>
        <Input
          id="eta-badge-threshold"
          type="number"
          min={0}
          max={720}
          value={form.eta_min_shift_for_badge_minutes}
          onChange={(e) =>
            update(
              "eta_min_shift_for_badge_minutes",
              clampInt(e.target.value, form.eta_min_shift_for_badge_minutes),
            )
          }
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          Hoeveel minuten afwijking voor de gele ETA-badge in de ritlijst.
        </p>
      </div>

      <div className="space-y-2 py-3 border-t border-[hsl(var(--gold)/0.12)]">
        <Label htmlFor="eta-severity" className="text-sm font-medium">
          Severity bij voorspelde vertraging
        </Label>
        <div className="max-w-[220px]">
          <Select
            value={form.predicted_delay_severity}
            onValueChange={(v) =>
              update("predicted_delay_severity", v as EtaNotificationSettingsType["predicted_delay_severity"])
            }
          >
            <SelectTrigger id="eta-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Hoe zwaar Uitzonderingen deze waarschuwing weegt.
        </p>
      </div>

      <div className="pt-4 border-t border-[hsl(var(--gold)/0.12)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || save.isPending || saveGeneral.isPending}
          className="btn-luxe btn-luxe--primary !h-9"
        >
          {(save.isPending || saveGeneral.isPending) ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
