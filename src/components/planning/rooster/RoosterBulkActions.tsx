import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, eachDayOfInterval, format, parseISO, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { CalendarOff, Copy, Eraser, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { useDrivers } from "@/hooks/useDrivers";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import {
  useAllSchedulePatterns,
  type DayOfWeek,
} from "@/hooks/useSchedulePatterns";
import {
  DRIVER_SCHEDULE_STATUSES,
  DRIVER_SCHEDULE_STATUS_LABELS,
  type DriverSchedule,
  type DriverScheduleStatus,
  type DriverScheduleUpsert,
  type ShiftTemplate,
} from "@/types/rooster";

type RoosterMode = "day" | "week";

interface Props {
  /**
   * Een datum binnen de gewenste week (yyyy-mm-dd). De component rekent
   * zelf de maandag van die week uit voor bulk-acties.
   */
  date: string;
  /** Bepaalt welke knoppen zichtbaar zijn. Default: "week". */
  mode?: RoosterMode;
  onDone?: () => void;
}

type ApplyMode = "empty-only" | "overwrite";

function addDaysStr(d: string, days: number): string {
  return format(addDays(parseISO(d), days), "yyyy-MM-dd");
}

export function RoosterBulkActions({ date, mode = "week", onDone }: Props) {
  const weekStart = useMemo(
    () =>
      format(
        startOfWeek(parseISO(date), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      ),
    [date],
  );
  const weekEnd = useMemo(() => addDaysStr(weekStart, 6), [weekStart]);
  const prevWeekStart = useMemo(() => addDaysStr(weekStart, -7), [weekStart]);
  const prevWeekEnd = useMemo(() => addDaysStr(weekStart, -1), [weekStart]);

  const { data: drivers = [] } = useDrivers();
  const { templates } = useShiftTemplates();
  const { bulkUpsert, deleteRange, schedules } = useDriverSchedules(
    weekStart,
    weekEnd,
  );
  const { patternsByDriver } = useAllSchedulePatterns();

  const [applyMode, setApplyMode] = useState<ApplyMode>("empty-only");
  const [copyOpen, setCopyOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearDayOpen, setClearDayOpen] = useState(false);

  // Verlof-dialoog state
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveDriverId, setLeaveDriverId] = useState<string>("");
  const [leaveStatus, setLeaveStatus] =
    useState<DriverScheduleStatus>("verlof");
  const [leaveFrom, setLeaveFrom] = useState<string>(date);
  const [leaveTo, setLeaveTo] = useState<string>(date);
  const [leaveNote, setLeaveNote] = useState<string>("");

  const weekRangeLabel = `${format(parseISO(weekStart), "d MMM", { locale: nl })} , ${format(parseISO(weekEnd), "d MMM yyyy", { locale: nl })}`;
  const prevWeekRangeLabel = `${format(parseISO(prevWeekStart), "d MMM", { locale: nl })} , ${format(parseISO(prevWeekEnd), "d MMM yyyy", { locale: nl })}`;
  const dayLabel = format(parseISO(date), "EEEE d MMMM yyyy", { locale: nl });

  async function handleCopyPreviousWeek() {
    try {
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("*")
        .gte("date", prevWeekStart)
        .lte("date", prevWeekEnd);
      if (error) throw error;

      const rows = (data as DriverSchedule[]) ?? [];
      if (rows.length === 0) {
        toast.info("Vorige week is leeg, niets om te kopieren");
        setCopyOpen(false);
        return;
      }

      const upserts: DriverScheduleUpsert[] = rows.map((r) => ({
        driver_id: r.driver_id,
        date: addDaysStr(r.date, 7),
        shift_template_id: r.shift_template_id,
        start_time: r.start_time,
        end_time: r.end_time,
        vehicle_id: r.vehicle_id,
        status: r.status,
        notitie: r.notitie,
      }));

      await bulkUpsert.mutateAsync(upserts);
      toast.success(`${upserts.length} rooster-rijen gekopieerd`);
      setCopyOpen(false);
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Kopieren mislukt: " + msg);
    }
  }

  async function handleApplyDefaults() {
    try {
      const activeDrivers = drivers.filter((d) => d.is_active);
      const existingKeys = new Set(
        schedules.map((s) => `${s.driver_id}|${s.date}`),
      );

      const upserts: DriverScheduleUpsert[] = [];
      for (const d of activeDrivers) {
        const anyD = d as unknown as {
          default_shift_template_id?: string | null;
          default_vehicle_id?: string | null;
        };
        const fallbackTemplateId = anyD.default_shift_template_id ?? null;
        const fallbackVehicleId = anyD.default_vehicle_id ?? null;
        const fallbackTemplate: ShiftTemplate | undefined = fallbackTemplateId
          ? templates.find((t) => t.id === fallbackTemplateId)
          : undefined;

        const driverPatterns = patternsByDriver.get(d.id);

        for (let i = 0; i < 7; i++) {
          const date = addDaysStr(weekStart, i);
          const key = `${d.id}|${date}`;
          if (applyMode === "empty-only" && existingKeys.has(key)) continue;

          const dow = parseISO(date).getDay() as DayOfWeek;
          const pattern = driverPatterns?.get(dow);

          // 1) Patroon van laatste 8 weken voor deze dag-van-week.
          if (pattern) {
            const patternTemplate = pattern.shift_template_id
              ? templates.find((t) => t.id === pattern.shift_template_id)
              : undefined;
            upserts.push({
              driver_id: d.id,
              date,
              shift_template_id: pattern.shift_template_id,
              start_time:
                pattern.start_time ??
                patternTemplate?.default_start_time ??
                null,
              end_time: patternTemplate?.default_end_time ?? null,
              vehicle_id: pattern.vehicle_id,
              status: "werkt",
              notitie: null,
            });
            continue;
          }

          // 2) Val-back: standaardrooster op het chauffeur-profiel.
          if (fallbackTemplateId) {
            upserts.push({
              driver_id: d.id,
              date,
              shift_template_id: fallbackTemplateId,
              start_time: fallbackTemplate?.default_start_time ?? null,
              end_time: fallbackTemplate?.default_end_time ?? null,
              vehicle_id: fallbackVehicleId,
              status: "werkt",
              notitie: null,
            });
            continue;
          }

          // 3) Geen patroon en geen standaard: dag overslaan.
        }
      }

      if (upserts.length === 0) {
        toast.info(
          applyMode === "empty-only"
            ? "Geen lege dagen gevonden voor chauffeurs met patroon of standaardrooster"
            : "Geen chauffeurs met patroon of standaardrooster gevonden",
        );
        setApplyOpen(false);
        return;
      }

      await bulkUpsert.mutateAsync(upserts);
      toast.success(`${upserts.length} rooster-rijen ingevuld`);
      setApplyOpen(false);
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Standaardrooster toepassen mislukt: " + msg);
    }
  }

  async function handleClearWeek() {
    try {
      await deleteRange.mutateAsync({ from: weekStart, to: weekEnd });
      toast.success("Week gewist");
      setClearConfirmOpen(false);
      setClearOpen(false);
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Wissen mislukt: " + msg);
    }
  }

  async function handleClearDay() {
    try {
      await deleteRange.mutateAsync({ from: date, to: date });
      toast.success("Dag gewist");
      setClearDayOpen(false);
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Wissen mislukt: " + msg);
    }
  }

  async function handleApplyLeave() {
    try {
      if (!leaveDriverId) {
        toast.error("Kies een chauffeur");
        return;
      }
      if (!leaveFrom || !leaveTo) {
        toast.error("Vul een geldige periode in");
        return;
      }
      if (parseISO(leaveTo) < parseISO(leaveFrom)) {
        toast.error("Tot-datum ligt voor de Van-datum");
        return;
      }

      const range = eachDayOfInterval({
        start: parseISO(leaveFrom),
        end: parseISO(leaveTo),
      });
      const upserts: DriverScheduleUpsert[] = range.map((d) => ({
        driver_id: leaveDriverId,
        date: format(d, "yyyy-MM-dd"),
        shift_template_id: null,
        start_time: null,
        end_time: null,
        vehicle_id: null,
        status: leaveStatus,
        notitie: leaveNote.trim() ? leaveNote.trim() : null,
      }));

      await bulkUpsert.mutateAsync(upserts);

      const driverName =
        drivers.find((d) => d.id === leaveDriverId)?.name ?? "chauffeur";
      const statusLabel =
        DRIVER_SCHEDULE_STATUS_LABELS[leaveStatus].toLowerCase();
      toast.success(
        `${upserts.length} dagen gemarkeerd als ${statusLabel} voor ${driverName}`,
      );
      setLeaveOpen(false);
      setLeaveNote("");
      onDone?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "onbekende fout";
      toast.error("Verlof toepassen mislukt: " + msg);
    }
  }

  const isBusy = bulkUpsert.isPending || deleteRange.isPending;

  if (mode === "day") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <AlertDialog open={clearDayOpen} onOpenChange={setClearDayOpen}>
          <AlertDialogTrigger asChild>
            <button type="button" className="btn-luxe" disabled={isBusy}>
              <Eraser className="h-4 w-4" />
              Wis deze dag
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dag wissen?</AlertDialogTitle>
              <AlertDialogDescription>
                Dit verwijdert alle rooster-rijen van {dayLabel}. Deze actie
                kan niet ongedaan gemaakt worden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearDay}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Ja, wissen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AlertDialog open={copyOpen} onOpenChange={setCopyOpen}>
        <AlertDialogTrigger asChild>
          <button type="button" className="btn-luxe" disabled={isBusy}>
            <Copy className="h-4 w-4" />
            Kopieer vorige week
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kopieer vorige week</AlertDialogTitle>
            <AlertDialogDescription>
              Kopieer alle rooster-rijen van {prevWeekRangeLabel} naar{" "}
              {weekRangeLabel}. Bestaande rijen in deze week worden
              overschreven.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyPreviousWeek}>
              Kopieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={applyOpen} onOpenChange={setApplyOpen}>
        <AlertDialogTrigger asChild>
          <button type="button" className="btn-luxe" disabled={isBusy}>
            <Wand2 className="h-4 w-4" />
            Pas standaardrooster toe
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standaardrooster toepassen</AlertDialogTitle>
            <AlertDialogDescription>
              Vult {weekRangeLabel} in. Suggesties worden gebaseerd op de
              laatste 8 weken planning per chauffeur, met val-back op het
              standaard-rooster van het chauffeur-profiel.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Toepassen op</Label>
            <Select
              value={applyMode}
              onValueChange={(v) => setApplyMode(v as ApplyMode)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="empty-only">
                  Alleen lege dagen invullen
                </SelectItem>
                <SelectItem value="overwrite">
                  Alles overschrijven
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleApplyDefaults}>
              Toepassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogTrigger asChild>
          <button type="button" className="btn-luxe" disabled={isBusy}>
            <CalendarOff className="h-4 w-4" />
            Markeer verlof
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verlof markeren</DialogTitle>
            <DialogDescription>
              Markeer een aaneengesloten periode als verlof, ziek of feestdag
              voor een chauffeur. Bestaande rooster-rijen in dit bereik worden
              overschreven.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Chauffeur</Label>
              <Select
                value={leaveDriverId}
                onValueChange={setLeaveDriverId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Kies chauffeur" />
                </SelectTrigger>
                <SelectContent>
                  {drivers
                    .filter((d) => d.is_active !== false)
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              <Select
                value={leaveStatus}
                onValueChange={(v) =>
                  setLeaveStatus(v as DriverScheduleStatus)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRIVER_SCHEDULE_STATUSES.filter((s) => s !== "werkt").map(
                    (s) => (
                      <SelectItem key={s} value={s}>
                        {DRIVER_SCHEDULE_STATUS_LABELS[s]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Van</Label>
                <Input
                  type="date"
                  value={leaveFrom}
                  onChange={(e) => setLeaveFrom(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tot (incl.)</Label>
                <Input
                  type="date"
                  value={leaveTo}
                  onChange={(e) => setLeaveTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Notitie (optioneel)</Label>
              <Textarea
                value={leaveNote}
                onChange={(e) => setLeaveNote(e.target.value)}
                placeholder="Bijv. familiebezoek, doktersafspraak"
                maxLength={500}
                className="min-h-[60px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLeaveOpen(false)}
              disabled={isBusy}
            >
              Annuleren
            </Button>
            <Button onClick={handleApplyLeave} disabled={isBusy}>
              Toepassen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogTrigger asChild>
          <button type="button" className="btn-luxe btn-luxe--danger" disabled={isBusy}>
            <Eraser className="h-4 w-4" />
            Wis week
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Week wissen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert alle rooster-rijen van {weekRangeLabel}. Deze
              actie kan niet ongedaan gemaakt worden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setClearConfirmOpen(true);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Volgende
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Definitief wissen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je het echt zeker? Alle rooster-rijen van {weekRangeLabel}{" "}
              worden definitief verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nee, annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearWeek}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ja, wissen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
