export interface OrderRouteLine {
  id?: string;
  activiteit?: "Laden" | "Lossen" | string;
  locatie?: string | null;
  datum?: string | null;
  tijd?: string | null;
  tijdTot?: string | null;
}

export type OrderRouteRuleIssueKey =
  | "pickup_time_window"
  | "delivery_time_window"
  | "route_sequence"
  | "route_duplicate";

export interface OrderRouteRuleIssue {
  key: OrderRouteRuleIssueKey;
  message: string;
  lineId?: string;
  label?: string;
}

function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateToDayMinutes(value: string | null | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day)) / 60000;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 60000;
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  const match = (value ?? "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function routeMoment(line: OrderRouteLine, side: "start" | "end"): number | null {
  const dateMinutes = parseDateToDayMinutes(line.datum);
  if (dateMinutes == null) return null;

  const preferredTime = side === "end"
    ? line.tijdTot || line.tijd
    : line.tijd || line.tijdTot;
  return dateMinutes + (parseTimeToMinutes(preferredTime) ?? 0);
}

function deliveryLabel(index: number, total: number): string {
  if (total <= 1) return "Levermoment";
  if (index === total - 1) return "Eindbestemming";
  return `Stop ${index + 1}`;
}

function labelForLine(line: OrderRouteLine, deliveries: OrderRouteLine[]): string {
  if (line.activiteit === "Laden") return "Laadmoment";
  const deliveryIndex = deliveries.findIndex((delivery) => delivery === line || delivery.id === line.id);
  return deliveryLabel(Math.max(deliveryIndex, 0), deliveries.length);
}

function addIssueOnce(issues: OrderRouteRuleIssue[], issue: OrderRouteRuleIssue) {
  const fingerprint = `${issue.key}:${issue.lineId ?? ""}:${issue.message}`;
  if (issues.some((existing) => `${existing.key}:${existing.lineId ?? ""}:${existing.message}` === fingerprint)) return;
  issues.push(issue);
}

export function getOrderRouteRuleIssues(lines: OrderRouteLine[]): OrderRouteRuleIssue[] {
  const issues: OrderRouteRuleIssue[] = [];
  const pickup = lines.find((line) => line.activiteit === "Laden");
  const deliveries = lines.filter((line) => line.activiteit === "Lossen");
  const orderedStops = [pickup, ...deliveries].filter(Boolean) as OrderRouteLine[];

  for (const line of orderedStops) {
    const from = parseTimeToMinutes(line.tijd);
    const to = parseTimeToMinutes(line.tijdTot);
    if (from != null && to != null && to <= from) {
      const isPickup = line.activiteit === "Laden";
      const label = labelForLine(line, deliveries);
      addIssueOnce(issues, {
        key: isPickup ? "pickup_time_window" : "delivery_time_window",
        lineId: line.id,
        label,
        message: isPickup
          ? "Laadtijd 'tot' moet later zijn dan laadtijd 'van'."
          : `${label} tijd 'tot' moet later zijn dan tijd 'van'.`,
      });
    }
  }

  const seenAddresses = new Map<string, { label: string; lineId?: string }>();
  for (const line of orderedStops) {
    const normalized = normalizeAddress(line.locatie);
    if (!normalized) continue;

    const label = labelForLine(line, deliveries);
    const existing = seenAddresses.get(normalized);
    if (existing) {
      addIssueOnce(issues, {
        key: "route_duplicate",
        lineId: line.id,
        label,
        message: `${label} gebruikt hetzelfde adres als ${existing.label}. Kies een andere locatie.`,
      });
    } else {
      seenAddresses.set(normalized, { label, lineId: line.id });
    }
  }

  for (let index = 1; index < orderedStops.length; index += 1) {
    const previous = orderedStops[index - 1];
    const current = orderedStops[index];
    const previousMoment = routeMoment(previous, "end");
    const currentMoment = routeMoment(current, "start");
    if (previousMoment == null || currentMoment == null || currentMoment > previousMoment) continue;

    const previousLabel = labelForLine(previous, deliveries);
    const currentLabel = labelForLine(current, deliveries);
    addIssueOnce(issues, {
      key: current.activiteit === "Laden" ? "pickup_time_window" : "delivery_time_window",
      lineId: current.id,
      label: currentLabel,
      message: `${currentLabel} kan niet eerder zijn dan ${previousLabel}.`,
    });
  }

  return issues;
}
