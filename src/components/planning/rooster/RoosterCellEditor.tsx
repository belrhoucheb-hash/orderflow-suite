import { useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import { useVehiclesRaw } from "@/hooks/useVehiclesRaw";
import { useVehicleAvailability } from "@/hooks/useVehicleAvailability";
import {
  useSchedulePatterns,
  type DayOfWeek,
} from "@/hooks/useSchedulePatterns";
import type { Driver } from "@/hooks/useDrivers";
import { useRoosterEligibility } from "@/hooks/useRoosterEligibility";
import { checkVehicleAvailability } from "@/lib/roosterEligibility";
import type {
  DriverSchedule,
  DriverScheduleStatus,
} from "@/types/rooster";
import {
  DRIVER_SCHEDULE_STATUSES,
  DRIVER_SCHEDULE_STATUS_LABELS,
} from "@/types/rooster";

const NONE = "__none__";

interface Props {
  driver: Driver;
  date: string;
  weekStart: string;
  weekEnd: string;
  existingSchedule?: DriverSchedule;
  onClose: () => void;
}

/**
 * Snel-bewerken van één rooster-cel. Gebruikt binnen RoosterWeekView via Popover.
 * De parent geeft dezelfde weekStart/weekEnd door als de weergave gebruikt zodat
 * de hook-cache gedeeld wordt.
 */
export function RoosterCellEditor({
  driver,
  date,
  weekStart,
  weekEnd,
  existingSchedule,
  onClose,
}: Props) {
  const { templates } = useShiftTemplates();
  const { data: vehicles = [] } = useVehiclesRaw();
  const { upsertSchedule, deleteSchedule } = useDriverSchedules(
    weekStart,
    weekEnd,
  );

  const [shiftTemplateId, setShiftTemplateId] = useState<string>(
    existingSchedule?.shift_template_id ?? NONE,
  );
  const [startTime, setStartTime] = useState<string>(
    existingSchedule?.start_time ?? "",
  );
  const [endTime, setEndTime] = useState<string>(
    existingSchedule?.end_time ?? "",
  );
  const [vehicleId, setVehicleId] = useState<string>(
    existingSchedule?.vehicle_id ?? NONE,
  );
  const [status, setStatus] = useState<DriverScheduleStatus>(
    existingSchedule?.status ?? "werkt",
  );
  const [notitie, setNotitie] = useState<string>(
    existingSchedule?.notitie ?? "",
  );

  const isSaving = upsertSchedule.isPending;
  const isDeleting = deleteSchedule.isPending;

  const dateLabel = format(parseISO(date), "EEEE d MMMM", { locale: nl });

  // Voor de eligibility-checks op het huidig gekozen voertuig.
  const eligibility = useRoosterEligibility({
    driverId: driver.id,
    date,
    vehicleId: vehicleId === NONE ? null : vehicleId,
    startTime: startTime || null,
    endTime: endTime || null,
  });

  // Aparte query voor voertuig-availability per dag, zodat we per item in
  // de Select kunnen markeren of dat voertuig op deze datum beschikbaar is.
  const { data: vehicleAvailabilityRows = [] } = useVehicleAvailability(date);
  const vehicleAvailabilityIssues = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vehicles) {
      const r = checkVehicleAvailability(v.id, date, vehicleAvailabilityRows);
      if (!r.ok && r.reason) map.set(v.id, r.reason);
    }
    return map;
  }, [vehicles, date, vehicleAvailabilityRows]);

  const { patterns } = useSchedulePatterns(driver.id);
  const dayOfWeek = useMemo(
    () => parseISO(date).getDay() as DayOfWeek,
    [date],
  );
  const suggestion = patterns.get(dayOfWeek) ?? null;

  const suggestedTemplate = suggestion?.shift_template_id
    ? templates.find((t) => t.id === suggestion.shift_template_id) ?? null
    : null;
  const suggestedVehicle = suggestion?.vehicle_id
    ? vehicles.find((v) => v.id === suggestion.vehicle_id) ?? null
    : null;
  const suggestedStartTime =
    suggestion?.start_time ?? suggestedTemplate?.default_start_time ?? null;
  const suggestedEndTime = suggestedTemplate?.default_end_time ?? null;

  // Tile alleen tonen als:
  // - er een patroon is voor deze dag-van-week (>= 3 samples) en het
  //   levert iets bruikbaars op (rooster of voertuig of starttijd),
  // - de form-state nog leeg is (gebruiker heeft niets gekozen),
  // - of de form-state al matcht met de suggestie (dan is toepassen
  //   onnodig en verwarrend).
  const formIsEmpty =
    shiftTemplateId === NONE &&
    vehicleId === NONE &&
    startTime === "" &&
    endTime === "" &&
    status === "werkt";

  const hasUsefulSuggestion =
    !!suggestion &&
    (suggestion.shift_template_id ||
      suggestion.vehicle_id ||
      suggestion.start_time);

  const showSuggestion = hasUsefulSuggestion && formIsEmpty;

  function applySuggestion() {
    if (!suggestion) return;
    setStatus("werkt");
    if (suggestion.shift_template_id) {
      setShiftTemplateId(suggestion.shift_template_id);
    }
    if (suggestedStartTime) setStartTime(suggestedStartTime);
    if (suggestedEndTime) setEndTime(suggestedEndTime);
    if (suggestion.vehicle_id) {
      setVehicleId(suggestion.vehicle_id);
    }
  }

  const suggestionParts: string[] = [];
  if (suggestedTemplate) suggestionParts.push(suggestedTemplate.name);
  if (suggestedStartTime) suggestionParts.push(suggestedStartTime);
  if (suggestedVehicle) {
    suggestionParts.push(
      suggestedVehicle.plate
        ? `${suggestedVehicle.code} (${suggestedVehicle.plate})`
        : suggestedVehicle.code,
    );
  }
  const suggestionText = suggestionParts.join(", ");

  async function handleSave() {
    try {
      await upsertSchedule.mutateAsync({
        driver_id: driver.id,
        date,
        shift_template_id: shiftTemplateId === NONE ? null : shiftTemplateId,
        start_time: startTime || null,
        end_time: endTime || null,
        vehicle_id: vehicleId === NONE ? null : vehicleId,
        status,
        notitie: notitie.trim() === "" ? null : notitie.trim(),
      });
      toast.success("Rooster opgeslagen");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Opslaan mislukt: " + msg);
    }
  }

  async function handleClear() {
    if (!existingSchedule?.id) {
      onClose();
      return;
    }
    try {
      await deleteSchedule.mutateAsync(existingSchedule.id);
      toast.success("Rooster gewist");
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Wissen mislukt: " + msg);
    }
  }

  function onTemplateChange(val: string) {
    setShiftTemplateId(val);
    if (val !== NONE) {
      const t = templates.find((x) => x.id === val);
      if (t) {
        if (!startTime) setStartTime(t.default_start_time);
        if (!endTime && t.default_end_time) setEndTime(t.default_end_time);
      }
    }
  }

  const statusAllowsTimes = status === "werkt";

  const luxeTriggerClass =
    "h-9 text-sm border-[hsl(var(--gold)/0.25)] bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--gold-soft)/0.2)_100%)] hover:border-[hsl(var(--gold)/0.5)] hover:shadow-[0_2px_8px_-2px_hsl(var(--gold)/0.2)] focus:ring-[hsl(var(--gold)/0.4)] focus:ring-offset-0 transition";
  const luxeInputClass =
    "h-9 text-sm border-[hsl(var(--gold)/0.25)] bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--gold-soft)/0.2)_100%)] focus-visible:ring-[hsl(var(--gold)/0.4)] focus-visible:ring-offset-0 transition";
  const luxeTimeClass = `${luxeInputClass} font-bold text-[hsl(var(--gold-deep))]`;
  const labelClass =
    "text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]/80";
  const displayFont: CSSProperties = {
    fontFamily: "var(--font-display)",
  };

  return (
    <div className="card--luxe p-4 space-y-3">
      <div>
        <div
          className="text-sm font-semibold text-[hsl(var(--gold-deep))]"
          style={displayFont}
        >
          {driver.name}
        </div>
        <div
          className="text-xs text-muted-foreground capitalize mt-0.5"
          style={{ ...displayFont, fontVariantNumeric: "tabular-nums" }}
        >
          {dateLabel}
        </div>
      </div>

      <div className="space-y-2.5">
        {showSuggestion && suggestionText && (
          <div
            className="card--luxe p-3 flex items-start gap-2.5"
            style={displayFont}
          >
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--gold-deep))]" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))]/80">
                Voorspelling op basis van laatste 8 weken
              </div>
              <div className="text-xs text-foreground/90 leading-snug">
                {suggestionText}
              </div>
              <button
                type="button"
                onClick={applySuggestion}
                className="btn-luxe btn-luxe--primary text-xs h-7 px-2.5"
              >
                Toepassen
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className={labelClass} style={displayFont}>
            Status
          </Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as DriverScheduleStatus)}
          >
            <SelectTrigger className={luxeTriggerClass} style={displayFont}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRIVER_SCHEDULE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className={labelClass} style={displayFont}>
            Rooster
          </Label>
          <Select
            value={shiftTemplateId}
            onValueChange={onTemplateChange}
            disabled={!statusAllowsTimes}
          >
            <SelectTrigger className={luxeTriggerClass} style={displayFont}>
              <SelectValue placeholder="Geen rooster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Geen rooster</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: t.color }}
                    />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className={labelClass} style={displayFont}>
              Starttijd
            </Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!statusAllowsTimes}
              className={luxeTimeClass}
              style={{ ...displayFont, fontVariantNumeric: "tabular-nums" }}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass} style={displayFont}>
              Eindtijd
            </Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!statusAllowsTimes}
              className={luxeTimeClass}
              style={{ ...displayFont, fontVariantNumeric: "tabular-nums" }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className={labelClass} style={displayFont}>
            Voertuig
          </Label>
          <Select
            value={vehicleId}
            onValueChange={setVehicleId}
            disabled={!statusAllowsTimes}
          >
            <SelectTrigger className={luxeTriggerClass} style={displayFont}>
              <SelectValue placeholder="Geen voertuig" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Geen voertuig</SelectItem>
              {vehicles.map((v) => {
                const issue = vehicleAvailabilityIssues.get(v.id);
                return (
                  <SelectItem key={v.id} value={v.id}>
                    <span className="inline-flex items-center gap-1.5">
                      {issue && (
                        <AlertTriangle
                          aria-label={issue}
                          className="h-3.5 w-3.5 text-destructive shrink-0"
                        />
                      )}
                      <span>
                        {v.code}
                        {v.plate ? ` , ${v.plate}` : ""}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {statusAllowsTimes &&
            vehicleId !== NONE &&
            eligibility.hasIssue && (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-2.5 py-2 text-[11px] flex items-start gap-2"
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <ul className="text-amber-900 dark:text-amber-100 space-y-0.5 leading-snug">
                  {!eligibility.vehicle.ok && eligibility.vehicle.message && (
                    <li>{eligibility.vehicle.message}</li>
                  )}
                  {!eligibility.certification.ok &&
                    eligibility.certification.message && (
                      <li>{eligibility.certification.message}</li>
                    )}
                  {!eligibility.hours.ok && eligibility.hours.message && (
                    <li>{eligibility.hours.message}</li>
                  )}
                </ul>
              </div>
            )}
        </div>

        <div className="space-y-1">
          <Label className={labelClass} style={displayFont}>
            Notitie
          </Label>
          <Input
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            placeholder="Optioneel"
            className={luxeInputClass}
            style={displayFont}
            maxLength={500}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[hsl(var(--gold)/0.15)]">
        {existingSchedule?.id ? (
          <button
            type="button"
            onClick={handleClear}
            disabled={isDeleting || isSaving}
            className="inline-flex items-center gap-1 text-xs font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/[0.06] px-2 py-1.5 rounded-md transition disabled:opacity-50 disabled:pointer-events-none"
            style={displayFont}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Wis rooster
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSaving || isDeleting}
            className="text-muted-foreground hover:text-foreground"
            style={displayFont}
          >
            Annuleren
          </Button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
            className="btn-luxe btn-luxe--primary"
          >
            {isSaving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}
