import type { DriverSchedule } from "@/types/rooster";

/**
 * Zuivere helpers voor conflict-detectie in het rooster. Er is geen
 * Supabase-call of React-state, zodat ze vrij test- en herbruikbaar
 * blijven in zowel de Rooster-UI als de Planning-UI.
 */

/**
 * Groepeer schedules per vehicle_id voor rijen waar meer dan één chauffeur
 * op hetzelfde voertuig staat ingepland voor dezelfde datum.
 *
 * Negeert rijen zonder `vehicle_id` en rijen met een status die niet "werkt"
 * is (vrij, ziek, verlof, feestdag staan immers los van voertuig-bezetting).
 *
 * De aanroeper is verantwoordelijk om alleen rijen van één datum door te geven;
 * we filteren niet op datum binnen deze functie, maar groeperen per vehicle.
 */
export function findVehicleConflictsOnDate(
  schedules: DriverSchedule[],
): Map<string, DriverSchedule[]> {
  const byVehicle = new Map<string, DriverSchedule[]>();
  for (const s of schedules) {
    if (!s.vehicle_id) continue;
    if (s.status !== "werkt") continue;
    const list = byVehicle.get(s.vehicle_id) ?? [];
    list.push(s);
    byVehicle.set(s.vehicle_id, list);
  }
  // Houd alleen vehicles over waar >1 werkende chauffeur op staat
  const conflicts = new Map<string, DriverSchedule[]>();
  for (const [vehicleId, list] of byVehicle.entries()) {
    if (list.length > 1) conflicts.set(vehicleId, list);
  }
  return conflicts;
}

/**
 * True als deze schedule conflicteert met een andere schedule in de
 * gegeven set (zelfde datum, zelfde vehicle, beide status "werkt").
 * Handig voor rij-niveau UI-rood-kleuring in de Rooster-tab.
 */
export function hasConflict(
  schedule: DriverSchedule,
  allSchedules: DriverSchedule[],
): boolean {
  if (!schedule.vehicle_id) return false;
  if (schedule.status !== "werkt") return false;
  return allSchedules.some(
    (other) =>
      other.id !== schedule.id &&
      other.date === schedule.date &&
      other.vehicle_id === schedule.vehicle_id &&
      other.status === "werkt",
  );
}
