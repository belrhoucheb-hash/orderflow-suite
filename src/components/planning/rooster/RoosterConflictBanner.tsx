import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DriverSchedule } from "@/types/rooster";
import { findVehicleConflictsOnDate } from "@/lib/roosterConflicts";

interface Props {
  /** Alle schedules voor de relevante datum (Day-view) of een hele week (Week-view). */
  schedules: DriverSchedule[];
  /** Optioneel filter op één datum, gebruikt door Week-view per kolom. */
  date?: string;
  /** Map driver_id -> naam voor leesbare conflict-tekst. */
  driverNames?: Map<string, string>;
  /** Map vehicle_id -> code/plate voor leesbare conflict-tekst. */
  vehicleLabels?: Map<string, string>;
  className?: string;
}

/**
 * Toont een waarschuwing wanneer twee of meer chauffeurs op hetzelfde
 * voertuig op dezelfde dag staan. Verbergt zichzelf als er geen conflict is.
 */
export function RoosterConflictBanner({
  schedules,
  date,
  driverNames,
  vehicleLabels,
  className,
}: Props) {
  const filtered = date
    ? schedules.filter((s) => s.date === date)
    : schedules;
  const conflicts = findVehicleConflictsOnDate(filtered);

  if (conflicts.size === 0) return null;

  const items: string[] = [];
  conflicts.forEach((rows, vehicleId) => {
    const vehicleLabel = vehicleLabels?.get(vehicleId) ?? "voertuig";
    const names = rows
      .map((r) => driverNames?.get(r.driver_id) ?? "chauffeur")
      .join(", ");
    items.push(`${vehicleLabel}: ${names}`);
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs flex items-start gap-2",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="text-amber-900 dark:text-amber-100">
        <span className="font-medium">Voertuig dubbel ingepland:</span>{" "}
        {items.join(" , ")}
      </div>
    </div>
  );
}
