import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Trash2 } from "lucide-react";

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
import type { Driver } from "@/hooks/useDrivers";
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

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{driver.name}</div>
        <div className="text-xs text-muted-foreground capitalize">
          {dateLabel}
        </div>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as DriverScheduleStatus)}
          >
            <SelectTrigger className="h-8 text-sm">
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
          <Label className="text-xs">Rooster</Label>
          <Select
            value={shiftTemplateId}
            onValueChange={onTemplateChange}
            disabled={!statusAllowsTimes}
          >
            <SelectTrigger className="h-8 text-sm">
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
            <Label className="text-xs">Starttijd</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!statusAllowsTimes}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Eindtijd</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!statusAllowsTimes}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Voertuig</Label>
          <Select
            value={vehicleId}
            onValueChange={setVehicleId}
            disabled={!statusAllowsTimes}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Geen voertuig" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Geen voertuig</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.code}
                  {v.plate ? ` , ${v.plate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notitie</Label>
          <Input
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            placeholder="Optioneel"
            className="h-8 text-sm"
            maxLength={500}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {existingSchedule?.id ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isDeleting || isSaving}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Wis rooster
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving || isDeleting}
          >
            Annuleren
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
