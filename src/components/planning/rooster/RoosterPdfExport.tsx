import type {
  DriverSchedule,
  DriverScheduleStatus,
  ShiftTemplate,
} from "@/types/rooster";
import { DRIVER_SCHEDULE_STATUS_LABELS, resolveSchedule } from "@/types/rooster";
import type { Driver } from "@/hooks/useDrivers";
import type { RawVehicle } from "@/hooks/useVehiclesRaw";

/**
 * Genereert een A4-liggend PDF met het rooster voor een enkele dag.
 * jsPDF is al aanwezig als dependency (zie `reportExporter.ts`), dus we laden
 * 'm via dynamic import om de bundle klein te houden.
 */
export async function exportDayRosterPdf(
  date: string,
  schedules: DriverSchedule[],
  drivers: Driver[],
  vehicles: RawVehicle[],
  templates: ShiftTemplate[],
  options?: { includeFreeDays?: boolean },
): Promise<void> {
  const includeFreeDays = options?.includeFreeDays ?? false;

  const scheduleByDriver = new Map<string, DriverSchedule>();
  for (const s of schedules) scheduleByDriver.set(s.driver_id, s);

  const activeDrivers = drivers.filter((d) => d.is_active !== false);

  type Row = {
    name: string;
    template: string;
    start: string;
    vehicle: string;
    status: string;
    note: string;
  };

  const rows: Row[] = [];
  for (const driver of activeDrivers) {
    const schedule = scheduleByDriver.get(driver.id);
    if (!schedule) continue;
    if (!includeFreeDays && schedule.status === "vrij") continue;

    const resolved = resolveSchedule(schedule, templates);
    const vehicle = schedule.vehicle_id
      ? vehicles.find((v) => v.id === schedule.vehicle_id)
      : null;

    rows.push({
      name: driver.name,
      template: resolved.template?.name ?? "",
      start:
        schedule.status === "werkt" && resolved.effectiveStartTime
          ? resolved.effectiveStartTime
          : "",
      vehicle:
        schedule.status === "werkt" && vehicle
          ? vehicle.code || vehicle.plate || vehicle.name
          : "",
      status: DRIVER_SCHEDULE_STATUS_LABELS[schedule.status],
      note: schedule.notitie ?? "",
    });
  }

  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageWidth = 297;
  const ml = 15;
  const mr = 15;
  const cw = pageWidth - ml - mr;

  const formattedDate = formatDateNL(date);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(`Rooster ${formattedDate}`, ml, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Gegenereerd op ${new Date().toLocaleString("nl-NL")}`,
    pageWidth - mr,
    20,
    { align: "right" },
  );

  const cols: { label: string; x: number; w: number; align?: "left" | "right" }[] = [
    { label: "Naam", x: ml, w: 55 },
    { label: "Rooster", x: ml + 55, w: 45 },
    { label: "Starttijd", x: ml + 100, w: 25 },
    { label: "Voertuig", x: ml + 125, w: 30 },
    { label: "Status", x: ml + 155, w: 30 },
    { label: "Notitie", x: ml + 185, w: pageWidth - mr - (ml + 185) },
  ];

  let y = 32;
  doc.setFillColor(245, 245, 247);
  doc.rect(ml, y - 5, cw, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  for (const col of cols) {
    doc.text(col.label, col.x + 1, y - 0.5);
  }

  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  if (rows.length === 0) {
    doc.setTextColor(140, 140, 140);
    doc.text("Geen geplande chauffeurs voor deze dag.", ml, y + 4);
  } else {
    for (const row of rows) {
      if (y > 195) {
        doc.addPage();
        y = 20;
      }
      doc.text(truncate(row.name, 32), cols[0].x + 1, y);
      doc.text(truncate(row.template, 26), cols[1].x + 1, y);
      doc.text(row.start, cols[2].x + 1, y);
      doc.text(truncate(row.vehicle, 16), cols[3].x + 1, y);
      doc.text(row.status, cols[4].x + 1, y);
      doc.text(truncate(row.note, 50), cols[5].x + 1, y);

      y += 6;
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.line(ml, y - 2.5, pageWidth - mr, y - 2.5);
    }
  }

  const blob = doc.output("blob");
  triggerDownload(blob, `rooster-${date}.pdf`);
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + "." : text;
}

function formatDateNL(date: string): string {
  try {
    const d = new Date(date + "T00:00:00");
    return d.toLocaleDateString("nl-NL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Kleine re-export zodat consumers ook het status-type en de resolver kunnen
// gebruiken zonder vanuit de types-module te importeren als ze puur de export
// gebruiken (type-check helper).
export type { DriverScheduleStatus };
