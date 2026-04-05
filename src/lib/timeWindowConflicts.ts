export interface TripStopWithWindow {
  id: string;
  stop_sequence: number;
  planned_window_start: string | null; // "HH:mm"
  planned_window_end: string | null;   // "HH:mm"
  travelMinFromPrev: number;
  unloadMin: number;
}

export interface TimeWindowConflict {
  stopId: string;
  stopSequence: number;
  type: "TE_VROEG" | "TE_LAAT" | "GEMIST";
  eta: number;          // minutes since midnight
  windowStart: number;
  windowEnd: number;
  waitMin: number;
  message: string;
}

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Simulate a forward pass through stops and detect time window violations.
 * @param stops - ordered by stop_sequence
 * @param startMinutes - departure time in minutes since midnight (default 360 = 06:00)
 */
export function detectTimeWindowConflicts(
  stops: TripStopWithWindow[],
  startMinutes: number = 360,
): TimeWindowConflict[] {
  const conflicts: TimeWindowConflict[] = [];
  let currentTime = startMinutes;

  for (const stop of stops) {
    currentTime += stop.travelMinFromPrev;
    const eta = currentTime;

    if (stop.planned_window_start && stop.planned_window_end) {
      const winStart = parseMinutes(stop.planned_window_start);
      const winEnd = parseMinutes(stop.planned_window_end);

      if (eta > winEnd) {
        conflicts.push({
          stopId: stop.id,
          stopSequence: stop.stop_sequence,
          type: "TE_LAAT",
          eta,
          windowStart: winStart,
          windowEnd: winEnd,
          waitMin: 0,
          message: `Stop ${stop.stop_sequence}: ETA ${formatMinutes(eta)}, venster sluit ${stop.planned_window_end}`,
        });
        // Assume driver still arrives and handles the stop
        currentTime = eta + stop.unloadMin;
      } else if (eta < winStart) {
        const waitTime = winStart - eta;
        conflicts.push({
          stopId: stop.id,
          stopSequence: stop.stop_sequence,
          type: "TE_VROEG",
          eta,
          windowStart: winStart,
          windowEnd: winEnd,
          waitMin: waitTime,
          message: `Stop ${stop.stop_sequence}: ETA ${formatMinutes(eta)}, venster opent ${stop.planned_window_start} (${waitTime} min wachten)`,
        });
        // Wait until window opens, then unload
        currentTime = winStart + stop.unloadMin;
      } else {
        // On time
        currentTime = eta + stop.unloadMin;
      }
    } else {
      // No window — just add unload time
      currentTime = eta + stop.unloadMin;
    }
  }

  return conflicts;
}
