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
        "inline-flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors",
        "text-[11px] font-semibold uppercase tracking-wide",
        isActive ? "text-foreground" : "text-muted-foreground/60",
        className,
      )}
    >
      {label}
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
