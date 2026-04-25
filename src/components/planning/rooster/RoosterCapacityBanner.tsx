import { useMemo } from "react";
import { Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { useDriverSchedules } from "@/hooks/useDriverSchedules";
import { useExpectedDriverCount } from "@/hooks/useExpectedDriverCount";

interface Props {
  from: string;
  to: string;
  /** Optioneel filter op specifieke datums binnen de range. */
  dates?: string[];
  className?: string;
}

const SHORTAGE_FACTOR = 0.8;

interface Shortage {
  date: string;
  scheduled: number;
  expected: number;
}

/**
 * Toont een waarschuwing wanneer er op minstens een dag binnen de range
 * minder werkende chauffeurs zijn ingepland dan het historisch gemiddelde
 * voor dezelfde weekdag (drempel: minder dan 80% van het gemiddelde).
 * Verbergt zichzelf als er geen probleem is.
 */
export function RoosterCapacityBanner({
  from,
  to,
  dates,
  className,
}: Props) {
  const { schedules } = useDriverSchedules(from, to);
  const { expectedByDate } = useExpectedDriverCount({ from, to });

  const shortages = useMemo<Shortage[]>(() => {
    if (expectedByDate.size === 0) return [];

    // Aantal werkende, unieke chauffeurs per dag in de huidige planning.
    const scheduledPerDate = new Map<string, Set<string>>();
    for (const s of schedules) {
      if (s.status !== "werkt") continue;
      let set = scheduledPerDate.get(s.date);
      if (!set) {
        set = new Set<string>();
        scheduledPerDate.set(s.date, set);
      }
      set.add(s.driver_id);
    }

    const result: Shortage[] = [];
    for (const [date, expected] of expectedByDate.entries()) {
      if (dates && !dates.includes(date)) continue;
      const scheduled = scheduledPerDate.get(date)?.size ?? 0;
      if (scheduled < expected * SHORTAGE_FACTOR) {
        result.push({ date, scheduled, expected });
      }
    }
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [schedules, expectedByDate, dates]);

  if (shortages.length === 0) return null;

  const items = shortages.map((sh) => {
    const label = format(parseISO(sh.date), "EEE d MMM", { locale: nl });
    return `${label} (${sh.scheduled}/${Math.round(sh.expected)})`;
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold-soft)/0.55)] dark:border-[hsl(var(--gold)/0.55)] dark:bg-[hsl(var(--gold-soft)/0.2)] px-3 py-2 text-xs flex items-start gap-2",
        className,
      )}
      role="alert"
    >
      <Users className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0 mt-0.5" />
      <div className="text-[hsl(var(--gold-deep))] dark:text-amber-100">
        <div>
          <span className="font-medium">
            Mogelijk te weinig chauffeurs op {shortages.length} dag
            {shortages.length === 1 ? "" : "en"} deze week:
          </span>{" "}
          {items.join(", ")}
        </div>
        <div className="text-[11px] mt-0.5 text-[hsl(var(--gold-deep)/0.8)] dark:text-amber-200/80">
          Op basis van het historisch gemiddelde van dezelfde weekdag in de
          laatste 8 weken.
        </div>
      </div>
    </div>
  );
}
