export interface RouteStop {
  id: string;
  address: string;
  timeFrom: string;
  timeTo: string;
}

export interface RouteStopPrefs {
  route_stops?: unknown;
  [key: string]: unknown;
}

export function parseRouteStops(preferences: RouteStopPrefs | null | undefined): RouteStop[] {
  const raw = preferences?.route_stops;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const address = typeof candidate.address === "string" ? candidate.address : "";
      const timeFrom = typeof candidate.timeFrom === "string" ? candidate.timeFrom : "";
      const timeTo = typeof candidate.timeTo === "string" ? candidate.timeTo : "";
      const id =
        typeof candidate.id === "string" && candidate.id.length > 0
          ? candidate.id
          : `route-stop-${index + 1}`;

      return { id, address, timeFrom, timeTo };
    })
    .filter((stop): stop is RouteStop => !!stop);
}

export function formatRouteStopWindow(stop: Pick<RouteStop, "timeFrom" | "timeTo">): string {
  if (stop.timeFrom && stop.timeTo) return `${stop.timeFrom} - ${stop.timeTo}`;
  if (stop.timeFrom) return `Vanaf ${stop.timeFrom}`;
  if (stop.timeTo) return `Tot ${stop.timeTo}`;
  return "";
}

