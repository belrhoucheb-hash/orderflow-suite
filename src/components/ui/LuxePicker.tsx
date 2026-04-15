import { useEffect, useRef, useState } from "react";
import { Calendar as CalIcon, Clock as ClockIcon } from "lucide-react";

const NL_MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const NL_MONTHS_LONG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const NL_DOW = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function parseISODate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface DateProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  className?: string;
}

export function LuxeDatePicker({ value, onChange, ariaLabel = "Kies datum", className }: DateProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = parseISODate(value);
  const today = new Date();
  const [viewMonth, setViewMonth] = useState<Date>(selected ?? today);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open && selected) setViewMonth(selected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const day = selected ? selected.getDate() : "—";
  const monthShort = selected ? NL_MONTHS_SHORT[selected.getMonth()] : "";
  const year = selected ? selected.getFullYear() : "";

  // Build grid: 42 cells (6 weeks × 7 days), maandag-start
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const jsDow = first.getDay(); // 0=zon..6=zat
  const mondayOffset = (jsDow + 6) % 7; // 0=ma..6=zo
  const gridStart = new Date(first);
  gridStart.setDate(1 - mondayOffset);

  const cells: Array<{ d: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ d, inMonth: d.getMonth() === viewMonth.getMonth() });
  }

  const shiftMonth = (delta: number) => {
    const d = new Date(viewMonth);
    d.setMonth(d.getMonth() + delta);
    setViewMonth(d);
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        className="picker w-full"
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <CalIcon className="picker__icon" />
        <span className="picker__main">
          <span className="picker__day">{day}</span>
          <span className="picker__month">{monthShort}</span>
        </span>
        {year && <span className="picker__year">{year}</span>}
      </button>

      {open && (
        <div className="cal-pop" style={{ top: "calc(100% + 6px)", left: 0 }}>
          <div className="cal-head">
            <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Vorige maand">‹</button>
            <div className="cal-title">
              {NL_MONTHS_LONG[viewMonth.getMonth()]} <em>{viewMonth.getFullYear()}</em>
            </div>
            <button type="button" className="cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="Volgende maand">›</button>
          </div>
          <div className="cal-dow">
            {NL_DOW.map(d => <span key={d}>{d}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map(({ d, inMonth }, i) => {
              const isSel = selected && isSameDay(selected, d);
              const isToday = isSameDay(today, d);
              return (
                <button
                  key={i}
                  type="button"
                  className={`cal-day ${!inMonth ? "cal-day--other" : ""} ${isToday ? "cal-day--today" : ""} ${isSel ? "cal-day--selected" : ""}`}
                  onClick={() => {
                    onChange(toISODate(d));
                    setOpen(false);
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface TimeProps {
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

export function LuxeTimePicker({ value, onChange, ariaLabel = "Kies tijd", placeholder = "—:—", className }: TimeProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [h, m] = value && /^\d{2}:\d{2}$/.test(value) ? value.split(":") : ["", ""];
  const selHour = h;
  const selMinute = m;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

  const pickHour = (nh: string) => {
    onChange(`${nh}:${selMinute || "00"}`);
  };
  const pickMinute = (nm: string) => {
    onChange(`${selHour || "00"}:${nm}`);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        className="picker w-full"
        role="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        <ClockIcon className="picker__icon" />
        <span className="picker__time">{value || placeholder}</span>
      </button>

      {open && (
        <div className="time-pop" style={{ top: "calc(100% + 6px)", left: 0 }}>
          <div className="time-col">
            {hours.map(hh => (
              <button
                key={hh}
                type="button"
                className={`time-slot ${selHour === hh ? "time-slot--selected" : ""}`}
                onClick={() => pickHour(hh)}
              >
                {hh}
              </button>
            ))}
          </div>
          <div className="time-col">
            {minutes.map(mm => (
              <button
                key={mm}
                type="button"
                className={`time-slot ${selMinute === mm ? "time-slot--selected" : ""}`}
                onClick={() => pickMinute(mm)}
              >
                {mm}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LuxeTimeRange({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="time-range">
      <LuxeTimePicker value={from} onChange={onFromChange} ariaLabel="Tijd van" />
      <span className="time-range__arrow">→</span>
      <LuxeTimePicker value={to} onChange={onToChange} ariaLabel="Tijd tot" />
    </div>
  );
}
