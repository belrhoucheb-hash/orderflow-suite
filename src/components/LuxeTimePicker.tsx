import { useState, useRef, useEffect } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface LuxeTimePickerProps {
  value: string;          // "HH:MM" or ""
  onChange: (v: string) => void;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

export function LuxeTimePicker({ value, onChange, className }: LuxeTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [h, m] = (value || "").split(":");
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Scroll selected hour/minute into view
    setTimeout(() => {
      hourRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "center" });
      minRef.current?.querySelector("[data-selected]")?.scrollIntoView({ block: "center" });
    }, 50);
  }, [open]);

  function pick(hour: string, minute: string) {
    onChange(`${hour}:${minute}`);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "luxe-picker inline-flex items-center gap-2 h-[42px] w-full px-3",
            "bg-gradient-to-b from-white to-[hsl(var(--gold-soft)_/_0.2)]",
            "border border-[hsl(var(--gold)_/_0.25)] rounded-[0.625rem]",
            "shadow-[inset_0_1px_0_white,0_1px_2px_hsl(var(--ink)_/_0.03)]",
            "font-[var(--font-display)] text-foreground text-left cursor-pointer",
            "transition-all duration-200 hover:border-[hsl(var(--gold)_/_0.5)] hover:shadow-[inset_0_1px_0_white,0_2px_8px_hsl(var(--gold)_/_0.12)]",
            className,
          )}
        >
          <svg className="w-4 h-4 text-[hsl(var(--gold-deep))] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
          {value ? (
            <span className="text-sm font-semibold tabular-nums">{value}</span>
          ) : (
            <span className="text-xs text-muted-foreground">--:--</span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn(
          "w-auto p-2.5 rounded-2xl flex gap-2",
          "border-[hsl(var(--gold)_/_0.3)]",
          "shadow-[0_1px_0_white_inset,0_4px_12px_-2px_hsl(var(--ink)_/_0.08),0_24px_48px_-12px_hsl(var(--ink)_/_0.2)]",
          "font-[var(--font-display)]",
          "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[hsl(var(--gold)_/_0.5)] before:to-transparent before:rounded-t-2xl",
        )}
      >
        {/* Hours column */}
        <div
          ref={hourRef}
          className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-thin px-1"
          style={{ scrollSnapType: "y mandatory", scrollbarColor: "hsl(var(--gold) / 0.3) transparent" }}
        >
          {HOURS.map(hr => (
            <button
              key={hr}
              type="button"
              data-selected={hr === h ? "" : undefined}
              onClick={() => pick(hr, m || "00")}
              className={cn(
                "w-10 h-8 rounded-lg text-sm font-medium tabular-nums inline-flex items-center justify-center transition-all cursor-pointer",
                "snap-center",
                hr === h
                  ? "bg-gradient-to-b from-[hsl(0_78%_48%)] to-[hsl(0_78%_38%)] text-white font-semibold shadow-sm"
                  : "text-foreground hover:bg-[hsl(var(--gold-soft)_/_0.6)]",
              )}
            >
              {hr}
            </button>
          ))}
        </div>

        <div className="w-px bg-[hsl(var(--border)_/_0.4)] self-stretch" />

        {/* Minutes column */}
        <div
          ref={minRef}
          className="flex flex-col max-h-[220px] overflow-y-auto scrollbar-thin px-1"
          style={{ scrollSnapType: "y mandatory", scrollbarColor: "hsl(var(--gold) / 0.3) transparent" }}
        >
          {MINUTES.map(mn => (
            <button
              key={mn}
              type="button"
              data-selected={mn === m ? "" : undefined}
              onClick={() => pick(h || "08", mn)}
              className={cn(
                "w-10 h-8 rounded-lg text-sm font-medium tabular-nums inline-flex items-center justify-center transition-all cursor-pointer",
                "snap-center",
                mn === m
                  ? "bg-gradient-to-b from-[hsl(0_78%_48%)] to-[hsl(0_78%_38%)] text-white font-semibold shadow-sm"
                  : "text-foreground hover:bg-[hsl(var(--gold-soft)_/_0.6)]",
              )}
            >
              {mn}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}