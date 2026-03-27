import { useState, useMemo } from "react";
import { format, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, Truck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VehicleRow {
  id: string;
  name: string;
  plate: string;
  type: string;
  status: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  beschikbaar: { bg: "bg-emerald-500/15", text: "text-emerald-700", label: "Vrij" },
  onderweg: { bg: "bg-blue-500/15", text: "text-blue-700", label: "Onderweg" },
  onderhoud: { bg: "bg-amber-500/15", text: "text-amber-700", label: "Onderhoud" },
  defect: { bg: "bg-destructive/15", text: "text-destructive", label: "Defect" },
  "niet-beschikbaar": { bg: "bg-destructive/15", text: "text-destructive", label: "Geblokkeerd" },
};

export function VehicleAvailabilityPanel() {
  const [date, setDate] = useState<Date>(new Date());
  const [expanded, setExpanded] = useState(false);
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: vehicles = [] } = useQuery({
    queryKey: ["planning-vehicles-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, name, plate, type, status")
        .eq("is_active", true)
        .order("type");
      if (error) throw error;
      return data as VehicleRow[];
    },
  });

  const { data: availability = [] } = useQuery({
    queryKey: ["planning-availability", dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_availability")
        .select("vehicle_id, status, reason")
        .eq("date", dateStr);
      if (error) throw error;
      return data as { vehicle_id: string; status: string; reason: string | null }[];
    },
  });

  const availabilityMap = useMemo(() => {
    const m = new Map<string, { status: string; reason: string | null }>();
    for (const a of availability) m.set(a.vehicle_id, { status: a.status, reason: a.reason });
    return m;
  }, [availability]);

  const summary = useMemo(() => {
    let free = 0, busy = 0, blocked = 0;
    for (const v of vehicles) {
      const override = availabilityMap.get(v.id);
      const status = override?.status ?? v.status;
      if (status === "beschikbaar") free++;
      else if (status === "onderweg") busy++;
      else blocked++;
    }
    return { free, busy, blocked, total: vehicles.length };
  }, [vehicles, availabilityMap]);

  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr;

  return (
    <div className="rounded-xl border border-border/40 bg-card shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Truck className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-foreground">Beschikbaarheid</span>
          <div className="flex items-center gap-1.5 ml-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 border-emerald-200">
              {summary.free} vrij
            </Badge>
            {summary.busy > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 border-blue-200">
                {summary.busy} onderweg
              </Badge>
            )}
            {summary.blocked > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/20">
                {summary.blocked} geblokkeerd
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1.5 rounded-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <CalendarIcon className="h-3 w-3" />
                {isToday ? "Vandaag" : format(date, "d MMM", { locale: nl })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[60]" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border/30">
          {/* Quick date buttons */}
          <div className="flex gap-1 mb-2.5">
            {[0, 1, 2, 3, 4].map((offset) => {
              const d = addDays(new Date(), offset);
              const label = offset === 0 ? "Vandaag" : offset === 1 ? "Morgen" : format(d, "EEE d", { locale: nl });
              const isActive = format(d, "yyyy-MM-dd") === dateStr;
              return (
                <Button
                  key={offset}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[10px] px-2 rounded-md"
                  onClick={() => setDate(d)}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5">
            {vehicles.map((v) => {
              const override = availabilityMap.get(v.id);
              const effectiveStatus = override?.status ?? v.status;
              const cfg = STATUS_COLORS[effectiveStatus] || STATUS_COLORS.beschikbaar;
              return (
                <Tooltip key={v.id}>
                  <TooltipTrigger asChild>
                    <div className={cn("rounded-lg px-2.5 py-1.5 border border-border/30 cursor-default", cfg.bg)}>
                      <p className={cn("text-[11px] font-semibold truncate", cfg.text)}>{v.name}</p>
                      <p className="text-[9px] text-muted-foreground font-mono">{v.plate}</p>
                      <p className={cn("text-[9px] font-medium mt-0.5", cfg.text)}>{cfg.label}</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    <p className="font-semibold">{v.name} — {v.plate}</p>
                    <p>{cfg.label}{override?.reason ? ` · ${override.reason}` : ""}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
