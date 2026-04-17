import { useState, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MONTHS_SHORT = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const DOW = ["ma","di","wo","do","vr","za","zo"];

interface LuxeDatePickerProps {
  value: string;          // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  className?: string;
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}
function startDow(y: number, m: number) {
  return (new Date(y, m, 1).getDay() + 6) % 7; // 0=ma
}

export function LuxeDatePicker({ value, onChange, className }: LuxeDatePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value + "T00:00:00") : null;
  const today = new Date();

  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? today.getMonth());

  const grid = useMemo(() => {
    const days: { day: number; month: number; year: number; other: boolean }[] = [];
    const sd = startDow(viewYear, viewMonth);
    const prevDays = daysInMonth(viewYear, viewMonth - 1);
    for (let i = sd - 1; i >= 0; i--) {
      days.push({ day: prevDays - i, month: viewMonth - 1, year: viewYear, other: true });
    }
    const dim = daysInMonth(viewYear, viewMonth);
    for (let d = 1; d <= dim; d++) {
      days.push({ day: d, month: viewMonth, year: viewYear, other: false });
    }
    const rem = 42 - days.length;
    for (let d = 1; d <= rem; d++) {
      days.push({ day: d, month: viewMonth + 1, year: viewYear, other: true });
    }
    return days;
  }, [viewYear, viewMonth]);

  function prev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function next() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function select(d: typeof grid[0]) {
    const mm = String(d.month + 1).padStart(2, "0");
    const dd = String(d.day).padStart(2, "0");
    const y = d.month < 0 ? d.year - 1 : d.month > 11 ? d.year + 1 : d.year;
    const realMonth = ((d.month % 12) + 12) % 12;
    onChange(`${y}-${String(realMonth + 1).padStart(2, "0")}-${dd}`);
    setOpen(false);
  }
  function goToday() {
    const t = today;
    onChange(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
    setOpen(false);
  }

  const isToday = (d: typeof grid[0]) =>
    !d.other && d.day === today.getDate() && d.month === today.getMonth() && d.year === today.getFullYear();
  const isSelected = (d: typeof grid[0]) =>
    parsed && !d.other && d.day === parsed.getDate() && d.month === parsed.getMonth() && d.year === parsed.getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "luxe-picker inline-flex items-center gap-2.5 h-[42px] w-full px-3.5",
            "bg-gradient-to-b from-white to-[hsl(var(--gold-soft)_/_0.2)]",
            "border border-[hsl(var(--gold)_/_0.25)] rounded-[0.625rem]",
            "shadow-[inset_0_1px_0_white,0_1px_2px_hsl(var(--ink)_/_0.03)]",
            "font-[var(--font-display)] text-foreground text-left cursor-pointer",
            "transition-all duration-200 hover:border-[hsl(var(--gold)_/_0.5)] hover:shadow-[inset_0_1px_0_white,0_2px_8px_hsl(var(--gold)_/_0.12)]",
            className,
          )}
        >
          <svg className="w-4 h-4 text-[hsl(var(--gold-deep))] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          {parsed ? (
            <>
              <span className="flex items-baseline gap-1">
                <span className="text-[1.125rem] font-semibold leading-none tabular-nums">{parsed.getDate()}</span>
                <span className="text-xs font-medium text-muted-foreground">{MONTHS_SHORT[parsed.getMonth()]}</span>
              </span>
              <span className="text-[11px] font-medium text-muted-foreground ml-0.5">{parsed.getFullYear()}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Kies datum</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "w-auto min-w-[320px] p-5 rounded-2xl",
          "border-[hsl(var(--gold)_/_0.3)]",
          "shadow-[0_1px_0_white_inset,0_4px_12px_-2px_hsl(var(--ink)_/_0.08),0_24px_48px_-12px_hsl(var(--ink)_/_0.2),0_0_0_1px_hsl(var(--gold)_/_0.08)]",
          "font-[var(--font-display)]",
          // gold top-line
          "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[hsl(var(--gold)_/_0.5)] before:to-transparent before:rounded-t-2xl",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3.5 border-b border-[hsl(var(--border)_/_0.4)]">
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            {MONTHS_NL[viewMonth]} <em className="not-italic text-[hsl(var(--gold-deep))] tabular-nums ml-1.5">{viewYear}</em>
          </span>
          <div className="flex gap-1">
            <button type="button" onClick={prev} className="w-7 h-7 rounded-lg border border-[hsl(var(--border)_/_0.5)] bg-white text-muted-foreground inline-flex items-center justify-center hover:border-[hsl(var(--gold)_/_0.5)] hover:text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)_/_0.5)] transition-all text-sm">&#8249;</button>
            <button type="button" onClick={next} className="w-7 h-7 rounded-lg border border-[hsl(var(--border)_/_0.5)] bg-white text-muted-foreground inline-flex items-center justify-center hover:border-[hsl(var(--gold)_/_0.5)] hover:text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)_/_0.5)] transition-all text-sm">&#8250;</button>
          </div>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 mb-1.5">
          {DOW.map(d => (
            <span key={d} className="text-center text-[0.625rem] font-semibold tracking-[0.12em] uppercase text-muted-foreground py-1.5">{d}</span>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {grid.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => select(d)}
              className={cn(
                "aspect-square inline-flex items-center justify-center text-[0.8125rem] font-medium tabular-nums rounded-lg border border-transparent cursor-pointer transition-all duration-100 select-none",
                d.other && "text-muted-foreground/35",
                !d.other && "text-foreground hover:bg-[hsl(var(--gold-soft)_/_0.6)] hover:border-[hsl(var(--gold)_/_0.3)]",
                isToday(d) && "text-[hsl(var(--gold-deep))] font-semibold relative",
                isSelected(d) && "bg-gradient-to-b from-[hsl(0_78%_48%)] to-[hsl(0_78%_38%)] text-white border-primary shadow-[0_1px_2px_hsl(var(--primary)_/_0.4),inset_0_1px_0_hsl(0_0%_100%_/_0.2)] font-semibold hover:bg-gradient-to-b hover:from-[hsl(0_78%_48%)] hover:to-[hsl(0_78%_38%)]",
              )}
            >
              {d.day}
              {isToday(d) && !isSelected(d) && (
                <span className="absolute w-[3px] h-[3px] rounded-full bg-[hsl(var(--gold))] mt-[22px]" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-3.5 pt-3.5 border-t border-[hsl(var(--border)_/_0.4)] flex justify-between items-center text-xs text-muted-foreground">
          <span>{parsed ? `${parsed.getDate()} ${MONTHS_NL[parsed.getMonth()]} ${parsed.getFullYear()}` : "Geen datum"}</span>
          <button type="button" onClick={goToday} className="text-xs font-medium text-[hsl(var(--gold-deep))] px-2 py-1 rounded-md hover:bg-[hsl(var(--gold-soft)_/_0.6)]">Vandaag</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}