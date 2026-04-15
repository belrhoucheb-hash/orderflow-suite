import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

interface Props {
  label: string;
  field: string;
  currentSort: SortConfig | null;
  onSort: (field: string) => void;
  className?: string;
}

export function SortableHeader({ label, field, currentSort, onSort, className }: Props) {
  const isActive = currentSort?.field === field;
  const direction = isActive ? currentSort.direction : null;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "relative inline-flex items-center gap-1 cursor-pointer transition-colors pb-0.5",
        "text-[11px] font-semibold uppercase tracking-wide",
        isActive ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground",
        className,
      )}
    >
      <span className="relative">
        {label}
        {isActive && (
          <span
            aria-hidden
            className="absolute left-0 right-0 -bottom-1 h-[1.5px] rounded-full animate-[sort-underline-in_.25s_cubic-bezier(0.4,0,0.2,1)]"
            style={{ background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--gold-deep)))" }}
          />
        )}
      </span>
      {direction === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : direction === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}
