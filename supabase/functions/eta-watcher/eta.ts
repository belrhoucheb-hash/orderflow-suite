// Pure ETA-functies, server-side variant van src/hooks/useTracking.ts
// (calculateETAMinutes + de loop uit useTripETA). Geen React-imports zodat
// dit in Deno draait en in tests rechtstreeks importeerbaar is.
//
// Waarom een aparte module: de cron-edge function eta-watcher en de
// frontend-hook moeten dezelfde voorspelling uitrekenen, anders ziet de
// klant een andere ETA dan de planner. Pure functies zonder side-effects
// maken dat triviaal te testen.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface CalculateEtaArgs {
  currentLat: number;
  currentLng: number;
  /** Snelheid van het voertuig in km/h. Valt terug op defaultSpeedKmh als <= 0 of undefined. */
  speedKmh?: number;
  /** Resterende stops in volgorde, eerste = volgende stop. */
  remainingStops: LatLng[];
  /** Minuten dwell-tijd per stop (laden/lossen). Default 25. */
  dwellMinutesPerStop?: number;
  /** Fallback-snelheid wanneer er geen recente snelheid bekend is. Default 50. */
  defaultSpeedKmh?: number;
}

const DEFAULT_DWELL_MIN = 25;
const DEFAULT_SPEED_KMH = 50;

/**
 * Haversine-afstand in km tussen twee punten op de aarde. Identiek aan
 * de formule in src/hooks/useTracking.ts regels 60-69.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

/**
 * Cumulatieve ETA in minuten per resterende stop, gerekend vanaf de huidige
 * voertuigpositie. Per stop = rijtijd tot daar (op basis van km en
 * gemiddelde snelheid) + dwell-tijd voor alle eerdere stops in de keten.
 *
 * Voorbeeld met 3 stops, dwell=25, speed=50: ETA[0] = rijtijd naar stop 0;
 * ETA[1] = ETA[0] + 25 + rijtijd 0->1; ETA[2] = ETA[1] + 25 + rijtijd 1->2.
 */
export function calculateEtaMinutes(args: CalculateEtaArgs): number[] {
  const {
    currentLat,
    currentLng,
    remainingStops,
    speedKmh,
    dwellMinutesPerStop = DEFAULT_DWELL_MIN,
    defaultSpeedKmh = DEFAULT_SPEED_KMH,
  } = args;

  if (remainingStops.length === 0) return [];

  const avgSpeed =
    speedKmh != null && speedKmh > 0 ? speedKmh : defaultSpeedKmh;

  const result: number[] = [];
  let cumulativeMinutes = 0;
  let prev: LatLng = { lat: currentLat, lng: currentLng };

  for (let i = 0; i < remainingStops.length; i++) {
    const next = remainingStops[i];
    const distKm = haversineKm(prev, next);
    const driveMin = (distKm / avgSpeed) * 60;
    if (i > 0) {
      // dwell rekenen we voor elke stop die we al hebben aangedaan,
      // niet voor het vertrekpunt.
      cumulativeMinutes += dwellMinutesPerStop;
    }
    cumulativeMinutes += driveMin;
    result.push(cumulativeMinutes);
    prev = next;
  }

  return result;
}
