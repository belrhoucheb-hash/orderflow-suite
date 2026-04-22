import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3 bg-[hsl(var(--card))]", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-display font-semibold tracking-tight text-[hsl(var(--gold-deep))]",
        nav: "space-x-1 flex items-center",
        // Navigatieknoppen in gold-soft in plaats van shadcn outline,
        // zodat ze niet contrasteren met de luxe stijl.
        nav_button: cn(
          "inline-flex items-center justify-center h-7 w-7 rounded-md p-0",
          "border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--card))] text-[hsl(var(--gold-deep))]",
          "hover:border-[hsl(var(--gold)/0.6)] hover:bg-[hsl(var(--gold-soft)/0.5)]",
          "disabled:opacity-40 disabled:pointer-events-none",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "w-9 font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--gold-deep)/0.7)]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[hsl(var(--gold-soft)/0.4)] [&:has([aria-selected])]:bg-[hsl(var(--gold-soft)/0.5)] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: "inline-flex items-center justify-center h-9 w-9 rounded-md p-0 font-normal text-sm hover:bg-[hsl(var(--gold-soft)/0.5)] hover:text-[hsl(var(--gold-deep))] aria-selected:opacity-100",
        day_range_end: "day-range-end",
        // Gold gradient in plaats van red-primary voor de geselecteerde dag.
        day_selected: cn(
          "!bg-gradient-to-b !from-[hsl(var(--gold))] !to-[hsl(var(--gold-deep))]",
          "!text-white !font-semibold shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)]",
          "hover:!from-[hsl(var(--gold-deep))] hover:!to-[hsl(var(--gold-deep))]",
          "focus:!from-[hsl(var(--gold-deep))] focus:!to-[hsl(var(--gold-deep))]",
        ),
        day_today:
          "bg-[hsl(var(--gold-soft)/0.5)] text-[hsl(var(--gold-deep))] font-semibold ring-1 ring-[hsl(var(--gold)/0.3)]",
        day_outside:
          "day-outside text-muted-foreground opacity-40 aria-selected:bg-[hsl(var(--gold-soft)/0.3)] aria-selected:text-muted-foreground aria-selected:opacity-60",
        day_disabled: "text-muted-foreground opacity-40",
        day_range_middle:
          "aria-selected:bg-[hsl(var(--gold-soft)/0.4)] aria-selected:text-[hsl(var(--gold-deep))]",
        day_hidden: "invisible",
        // Dropdown-caption layout (maand/jaar). react-day-picker rendert
        // per dropdown een onzichtbare <select> boven een zichtbaar
        // caption_label, zodat het label de display doet en de select de
        // klik afvangt. Daarom: dropdown = absolute opacity-0 overlay en
        // caption_label blijft zichtbaar. vhidden verbergt "Month:/Year:"
        // screen-reader-labels.
        caption_dropdowns: "flex justify-center gap-2",
        dropdown: "absolute inset-0 w-full opacity-0 cursor-pointer",
        dropdown_month: cn(
          "relative inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-display font-semibold tracking-tight cursor-pointer",
          "border border-[hsl(var(--gold)/0.3)] bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.35)] text-[hsl(var(--gold-deep))]",
          "hover:border-[hsl(var(--gold)/0.6)] hover:from-[hsl(var(--gold-soft)/0.25)] hover:to-[hsl(var(--gold-soft)/0.55)]",
          "shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5)]",
        ),
        dropdown_year: cn(
          "relative inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-display font-semibold tracking-tight tabular-nums cursor-pointer",
          "border border-[hsl(var(--gold)/0.3)] bg-gradient-to-b from-[hsl(var(--card))] to-[hsl(var(--gold-soft)/0.35)] text-[hsl(var(--gold-deep))]",
          "hover:border-[hsl(var(--gold)/0.6)] hover:from-[hsl(var(--gold-soft)/0.25)] hover:to-[hsl(var(--gold-soft)/0.55)]",
          "shadow-[inset_0_1px_0_hsl(0_0%_100%/0.5)]",
        ),
        vhidden: "sr-only",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
