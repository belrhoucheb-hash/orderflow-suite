import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { Copy, Eraser, Wand2 } from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

import { supabase } from "@/integrations/supabase/client";
import { useDrivers } from "@/hooks/useDrivers";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useShiftTemplates } from "@/hooks/useShiftTemplates";
import type {
  DriverSchedule,
  DriverScheduleUpsert,
  ShiftTemplate,
} from "@/types/rooster";

interface Props {
  /**
   * Een datum binnen de gewenste week (yyyy-mm-dd). De component rekent
   * zelf de maandag van die week uit voor bulk-acties.
   */
  date: string;
  onDone?: () => void;
}

type ApplyMode = "empty-only" | "overwrite";

function addDaysStr(d: string, days: number): string {
  return format(addDays(parseISO(d), days), "yyyy-MM-dd");
}

export function RoosterBulkActions({ date, onDone }: Props) {
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

  const [applyMode, setApplyMode] = useState<ApplyMode>("empty-only");
  const [copyOpen, setCopyOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const weekRangeLabel = `${format(parseISO(weekStart), "d MMM", { locale: nl })} , ${format(parseISO(weekEnd), "d MMM yyyy", { locale: nl })}`;
  const prevWeekRangeLabel = `${format(parseISO(prevWeekStart), "d MMM", { locale: nl })} , ${format(parseISO(prevWeekEnd), "d MMM yyyy", { locale: nl })}`;

  async function handleCopyPreviousWeek() {
    try {
      const { data, error } = await supabase
        .from("driver_schedules" as any)
        .select("*")
        .gte("date", prevWeekStart)
        .lte("date", prevWeekEnd);
      if (error) throw error;

      const rows = (data as any as DriverSchedule[]) ?? [];
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
        const templateId = anyD.default_shift_template_id ?? null;
        const vehicleId = anyD.default_vehicle_id ?? null;
        if (!templateId) continue;

        const template: ShiftTemplate | undefined = templates.find(
          (t) => t.id === templateId,
        );

        for (let i = 0; i < 7; i++) {
          const date = addDaysStr(weekStart, i);
          const key = `${d.id}|${date}`;
          if (applyMode === "empty-only" && existingKeys.has(key)) continue;

          upserts.push({
            driver_id: d.id,
            date,
            shift_template_id: templateId,
            start_time: template?.default_start_time ?? null,
            end_time: template?.default_end_time ?? null,
            vehicle_id: vehicleId,
            status: "werkt",
            notitie: null,
          });
        }
      }

      if (upserts.length === 0) {
        toast.info(
          applyMode === "empty-only"
            ? "Geen lege dagen gevonden voor chauffeurs met standaardrooster"
            : "Geen chauffeurs met standaardrooster ingesteld",
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

  const isBusy = bulkUpsert.isPending || deleteRange.isPending;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AlertDialog open={copyOpen} onOpenChange={setCopyOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isBusy}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Kopieer vorige week
          </Button>
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
          <Button variant="outline" size="sm" disabled={isBusy}>
            <Wand2 className="h-3.5 w-3.5 mr-1.5" />
            Pas standaardrooster toe
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standaardrooster toepassen</AlertDialogTitle>
            <AlertDialogDescription>
              Vult {weekRangeLabel} in op basis van het standaardrooster en
              standaardvoertuig per chauffeur. Alleen chauffeurs met een
              standaardrooster in hun profiel worden meegenomen.
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

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isBusy}>
            <Eraser className="h-3.5 w-3.5 mr-1.5" />
            Wis week
          </Button>
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
