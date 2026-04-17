import { AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getOrderIncompleteSummary } from "@/lib/orderDisplay";
import { cn } from "@/lib/utils";

interface Props {
  order: {
    missing_fields?: string[] | null;
    missingFields?: string[] | null;
    info_status?: string | null;
    infoStatus?: string | null;
  };
  className?: string;
  /** Kleine dot voor lijsten, groter badge-icoon voor detail-header. */
  size?: "dot" | "icon";
}

/**
 * Rode waarschuwingsbadge die alleen gerenderd wordt als de order ontbrekende
 * informatie heeft. Bron: missing_fields en info_status. Tooltip somt op wat
 * mist, zodat de planner bij datumselectie direct weet welke order actie nodig
 * heeft zonder door te klikken.
 */
export function IncompleteBadge({ order, className, size = "dot" }: Props) {
  const summary = getOrderIncompleteSummary(order);
  if (!summary.incomplete) return null;

  const body = (
    <div className="space-y-1">
      <p className="text-xs font-medium">Ontbrekende informatie</p>
      {summary.infoLabel && (
        <p className="text-[11px] text-muted-foreground">Status: {summary.infoLabel}</p>
      )}
      {summary.fields.length > 0 ? (
        <ul className="text-[11px] list-disc list-inside space-y-0.5">
          {summary.fields.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">Veld niet gespecificeerd</p>
      )}
    </div>
  );

  const trigger =
    size === "dot" ? (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground",
          "h-4 w-4 text-[10px] font-bold leading-none shrink-0",
          className,
        )}
        aria-label="Ontbrekende informatie"
      >
        !
      </span>
    ) : (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-destructive/10 text-destructive border border-destructive/20",
          "px-2 py-0.5 text-xs font-medium",
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3" strokeWidth={2} />
        Incompleet
      </span>
    );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{trigger}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {body}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
